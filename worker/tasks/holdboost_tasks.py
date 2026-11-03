"""
worker/tasks/holdboost_tasks.py
─────────────────────────────────────────────────────────────────────────────
Наличие бустов Discord у поставщика HoldBoost → «Нет в наличии» у нас.

HoldBoost отдаёт запас открыто, без ключа:
  GET https://api.holdboost.store/v1/boosts/stock → {"data": {"month1": 4652, "month3": 1132}}
(число бустов в запасе на 1 и 3 месяца) и GET /v1/status → boost_service_available.

Товары-бусты помечены в products.meta.holdboost = {"months": 1|3, "amount": N}.
Товар доступен, если сервис работает и запаса хватает на его количество
(HoldBoost принимает от 2 бустов — заказ «1 буст» оператор оформляет как 2).
Если HoldBoost не ответил — наличие не трогаем (лучше продать, чем закрыть всё
из-за сбоя сети; оператор всё равно покупает вручную).
─────────────────────────────────────────────────────────────────────────────
"""

import logging

import httpx
from sqlalchemy import text as sa_text

from shared.config import settings
from worker.main import celery_app

logger = logging.getLogger(__name__)

API = "https://api.holdboost.store"
MIN_AMOUNT = 2


def _fetch() -> dict | None:
    """{"month1": int, "month3": int} или None, если HoldBoost недоступен."""
    try:
        with httpx.Client(timeout=15) as c:
            status = c.get(f"{API}/v1/status").json().get("data") or {}
            stock = (status.get("stock") or c.get(f"{API}/v1/boosts/stock").json().get("data") or {})
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("holdboost: нет ответа: %s", exc)
        return None
    if status.get("boost_service_available") is False:
        return {"month1": 0, "month3": 0}
    try:
        return {"month1": int(stock["month1"]), "month3": int(stock["month3"])}
    except (KeyError, TypeError, ValueError):
        logger.warning("holdboost: неожиданный ответ: %s", stock)
        return None


@celery_app.task(name="worker.tasks.holdboost_tasks.sync_holdboost_stock")
def sync_holdboost_stock() -> dict:
    stock = _fetch()
    if stock is None:
        return {"skipped": True}
    from sqlalchemy import create_engine

    engine = create_engine(settings.sync_url, pool_pre_ping=True)
    try:
        with engine.begin() as conn:
            res = conn.execute(sa_text("""
                UPDATE products p SET is_out_of_stock = NOT (
                    GREATEST(CAST(p.meta->'holdboost'->>'amount' AS int), :min_amount)
                    <= CASE p.meta->'holdboost'->>'months' WHEN '3' THEN :m3 ELSE :m1 END
                ), updated_at = now()
                WHERE p.meta ? 'holdboost'
                  AND p.is_out_of_stock IS DISTINCT FROM NOT (
                    GREATEST(CAST(p.meta->'holdboost'->>'amount' AS int), :min_amount)
                    <= CASE p.meta->'holdboost'->>'months' WHEN '3' THEN :m3 ELSE :m1 END
                  )
            """), {"m1": stock["month1"], "m3": stock["month3"], "min_amount": MIN_AMOUNT})
    finally:
        engine.dispose()
    if res.rowcount:
        logger.info("holdboost: наличие обновлено у %s товаров (запас %s)", res.rowcount, stock)
    return {"stock": stock, "changed": res.rowcount}
