"""tests/test_loyalty.py — чистые тесты расчёта лояльности (без БД)."""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from api.services.loyalty_service import MSK, LoyaltyService, month_bounds


def _levels():
    return [
        SimpleNamespace(name=n, min_spent=Decimal(m))
        for n, m in [("Старт", 0), ("Бронза", 2000), ("Серебро", 5000), ("Золото", 10000)]
    ]


def test_level_for_thresholds():
    levels = _levels()
    assert LoyaltyService.level_for(Decimal("0"), levels).name == "Старт"
    assert LoyaltyService.level_for(Decimal("1999.99"), levels).name == "Старт"
    assert LoyaltyService.level_for(Decimal("2000"), levels).name == "Бронза"
    assert LoyaltyService.level_for(Decimal("9999"), levels).name == "Серебро"
    assert LoyaltyService.level_for(Decimal("500000"), levels).name == "Золото"
    assert LoyaltyService.level_for(Decimal("10"), []) is None


def test_month_bounds_msk():
    # 31 октября 22:30 UTC = 1 ноября 01:30 МСК → уже ноябрь
    now = datetime(2026, 10, 31, 22, 30, tzinfo=timezone.utc)
    start, end = month_bounds(now)
    assert start == datetime(2026, 11, 1, tzinfo=MSK)
    assert end == datetime(2026, 12, 1, tzinfo=MSK)

    prev_start, prev_end = month_bounds(now, shift=-1)
    assert prev_start == datetime(2026, 10, 1, tzinfo=MSK)
    assert prev_end == start


def test_month_bounds_year_wrap():
    jan = datetime(2027, 1, 15, 12, 0, tzinfo=timezone.utc)
    prev_start, prev_end = month_bounds(jan, shift=-1)
    assert prev_start == datetime(2026, 12, 1, tzinfo=MSK)
    assert prev_end == datetime(2027, 1, 1, tzinfo=MSK)

    dec = datetime(2026, 12, 15, 12, 0, tzinfo=timezone.utc)
    assert month_bounds(dec)[1] == datetime(2027, 1, 1, tzinfo=MSK)
