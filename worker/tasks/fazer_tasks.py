"""worker/tasks/fazer_tasks.py — автовыдача через FazerCards.

  deliver_fazer_order(order_id, only_item=None)
      order_service._auto_deliver (paid) → позиции, чей товар привязан к Fazer
      (Product.meta["fazer"]) → FazerEngine.deliver → результат в
      OrderItem.delivery_data["fazer"], сообщение покупателю в чат, при неудаче —
      уведомление персоналу; если всё выдано — заказ completed.
      only_item — ручная перевыдача одной позиции из админки.

  watch_fazer (beat, каждые 5 мин)
      баланс Fazer (+ уведомление при падении ниже порога) и досмотр выданных
      заказов: поставщик может вернуть деньги ПОСЛЕ «успеха» (мы ждём финальный
      статус максимум 150 с) — тогда снимаем «выдано», заказ → processing и
      сообщаем персоналу (живой кейс UchetFP 2026-10-22, Genshin Impact).
"""

import asyncio
import html
import logging
from datetime import datetime, timedelta, timezone

from worker.main import celery_app

logger = logging.getLogger(__name__)

WATCH_HOURS = 48


@celery_app.task(name="worker.tasks.fazer_tasks.deliver_fazer_order", bind=True, max_retries=0, acks_late=True)
def deliver_fazer_order(self, order_id: str, only_item: str | None = None):
    asyncio.run(_deliver_async(order_id, only_item))


@celery_app.task(name="worker.tasks.fazer_tasks.watch_fazer")
def watch_fazer():
    asyncio.run(_watch_async())


def _is_fazer(item) -> bool:
    from api.services.fazer_service import is_fazer_product
    return is_fazer_product(item.product)


async def _notify_staff(db, text: str, order_id) -> None:
    from shared.config import settings
    from shared.staff_notify import send_staff_async
    try:
        await send_staff_async(db, text, {"inline_keyboard": [[{
            "text": "Открыть заказ",
            "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=admin_order_{order_id}",
        }]]})
    except Exception as exc:  # noqa: BLE001
        logger.warning("fazer: уведомление персоналу не ушло: %s", exc)


async def _deliver_async(order_id: str, only_item: str | None) -> None:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from api.services import fazer_config
    from api.services.fazer.engine import FazerEngine, collect_values
    from shared.database.session import get_worker_db_session
    from shared.models import Order, OrderItem, OrderStatus
    from worker.tasks.fulfillment_tasks import _finalize_if_complete, _post_results

    async with get_worker_db_session() as db:
        if not await fazer_config.is_enabled(db):
            logger.info("fazer: автовыдача выключена, order=%s", order_id)
            return
        key = await fazer_config.get_api_key(db)
        if not key:
            logger.warning("fazer: нет API-ключа, order=%s", order_id)
            return
        order = (await db.execute(
            select(Order).options(selectinload(Order.user)).where(Order.id == order_id)
        )).scalar_one_or_none()
        if order is None or order.status not in (OrderStatus.paid, OrderStatus.processing):
            logger.info("fazer: order=%s нет/статус не для выдачи", order_id)
            return
        items = [i for i in (await db.execute(
            select(OrderItem).options(selectinload(OrderItem.product)).where(OrderItem.order_id == order.id)
        )).scalars().all() if _is_fazer(i) and i.delivered_at is None]
        if only_item:
            items = [i for i in items if str(i.id) == only_item]
        else:
            # Автоповтор задачи не перевыдаёт упавшее — это решает оператор (перевыдача)
            items = [i for i in items if ((i.delivery_data or {}).get("fazer") or {}).get("state") not in ("fail",)]
        if not items:
            return

        engine = FazerEngine(key)
        results: list[tuple[bool, str]] = []
        failed: list[str] = []
        try:
            for item in items:
                mapping = item.product.meta["fazer"]
                prev = (item.delivery_data or {}).get("fazer") or {}
                attempt = int(prev.get("attempt") or 0)
                values = collect_values(order.input_data or {}, item.input_data or {})
                res = await asyncio.to_thread(
                    engine.deliver, mapping, values, int(item.quantity or 1), f"rd-{item.id}-{attempt}"
                )
                data = {**(item.delivery_data or {}), "message": res.buyer_message, "fazer": {
                    "attempt": attempt, "kind": mapping.get("kind"),
                    "state": ("pending" if res.pending else "ok") if res.ok else "fail",
                    "detail": res.detail[:1000], "cost_usd": res.cost_usd, "orders": res.orders,
                    # final=False: досмотр перепроверит заказы Fazer хотя бы раз —
                    # поставщик может вернуть деньги и после статуса «выполнен».
                    "final": not res.orders, "at": datetime.now(timezone.utc).isoformat(),
                }}
                if res.codes:
                    data["keys"] = [*((item.delivery_data or {}).get("keys") or []), *res.codes]
                item.delivery_data = data
                if res.ok:
                    item.delivered_at = datetime.now(timezone.utc)
                else:
                    failed.append(f"• {html.escape(item.product_name)}: {html.escape(res.detail[:300])}")
                results.append((res.ok, res.buyer_message))
                logger.info("fazer: item=%s ok=%s detail=%s", item.id, res.ok, res.detail)
                await db.commit()   # фиксируем каждую позицию — деньги у Fazer уже списаны
        finally:
            engine.close()

        await _post_results(db, order.id, results)
        if failed:
            await _notify_staff(
                db,
                f"🔴 <b>FazerCards: автовыдача не прошла</b>\n"
                f"Заказ {html.escape(str(order.order_number))}\n" + "\n".join(failed)
                + "\n\nПроверьте данные покупателя и нажмите «Повторить выдачу» в заказе.",
                order.id,
            )

    await _finalize_if_complete(order_id, reason="Автовыдача FazerCards")


