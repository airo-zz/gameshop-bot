"""worker/tasks/pricing_tasks.py — обновление курса USD/RUB (RAPIRA) 2×/сутки.

После обновления курса пересчитывает ₽-цену всех товаров, у которых задана
цена в USD (price_usd), с учётом текущей наценки платёжки и округления.
"""

import asyncio
import logging

from worker.main import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="worker.tasks.pricing_tasks.refresh_usd_rate", bind=True, max_retries=3
)
def refresh_usd_rate(self):
    asyncio.run(_refresh_async())


async def _refresh_async():
    from decimal import Decimal

    from sqlalchemy import select

    from shared.database.session import get_worker_db_session
    from shared.models import Product
    from api.services.pricing import usd_to_rub
    from api.services.rapira_service import get_markup_percent, refresh_usd_rub_rate

    async with get_worker_db_session() as db:
        try:
            rate = await refresh_usd_rub_rate(db)
        except Exception as exc:  # noqa: BLE001 — сетевой сбой не должен ронять задачу
            logger.warning("RAPIRA rate refresh failed: %s", exc)
            return

        markup = float(await get_markup_percent(db))

        from api.services.pricing import has_quantity_field

        result = await db.execute(select(Product).where(Product.price_usd.is_not(None)))
        products = result.scalars().all()
        for p in products:
            round_nine = not has_quantity_field(p.input_fields)
            p.price = Decimal(str(usd_to_rub(float(p.price_usd), float(rate), markup, round_nine)))

        await db.commit()
        logger.info("USD/RUB=%s, пересчитано товаров: %d", rate, len(products))
