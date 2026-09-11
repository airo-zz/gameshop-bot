"""worker/tasks/fulfillment_tasks.py — автовыдача через Fragment (Stars/Premium).

Тяжёлая и медленная операция (HTTP к fragment.com + перевод TON через pytoniq),
поэтому выполняется в Celery-воркере, а НЕ внутри платёжного вебхука.

Флоу:
  order_service._auto_deliver(paid) → enqueue deliver_fragment_order(order_id)
  → для позиций, чья категория имеет auto_engine (telegram_stars|telegram_premium):
      StarsEngine/PremiumEngine(cfg).deliver(ctx) → init→link→TON transfer
  → записываем результат в OrderItem.delivery_data, шлём покупателю сообщение,
    при полной выдаче завершаем заказ (paid→completed).

Секреты (cookie Fragment, seed TON) берутся из fragment_config.get_full_config
(ShopSettings, расшифровка Fernet). Движки и pytoniq импортируются лениво.
"""

import asyncio
import logging
from datetime import datetime, timezone

from worker.main import celery_app

logger = logging.getLogger(__name__)

FRAGMENT_ENGINES = ("telegram_stars", "telegram_premium")


@celery_app.task(
    name="worker.tasks.fulfillment_tasks.deliver_fragment_order",
    bind=True,
    max_retries=0,
    acks_late=True,
)
def deliver_fragment_order(self, order_id: str):
    """Выдаёт Stars/Premium через Fragment для позиций заказа с движком."""
    asyncio.run(_deliver_async(order_id))


def _make_opt(input_data: dict):
    """Строит колбэк opt(*names) — ищет значение поля покупателя по имени/подписи.

    Движки Fragment зовут ctx['opt']('username','телеграм','telegram','@') чтобы
    достать @username получателя. Матчим подстрокой по key И label поля.
    """
    entries: list[tuple[str, str]] = []
    for src in (input_data or {}).values():
        for f in (src.get("fields") or []):
            if not isinstance(f, dict):
                continue
            val = f.get("value")
            text = " ".join(
                str(x) for x in (f.get("key"), f.get("label")) if x
            ).lower()
            entries.append((text, val))

    def opt(*names):
        for n in names:
            w = str(n or "").lower().strip()
            if not w:
                continue
            for text, val in entries:
                if w in text and val:
                    return val
        return ""

    return opt