async def _watch_async() -> None:
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload

    from api.services import fazer_config
    from api.services.fazer.client import FazerAPI, human_error, order_state, order_status_text
    from api.services.order_service import OrderService
    from shared.database.session import get_worker_db_session
    from shared.models import Order, OrderItem, OrderStatus

    async with get_worker_db_session() as db:
        if not await fazer_config.is_enabled(db):
            return
        key = await fazer_config.get_api_key(db)
        if not key:
            return
        api = FazerAPI(key)
        try:
            try:
                balance = await asyncio.to_thread(api.balance)
                if await fazer_config.store_balance(db, balance):
                    threshold = await fazer_config.get_low_threshold(db)
                    await _notify_staff_plain(
                        db, f"🟠 <b>Мало денег на FazerCards</b>\nБаланс <b>${balance:.2f}</b> "
                            f"(порог ${threshold:.2f}). Пополните, иначе автовыдача встанет.")
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                logger.info("fazer watch: баланс недоступен: %s", human_error(exc))

            since = datetime.now(timezone.utc) - timedelta(hours=WATCH_HOURS)
            rows = (await db.execute(
                select(OrderItem, Order)
                .join(Order, Order.id == OrderItem.order_id)
                .options(selectinload(OrderItem.product))
                .where(
                    Order.created_at >= since,
                    OrderItem.delivery_data.has_key("fazer"),
                    func.coalesce(OrderItem.delivery_data["fazer"]["final"].astext, "false") != "true",
                )
                .limit(40)
            )).all()
            for item, order in rows:
                fz = dict((item.delivery_data or {}).get("fazer") or {})
                orders = [dict(o) for o in fz.get("orders") or []]
                refunded = []
                for o in orders:
                    if o.get("state") == "fail" or not o.get("id"):
                        continue
                    try:
                        fresh = await asyncio.to_thread(api.get_order, o["id"])
                    except Exception as exc:  # noqa: BLE001
                        logger.info("fazer watch order %s: %s", o.get("id"), human_error(exc))
                        continue
                    o["state"], o["status"] = order_state(fresh), order_status_text(fresh)
                    if o["state"] == "fail":
                        refunded.append(o)
                fz["orders"] = orders
                fz["final"] = all(o.get("state") != "pending" for o in orders)
                fz["checked_at"] = datetime.now(timezone.utc).isoformat()
                if refunded and fz.get("state") in ("ok", "pending"):
                    fz["state"] = "refunded"
                    fz["final"] = True
                    item.delivered_at = None
                    if order.status == OrderStatus.completed:
                        try:
                            await OrderService(db).change_status(
                                order, OrderStatus.processing, changed_by_type="system",
                                reason="FazerCards вернул заказ — нужна ручная выдача")
                        except ValueError as exc:
                            logger.warning("fazer watch: статус заказа %s: %s", order.id, exc)
                    ids = ", ".join(f"{o['id']} ({o.get('status')})" for o in refunded)
                    await _notify_staff(
                        db,
                        f"🔴 <b>FazerCards вернул заказ</b>\nЗаказ {html.escape(str(order.order_number))}, "
                        f"{html.escape(item.product_name)}: поставщик отменил {html.escape(ids)} и вернул деньги. "
                        "Покупатель товар НЕ получил — выдайте вручную или повторите выдачу.",
                        order.id,
                    )
                item.delivery_data = {**(item.delivery_data or {}), "fazer": fz}
                await db.commit()
        finally:
            api.close()


async def _notify_staff_plain(db, text: str) -> None:
    from shared.staff_notify import send_staff_async
    try:
        await send_staff_async(db, text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("fazer: уведомление персоналу не ушло: %s", exc)
