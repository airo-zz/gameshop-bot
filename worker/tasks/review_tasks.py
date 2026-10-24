"""worker/tasks/review_tasks.py — подтягивание новых отзывов с GGSEL."""

import asyncio
import logging

from worker.main import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.review_tasks.sync_ggsel_reviews")
def sync_ggsel_reviews(full: bool = False):
    asyncio.run(_sync_async(full))


async def _sync_async(full: bool):
    from api.services.ggsel_reviews import GgselError, sync_ggsel_reviews as _sync
    from shared.config import settings
    from shared.database.session import get_worker_db_session

    if not settings.GGSEL_API_KEY:
        return
    async with get_worker_db_session() as db:
        try:
            await _sync(db, full=full)
        except (GgselError, OSError) as exc:  # сеть/GGSEL лежит — попробуем в следующий раз
            logger.warning("GGSEL reviews sync failed: %s", exc)
