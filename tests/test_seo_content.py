"""Склонение названий разделов в SEO-заголовках («Купить …»)."""

import pytest

from api.services.seo_content import accusative


@pytest.mark.parametrize("phrase, expected", [
    ("Платина", "Платину"),
    ("Премиум подписка", "Премиум подписку"),
    ("Золотая карта", "Золотую карту"),
    ("Бриллианты", "Бриллианты"),
    ("Пропуск Эпизода", "Пропуск Эпизода"),
    # аббревиатуры и уточнение после тире не склоняются
    ("Карты PlayStation США", "Карты PlayStation США"),
    ("GTA 6 PS5 — Турция", "GTA 6 PS5 — Турция"),
])
def test_accusative(phrase, expected):
    assert accusative(phrase) == expected
