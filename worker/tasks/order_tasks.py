"""worker/tasks/order_tasks.py — автоотмена заказов, не оплаченных за 24 часа (beat, каждые 10 мин).
Отмена идёт через OrderService.change_status — он же возвращает холд баланса и ключи."""

import asyncio
import logging
from datetime import datetime, timezone

from worker.main import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.order_tasks.expire_pending_orders")
def expire_pending_orders():
    asyncio.run(_expire_orders_async())


async def _expire_orders_async():
    from sqlalchemy import select
    from datetime import timedelta
    from shared.database.session import get_worker_db_session
    from shared.models import Order, OrderStatus

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    async with get_worker_db_session() as db:
        result = await db.execute(
            select(Order).where(
                Order.status == OrderStatus.pending_payment,
                Order.created_at < cutoff,
            )
        )
        orders = result.scalars().all()

        from api.services.order_service import OrderService

        svc = OrderService(db)

        for order in orders:
            await svc.change_status(
                order,
                OrderStatus.cancelled,
                changed_by_type="system",
                reason="Автоотмена: время оплаты истекло (24ч)",
            )
