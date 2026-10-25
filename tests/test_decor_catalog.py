"""
Украшения Discord: таблица цен в формате лота GGSel (как в UchetFP) и расчёт цены кода.
LOT_TIERS — тот же образец, что в тестах UchetFP (ggsel_bot/tests/test_discord_decor.py).
"""

from api.services.decor_catalog import parse_price_tiers, price_rub

LOT_TIERS = """НАБОР с ценой · 390₽ – 450₽ (8,99$ – 10,99$)(+489 ₽)
  НАБОР с ценой · 435₽ – 485₽ (9,99$ – 12,99$)(+569 ₽)
  НАБОР с ценой · 535₽ – 619₽ (15,99$ – 20,99$)(+829 ₽)
  НАБОР с ценой · 550₽ – 619₽ (16,99$ – 21,99$)(+829 ₽)
  НАБОР с ценой · 635₽ – 750₽ (21,99$ – 28,99$)(+1 069 ₽)
  УКРАШЕНИЕ с ценой · 219₽ – 260₽ (4,99$ – 5,99$)(+289 ₽)
  УКРАШЕНИЕ с ценой · 390₽ – 450₽ (8,99$ – 10,99$)(+519 ₽)
  мусорная строка без цены
  УКРАШЕНИЕ без рублей (4,99$ – 5,99$)"""


def test_parse_tiers_kinds_ranges_and_rub_with_spaces():
    tiers = parse_price_tiers(LOT_TIERS)
    assert len(tiers) == 7
    assert tiers[0] == ("набор", 8.99, 10.99, 489)
    assert tiers[4] == ("набор", 21.99, 28.99, 1069)        # «1 069 ₽» с пробелом
    assert tiers[5] == ("украшение", 4.99, 5.99, 289)


def test_price_by_kind_and_nitro_price():
    tiers = parse_price_tiers(LOT_TIERS)
    set_899 = {"kind": "set", "price_usd": 8.99, "expected_tzs": 11800}
    item_899 = {"kind": "item", "price_usd": 8.99, "expected_tzs": 11800}
    assert price_rub(set_899, tiers, 0) == 489                # набор и украшение по 8,99$ — разные цены
    assert price_rub(item_899, tiers, 0) == 519
    assert price_rub(set_899, tiers, 10) == 499               # + базовая цена лота


def test_unpriced_and_not_for_sale_are_hidden():
    tiers = parse_price_tiers(LOT_TIERS)
    assert price_rub({"kind": "set", "price_usd": 13.99, "expected_tzs": 1}, tiers, 0) is None   # нет строки
    assert price_rub({"kind": "set", "price_usd": 8.99, "expected_tzs": None}, tiers, 0) is None  # не продаётся
    assert price_rub({"kind": "set", "price_usd": 8.99, "expected_tzs": 1}, [], 0) is None        # таблица пуста


def test_same_nitro_price_picks_cheaper_variant():
    tiers = [("набор", 15.99, 20.99, 829), ("набор", 15.99, 21.99, 900)]
    assert price_rub({"kind": "set", "price_usd": 15.99, "expected_tzs": 1}, tiers, 0) == 829


def test_decor_seo_texts_are_russian_and_keep_collection_case():
    from types import SimpleNamespace
    from api.services.seo_content import game_seo
    g = SimpleNamespace(name="Украшения Discord", type="service", meta={"decor_catalog": True},
                        seo_title="", seo_description="", seo_text="", seo_aliases="", description="", slug="discord-decor")
    page = game_seo(g, ["Кошмар перед Рождеством", "Dead by Daylight"], 289, False, 6)
    assert page.title == "Купить украшения Discord — наборы, рамки и эффекты профиля"
    assert page.h1 == "Украшения Discord"
    assert "Пополн" not in page.title + page.h1 + page.description
    assert "Кошмар перед Рождеством" in page.description and "от 289" in page.description
