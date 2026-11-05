"""worker/tasks/loyalty_tasks.py — ночной пересчёт уровней кэшбэка (beat, 03:00)."""

import asyncio
import logging

from worker.main import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.loyalty_tasks.recalculate_all_loyalty")
def recalculate_all_loyalty():
    """Пересчитывает уровни лояльности для всех активных пользователей."""
    asyncio.run(_recalculate_all_async())


async def _recalculate_all_async():
    from sqlalchemy import select
    from api.services.loyalty_service import LoyaltyService
    from shared.database.session import get_worker_db_session
    from shared.models import User

    # Уровень считается по тратам за месяц (модель Bybit) — экраны считают его
    # на лету, здесь только освежаем кэш users.loyalty_level_id (админка, аналитика),
    # в т.ч. понижение после смены месяца.
    async with get_worker_db_session() as db:
        svc = LoyaltyService(db)
        offset = 0
        while True:
            users_result = await db.execute(
                select(User).where(User.is_blocked == False)  # noqa: E712
                .order_by(User.id).offset(offset).limit(100)
            )
            users = users_result.scalars().all()
            if not users:
                break
            for user in users:
                await svc.get_status(user)
            offset += 100
