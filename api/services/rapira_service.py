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
MARKUP_KEY = "payment_markup_percent"  # legacy единая наценка (fallback)

# Наценки по группам методов оплаты (ключи в ShopSettings).
# balance = 0 по умолчанию (комиссия уже оплачена при пополнении баланса).
MARKUP_KEYS = {
    "crypto": "markup_crypto",
    "card": "markup_card",
    "sbp": "markup_sbp",
    "balance": "markup_balance",
}
# База отображения (каталог/корзина) — БЕЗ наценки платёжки: цена как при оплате
# балансом (комиссия уже оплачена при пополнении). Наценка метода добавляется
# только на шаге оплаты (см. method_total / cart.quote). balance по умолч. = 0.
DISPLAY_GROUP = "balance"

FALLBACK_RATE = Decimal("90")
DEFAULT_MARKUP = Decimal("0")


def method_group(payment_method: str | None) -> str:
    """Сводит метод оплаты к группе наценки ('crypto'|'card'|'sbp'|'balance')."""
    m = (payment_method or "").lower()
    if m == "balance":
        return "balance"
    if m == "sbp":
        return "sbp"
    if m in ("card_yukassa", "sberpay", "card"):
        return "card"
    # crypto, usdt, ton и всё прочее — по крипте
    return "crypto"


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


async def get_group_markup(db: AsyncSession, group: str) -> Decimal:
    """Наценка группы методов. balance по умолчанию 0; остальные — с fallback на legacy."""
    key = MARKUP_KEYS.get(group, MARKUP_KEYS["crypto"])
    stored = await _get(db, key)
    if stored is None and group != "balance":
        stored = await _get(db, MARKUP_KEY)  # legacy единая (не для баланса)
    if stored:
        try:
            return Decimal(stored)
        except Exception:
            pass
    return DEFAULT_MARKUP


async def get_all_markups(db: AsyncSession) -> dict[str, float]:
    return {g: float(await get_group_markup(db, g)) for g in MARKUP_KEYS}


async def get_markup_percent(db: AsyncSession) -> Decimal:
    """Базовая наценка для кэша ₽-цены товара — по крипте (самый дешёвый метод)."""
    return await get_group_markup(db, DISPLAY_GROUP)
