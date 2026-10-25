"""worker/tasks/decor_tasks.py — синхронизация каталога украшений Discord.

Каталог (git-копия UchetFP) хост обновляет cron'ом каждые 10 минут; эта задача
раз в час приводит к нему товары reDonate. Без изменений в каталоге/ценах —
пропускается по подписи (быстро). Логика — api/services/decor_catalog.py.
"""

import asyncio
import logging

from worker.main import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.decor_tasks.sync_decor_catalog")
def sync_decor_catalog(force: bool = False):
    return asyncio.run(_sync(force))


async def _sync(force: bool) -> dict:
    from api.services.decor_catalog import sync
    from shared.database.session import get_worker_db_session

    async with get_worker_db_session() as db:
        status = await sync(db, force=force)
        await db.commit()
    if status.get("error"):
        logger.warning("decor sync: %s", status["error"])
    elif not status.get("skipped"):
        logger.info("decor sync: codes=%s created=%s hidden=%s unpriced=%s",
                    status.get("codes"), status.get("created"), status.get("hidden"),
                    sum(u["count"] for u in status.get("unpriced") or []))
    return {k: status.get(k) for k in ("codes", "created", "updated", "hidden", "skipped", "error")}
