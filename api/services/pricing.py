"""
api/services/pricing.py
─────────────────────────────────────────────────────────────────────────────
Расчёт розничной ₽-цены из себестоимости в USD.

Формула: RUB = USD × курс_RAPIRA × (1 + наценка_платёжки%)  → округление «в 9».
Округление к БЛИЖАЙШЕМУ числу, оканчивающемуся на 9 (сумма < 1000 ₽) или на 90
(сумма ≥ 1000 ₽). Примеры: 145→149, 143→139, 1234→1190, 1260→1290.
"""

from __future__ import annotations


def round_to_nine(amount: float) -> int:
    """Округляет сумму к ближайшему …9 (<1000) или …90 (≥1000)."""
    a = max(0.0, float(amount))
    if a < 1000:
        n = round((a - 9) / 10) * 10 + 9
        return int(max(9, n))
    n = round((a - 90) / 100) * 100 + 90
    return int(max(90, n))


def usd_to_rub(usd: float, rate: float, markup_percent: float = 0.0) -> int:
    """
    Итоговая ₽-цена для покупателя из цены в USD.

    Args:
        usd: цена в долларах (себестоимость + твоя наценка).
        rate: курс USD/RUB (RUB за 1 USD, из RAPIRA — USDT/RUB close).
        markup_percent: наценка платёжной системы, %.
    """
    raw = float(usd) * float(rate) * (1 + float(markup_percent) / 100)
    return round_to_nine(raw)


def method_total(base_rub: float, crypto_markup: float, method_markup: float) -> int:
    """
    Итог по способу оплаты. base_rub уже посчитан с крипто-наценкой (база показа);
    множитель приводит его к наценке выбранного метода. Округление «в 9».
    """
    denom = 1 + float(crypto_markup) / 100
    mult = (1 + float(method_markup) / 100) / denom if denom else 1.0
    return round_to_nine(float(base_rub) * mult)


def rub_to_usd(rub: float, rate: float) -> float:
    """Обратная конверсия ₽→USD (для импорта CSV: суммы оффера в ₽ → USD)."""
    if rate <= 0:
        return 0.0
    return round(float(rub) / float(rate), 4)