async def _deliver_async(order_id: str) -> None:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from shared.database.session import get_db_session
    from shared.models import Order, OrderItem, OrderStatus
    from shared.models.catalog import Product
    from api.services.fragment_config import get_full_config

    async with get_db_session() as db:
        cfg = await get_full_config(db)
        if not cfg.get("enabled"):
            logger.info("fragment: автовыдача выключена, order=%s", order_id)
            return
        if not cfg.get("fragment_cookie") or not cfg.get("ton_seed"):
            logger.warning("fragment: нет cookie/seed, order=%s", order_id)
            return

        order = (
            await db.execute(select(Order).where(Order.id == order_id))
        ).scalar_one_or_none()
        if order is None:
            logger.warning("fragment: заказ %s не найден", order_id)
            return
        if order.status not in (OrderStatus.paid, OrderStatus.processing):
            logger.info("fragment: order=%s статус=%s — пропуск", order_id, order.status.value)
            return

        items = list(
            (
                await db.execute(
                    select(OrderItem)
                    .options(selectinload(OrderItem.product).selectinload(Product.category))
                    .where(OrderItem.order_id == order.id)
                )
            ).scalars().all()
        )

        opt = _make_opt(order.input_data or {})

        # Ленивое создание движков (у каждого свой TonClient-поток) — по одному на тип.
        engines: dict = {}

        def _get_engine(kind: str):
            if kind not in engines:
                if kind == "telegram_stars":
                    from api.services.fragment.stars_engine import StarsEngine
                    engines[kind] = StarsEngine(cfg)
                else:
                    from api.services.fragment.premium_engine import PremiumEngine
                    engines[kind] = PremiumEngine(cfg)
            return engines[kind]

        results: list[tuple[bool, str]] = []  # (ok, buyer_message)

        for item in items:
            cat = item.product.category if item.product else None
            kind = getattr(cat, "auto_engine", None) if cat else None
            if kind not in FRAGMENT_ENGINES:
                continue
            if item.delivered_at is not None:
                continue  # уже выдано

            ctx = {
                "opt": opt,
                "cnt_goods": item.quantity,   # для Stars = кол-во звёзд
                "product_name": item.product_name,
                "options": {},
                "lot": {},
            }
            try:
                engine = _get_engine(kind)
                ok, buyer_msg, detail = await asyncio.to_thread(engine.deliver, ctx)
            except Exception as exc:  # noqa: BLE001 — движок/pytoniq не должны ронять задачу
                logger.exception("fragment: deliver крашнулся, item=%s: %s", item.id, exc)
                ok, buyer_msg, detail = (
                    False,
                    "⚠️ Небольшая задержка с выдачей. Продавец скоро завершит заказ.",
                    str(exc),
                )

            item.delivery_data = {
                **(item.delivery_data or {}),
                "fragment": {"ok": ok, "detail": detail, "cost": ctx.get("cost")},
                "message": buyer_msg,
            }
            if ok:
                item.delivered_at = datetime.now(timezone.utc)
            results.append((ok, buyer_msg))
            logger.info(
                "fragment: item=%s kind=%s ok=%s detail=%s", item.id, kind, ok, detail
            )

        await db.commit()

        if not results:
            return

        # Сообщения покупателю в чат (видно и в MiniApp, и оператору)
        await _post_results(db, order.id, results)

    # Завершение заказа — в новой сессии (после коммита выдачи)
    await _finalize_if_complete(order_id)


async def _post_results(db, order_id, results: list[tuple[bool, str]]) -> None:
    """Публикует сообщения о выдаче в чат покупателя."""
    try:
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from shared.models import Order
        from api.services.chat_service import ChatService

        order = (
            await db.execute(
                select(Order).options(selectinload(Order.user)).where(Order.id == order_id)
            )
        ).scalar_one_or_none()
        if not order or not order.user:
            return
        tg_id = order.user.telegram_id
        svc = ChatService(db)
        for _ok, msg in results:
            if msg:
                await svc.add_system_message(tg_id, msg)
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("fragment: не удалось запостить результат в чат: %s", exc)


async def _finalize_if_complete(order_id: str) -> None:
    """Если все авто-позиции выданы и нет ручных — завершает заказ (paid→completed)."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from shared.database.session import get_db_session
    from shared.models import Order, OrderItem, OrderStatus
    from shared.models.catalog import Product
    from api.services.order_service import OrderService

    async with get_db_session() as db:
        order = (
            await db.execute(select(Order).where(Order.id == order_id))
        ).scalar_one_or_none()
        if order is None or order.status != OrderStatus.paid:
            return

        items = list(
            (
                await db.execute(
                    select(OrderItem)
                    .options(selectinload(OrderItem.product).selectinload(Product.category))
                    .where(OrderItem.order_id == order.id)
                )
            ).scalars().all()
        )

        auto_items = []
        has_manual = False
        for item in items:
            cat = item.product.category if item.product else None
            kind = getattr(cat, "auto_engine", None) if cat else None
            is_fragment = kind in FRAGMENT_ENGINES
            dtype = item.product.delivery_type.value if item.product else "manual"
            is_key_auto = not is_fragment and dtype in ("auto", "mixed")
            if is_fragment or is_key_auto:
                auto_items.append(item)
            elif not is_fragment and dtype == "manual":
                has_manual = True

        if has_manual or not auto_items:
            return
        if not all(i.delivered_at is not None for i in auto_items):
            return  # что-то не выдалось — ждёт оператора

        svc = OrderService(db)
        try:
            await svc.change_status(
                order, OrderStatus.completed,
                changed_by_type="system", reason="Автовыдача Fragment",
            )
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("fragment: не удалось завершить заказ %s: %s", order_id, exc)
