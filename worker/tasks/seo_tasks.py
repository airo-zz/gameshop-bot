"""worker/tasks/seo_tasks.py — уведомление поисковиков (IndexNow) о новых и изменённых страницах."""

import asyncio
import logging

from worker.main import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.seo_tasks.submit_indexnow")
def submit_indexnow(force: bool = False):
    asyncio.run(_submit_async(force))


async def _submit_async(force: bool):
    import httpx
    import redis.asyncio as aioredis

    from api.services.seo_feeds import submit_indexnow as _submit
    from shared.config import settings
    from shared.database.session import get_worker_db_session

    r = aioredis.from_url(settings.REDIS_URL)
    try:
        async with get_worker_db_session() as db:
            await _submit(db, r, force=force)
    except (httpx.HTTPError, RuntimeError) as exc:  # сеть/IndexNow недоступен — повторим завтра
        logger.warning("IndexNow submit failed: %s", exc)
    finally:
        await r.aclose()
