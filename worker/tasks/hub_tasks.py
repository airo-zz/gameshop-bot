"""worker/tasks/hub_tasks.py — чаты reDonate в хабе UchetFP (логика — api/services/hub_bridge).

  push_to_hub(msg_id, chat_id)
      ChatService.send_message → копия сообщения в хаб. Первый раз для чата — вместе
      с историей (ключ hub:seeded:<chat_id>), дальше по одному. Хаб недоступен —
      ретраи с паузой, чат магазина от этого не зависит.

  poll_hub (beat, каждые 5 с)
      ответы ночника из хаба → чат покупателя (+ ack), раз в минуту heartbeat.
      Redis-замок — один опрос за раз, даже если задачи скопились.
"""

import asyncio
import logging

from worker.main import celery_app

logger = logging.getLogger(__name__)

SEEDED_TTL = 30 * 86400


def _redis():
    import redis.asyncio as aioredis

    from shared.config import settings

    return aioredis.from_url(settings.REDIS_URL)


@celery_app.task(name="worker.tasks.hub_tasks.push_to_hub", bind=True, max_retries=8)
def push_to_hub(self, msg_id: str, chat_id: str):
    try:
        ok = asyncio.run(_push_async(msg_id, chat_id))
    except Exception as exc:  # noqa: BLE001 — сеть/хаб: повторим позже
        logger.info("hub push %s: %s — повтор", msg_id, exc)
        raise self.retry(exc=exc, countdown=min(300, 10 * 2 ** self.request.retries))
    if not ok:
        # Сообщения ещё нет в БД — транзакция отправителя не закоммичена
        raise self.retry(countdown=2, max_retries=5)


async def _push_async(msg_id: str, chat_id: str) -> bool:
    from api.services import hub_bridge
    from shared.database.session import get_worker_db_session

    r = _redis()
    try:
        seeded_key = f"hub:seeded:{chat_id}"
        with_history = not await r.exists(seeded_key)
        async with get_worker_db_session() as db:
            ok = await hub_bridge.push_message(db, msg_id, with_history)
        if ok and with_history:
            await r.set(seeded_key, "1", ex=SEEDED_TTL)
        return ok
    finally:
        await r.aclose()


@celery_app.task(name="worker.tasks.hub_tasks.push_order_to_hub", bind=True, max_retries=8)
def push_order_to_hub(self, order_id: str, status: str | None = None):
    """Заказ в учёт хаба (api/services/hub_orders.push_order). status — каким заказ
    должен быть в БД: пока транзакция смены статуса не закоммичена, ждём."""
    try:
        ok = asyncio.run(_push_order_async(order_id, status))
    except Exception as exc:  # noqa: BLE001 — сеть/хаб: повторим позже
        logger.info("hub order push %s: %s — повтор", order_id, exc)
        raise self.retry(exc=exc, countdown=min(300, 10 * 2 ** self.request.retries))
    if not ok:
        raise self.retry(countdown=3, max_retries=5)


async def _push_order_async(order_id: str, status: str | None) -> bool:
    from api.services import hub_orders
    from shared.database.session import get_worker_db_session

    async with get_worker_db_session() as db:
        return await hub_orders.push_order(db, order_id, status)


@celery_app.task(name="worker.tasks.hub_tasks.backfill_orders_to_hub")
def backfill_orders_to_hub(days: int = 7) -> int:
    """Разово: оплаченные за `days` дней заказы → хаб (после подключения связи)."""
    return asyncio.run(_backfill_async(days))


async def _backfill_async(days: int) -> int:
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from shared.database.session import get_worker_db_session
    from shared.models import Order

    since = datetime.now(timezone.utc) - timedelta(days=days)
    async with get_worker_db_session() as db:
        ids = (await db.execute(
            select(Order.id).where(Order.paid_at >= since, Order.deleted_at.is_(None))
        )).scalars().all()
    for oid in ids:
        push_order_to_hub.delay(str(oid))
    return len(ids)


@celery_app.task(name="worker.tasks.hub_tasks.poll_hub", ignore_result=True)
def poll_hub():
    asyncio.run(_poll_async())


async def _poll_async() -> None:
    from api.services import hub_bridge
    from shared.database.session import get_worker_db_session

    r = _redis()
    try:
        if not await r.set("hub:poll:lock", "1", nx=True, ex=30):
            return
        try:
            heartbeat = bool(await r.set("hub:heartbeat", "1", nx=True, ex=60))
            async with get_worker_db_session() as db:
                n = await hub_bridge.poll_once(db, r, heartbeat)
            if n:
                logger.info("hub: доставлено ответов из хаба: %s", n)
        finally:
            await r.delete("hub:poll:lock")
    finally:
        await r.aclose()
