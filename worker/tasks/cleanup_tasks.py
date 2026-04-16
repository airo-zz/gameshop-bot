"""worker/tasks/cleanup_tasks.py — задачи очистки устаревших данных"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from worker.main import celery_app

logger = logging.getLogger(__name__)

# Soft-deleted orders are kept for this many days before permanent deletion.
TRASH_RETENTION_DAYS = 7


@celery_app.task(
    name="worker.tasks.cleanup_tasks.purge_old_deleted_orders",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def purge_old_deleted_orders(self) -> dict:
    """
    Перманентно удаляет мягко удалённые заказы старше TRASH_RETENTION_DAYS дней.
    Запускается раз в сутки через Beat. Каскадное удаление дочерних записей
    (payments, status_history, discount_log, items) выполняется на уровне БД.
    """
    import asyncio

    async def _run() -> int:
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
        from sqlalchemy.orm import sessionmaker

        from shared.config import settings
        from shared.models.order import Order

        engine = create_async_engine(settings.DATABASE_URL, echo=False)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)
        deleted_count = 0

        try:
            async with async_session() as session:
                result = await session.execute(
                    select(Order).where(
                        Order.deleted_at.is_not(None),
                        Order.deleted_at < cutoff,
                    )
                )
                orders = result.scalars().all()

                for order in orders:
                    await session.delete(order)
                    deleted_count += 1

                await session.commit()
        finally:
            await engine.dispose()

        return deleted_count

    try:
        deleted = asyncio.get_event_loop().run_until_complete(_run())
        logger.info("purge_old_deleted_orders: permanently deleted %d orders", deleted)
        return {"deleted": deleted}
    except Exception as exc:
        logger.exception("purge_old_deleted_orders failed: %s", exc)
        raise self.retry(exc=exc)
