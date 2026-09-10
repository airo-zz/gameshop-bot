"""
api/services/rapira_service.py
─────────────────────────────────────────────────────────────────────────────
Курс USD/RUB с биржи RAPIRA (пара USDT/RUB) + чтение наценки платёжки.

Курс и наценка хранятся в ShopSettings (key-value). Курс обновляет Celery-задача
2×/сутки; в запросах читаем сохранённое значение (быстро). При отсутствии —
разовый запрос к API; при полном сбое — FALLBACK_RATE.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import ShopSettings

RAPIRA_URL = "https://api.rapira.net/open/market/rates"
SYMBOL = "USDT/RUB"

RATE_KEY = "usd_rub_rate"
RATE_UPDATED_KEY = "usd_rub_rate_updated_at"
MARKUP_KEY = "payment_markup_percent"

FALLBACK_RATE = Decimal("90")
DEFAULT_MARKUP = Decimal("0")


async def fetch_rapira_rate() -> Decimal:
    """Запрашивает актуальный курс USDT/RUB (close) у RAPIRA."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(RAPIRA_URL, headers={"Accept": "application/json"})
        resp.raise_for_status()
        payload = resp.json()

    for item in payload.get("data", []):
        if item.get("symbol") == SYMBOL:
            value = item.get("close") or item.get("askPrice")
            if value:
                return Decimal(str(value))
    raise ValueError("Пара USDT/RUB не найдена в ответе RAPIRA")


async def _get(db: AsyncSession, key: str) -> str | None:
    row = await db.get(ShopSettings, key)
    return row.value if row else None


async def _set(db: AsyncSession, key: str, value: str, description: str | None = None) -> None:
    row = await db.get(ShopSettings, key)
    if row:
        row.value = value
        if description:
            row.description = description
    else:
        db.add(ShopSettings(key=key, value=value, description=description))


async def set_usd_rub_rate(db: AsyncSession, rate: Decimal) -> None:
    await _set(db, RATE_KEY, str(rate), "Курс USD/RUB (RAPIRA, USDT/RUB close)")
    await _set(db, RATE_UPDATED_KEY, datetime.now(timezone.utc).isoformat(), "Когда обновлён курс USD/RUB")


async def get_usd_rub_rate(db: AsyncSession) -> Decimal:
    """Возвращает сохранённый курс; при отсутствии — тянет и сохраняет; иначе FALLBACK."""
    stored = await _get(db, RATE_KEY)
    if stored:
        try:
            return Decimal(stored)
        except Exception:
            pass
    try:
        rate = await fetch_rapira_rate()
        await set_usd_rub_rate(db, rate)
        return rate
    except Exception:
        return FALLBACK_RATE


async def refresh_usd_rub_rate(db: AsyncSession) -> Decimal:
    """Принудительно обновляет курс из API (для Celery-задачи 2×/сутки)."""
    rate = await fetch_rapira_rate()
    await set_usd_rub_rate(db, rate)
    return rate


async def get_markup_percent(db: AsyncSession) -> Decimal:
    stored = await _get(db, MARKUP_KEY)
    if stored:
        try:
            return Decimal(stored)
        except Exception:
            pass
    return DEFAULT_MARKUP
