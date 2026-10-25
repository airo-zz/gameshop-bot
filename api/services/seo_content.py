"""
api/services/seo_content.py
─────────────────────────────────────────────────────────────────────────────
Тексты страниц игр и разделов для поисковиков: заголовок, описание, H1,
вопросы-ответы. Один источник для серверной версии страницы (api/routers/seo.py)
и для сайта (GET /catalog/games/{slug}/seo) — робот и человек видят одно и то же.

Целевые запросы: «донат <игра>», «купить <валюта> <игра>», «пополнить <игра>»,
плюс другие названия игры из админки (games.seo_aliases: «Битва замков»).
Свои заголовок/описание из админки (seo_title / seo_description) важнее
сгенерированных.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal

BRAND = "reDonate"
TITLE_MAX = 70


def money(v: object) -> str:
    n = float(v)
    s = f"{n:,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
    return f"{s} ₽"


def clean_name(name: str) -> str:
    """Название раздела без эмодзи и лишних пробелов: «🎫 Пропуск» → «Пропуск»."""
    s = re.sub(r"[^\w\s.,:;!?()«»\"'+\-—–/&%#№]", "", name or "", flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def aliases(game) -> list[str]:
    raw = getattr(game, "seo_aliases", None) or ""
    seen, out = set(), []
    for part in re.split(r"[\n,;]+", raw):
        a = part.strip()
        if a and a.lower() != game.name.lower() and a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return out[:8]


@dataclass
class PageSeo:
    title: str
    description: str
    h1: str
    intro: str
    aliases: list[str] = field(default_factory=list)
    text: str | None = None


def _fit(*variants: str) -> str:
    """Первый вариант заголовка, который помещается в TITLE_MAX."""
    for v in variants:
        if len(v) <= TITLE_MAX:
            return v
    return variants[-1][:TITLE_MAX].rstrip()


def _lower_first(s: str) -> str:
    """«Бриллианты» → «бриллианты»; латиницу и аббревиатуры не трогаем (Discord Nitro, FC Поинты)."""
    if not s or s[:2].isupper() or not re.match(r"[А-ЯЁ]", s[0]):
        return s
    return s[0].lower() + s[1:]


_INDECLINABLE = {"премиум", "vip", "мега", "супер"}


def accusative(phrase: str) -> str:
    """
    Винительный падеж названия раздела после «купить» / «цены на»:
    «Платина» → «платину», «Премиум подписка» → «премиум подписку»,
    «Золотая карта» → «золотую карту». Множественное число и мужской род
    не меняются («Бриллианты», «Боевой пропуск», «Наборы Новичка»).
    """
    words = phrase.split(" ")
    for i, w in enumerate(words):
        low = w.lower()
        if not re.fullmatch(r"[А-Яа-яЁё-]+", w) or low in _INDECLINABLE:
            continue  # латиница, индекс, «премиум» — смотрим дальше
        if low.endswith(("ая", "яя")):
            words[i] = w[:-2] + ("ую" if low.endswith("ая") else "юю")
            continue  # прилагательное — дальше существительное
        if low.endswith(("ый", "ий", "ой", "ые", "ие")):
            continue  # прилагательное мужского рода / мн. числа
        if low.endswith(("а", "я")) and len(low) > 2:
            words[i] = w[:-1] + ("у" if low.endswith("а") else "ю")
        break  # главное слово найдено — дальше не трогаем («Пропуск Эпизода»)
    return " ".join(words)


def game_seo(game, cat_names: list[str], min_price: Decimal | float | None,
             has_auto: bool, top_cashback: float | None) -> PageSeo:
    name = game.name
    if (getattr(game, "meta", None) or {}).get("decor_catalog"):
        return _decor_seo(game, cat_names, min_price, top_cashback)
    names = [clean_name(c) for c in cat_names if clean_name(c)]
    what = ", ".join(_lower_first(n) for n in names[:3]) or "внутриигровая валюта и наборы"
    al = aliases(game)
    service = getattr(game, "type", "game") == "service"

    # Короткий заголовок как у маркетплейсов («Донат Raid: Shadow Legends»):
    # название сайта Google показывает отдельно, над результатом
    title = (game.seo_title or "").strip() or (f"Пополнение {name}" if service else f"Донат {name}")
    cashback = f", кэшбэк до {top_cashback:g}% на баланс" if top_cashback else ""
    also = f" ({', '.join(al[:2])})" if al else ""
    description = (game.seo_description or "").strip() or (
        (f"Здесь вы можете пополнить {name}{also} по выгодной цене: {what} и другое. "
         if service else
         f"Здесь вы можете купить донат для {name}{also} по выгодной цене: {what} и другое. ")
        + (f"Цены от {money(min_price)}. " if min_price else "")
        + f"Оплата через СБП, банковской картой или криптовалютой{cashback}."
    )[:320]
    h1 = f"Донат {name}" if not service else f"Пополнение {name}"
    intro = ((game.description or "").strip()
             or f"Купить {what} для {name} онлайн: оплата через СБП, банковской картой или криптовалютой.")

    return PageSeo(title, description, h1, intro, al, (game.seo_text or "").strip() or None)


def _decor_seo(game, cat_names: list[str], min_price, top_cashback) -> PageSeo:
    """Каталог украшений Discord: «пополнить украшения» не по-русски — свои тексты.
    Коллекции — в исходном регистре (это названия, «Кошмар перед Рождеством»)."""
    names = [clean_name(c) for c in cat_names if clean_name(c)][:3]
    title = (game.seo_title or "").strip() or "Купить украшения Discord — наборы, рамки и эффекты профиля"
    cashback = f", кэшбэк до {top_cashback:g}%" if top_cashback else ""
    description = (game.seo_description or "").strip() or (
        "Украшения Discord подарком на ваш аккаунт: наборы, декорации аватара, эффекты и рамки "
        "профиля, бейджики. Nitro не нужен"
        + (f". Коллекции {', '.join(names)} и другие" if names else "")
        + (f". Цены от {money(min_price)}" if min_price else "")
        + f". Оплата через СБП, картой или криптовалютой{cashback}."
    )[:320]
    intro = ((game.description or "").strip()
             or "Выберите украшение — после оплаты придёт ссылка на подарок Discord.")
    return PageSeo(title, description, game.name, intro, aliases(game), (game.seo_text or "").strip() or None)


def category_seo(game, cat, min_price: Decimal | float | None, has_auto: bool) -> PageSeo:
    name, cname = game.name, clean_name(cat.name) or cat.name
    lc = _lower_first(accusative(cname))
    # «Discord Nitro» в игре Discord — не повторяем название игры
    suffix = "" if name.lower() in cname.lower() else f" {name}"
    title = _fit(f"Купить {lc}{suffix}", f"{cname}{suffix}")
    description = (
        f"Здесь вы можете купить {lc}{'' if not suffix else ' для ' + name} по выгодной цене"
        + (f" — от {money(min_price)}" if min_price else "")
        + ". Оплата через СБП, банковской картой или криптовалютой, кэшбэк на баланс."
    )[:320]
    intro = ((getattr(cat, "description", None) or "").strip()
             or f"{cname}{suffix} — выберите вариант и оплатите онлайн.")
    return PageSeo(title, description, f"{cname}{suffix}", intro, aliases(game), None)


# ── Данные страницы ──────────────────────────────────────────────────────────

def _is_auto(p) -> bool:
    dt = getattr(p, "delivery_type", None)
    return str(getattr(dt, "value", dt) or "").startswith("auto")


async def load_game_page(db, slug: str, cat_slug: str | None = None):
    """
    Данные страницы игры/раздела: (game, roots, offers, current_cat, seo) или None.
    offers — [(раздел, товар)] текущей страницы (для раздела — только его товары).
    Используется и серверной версией страницы, и GET /catalog/games/{slug}/seo.
    """
    from api.services.catalog_service import CatalogService
    from api.services.loyalty_service import LoyaltyService

    svc = CatalogService(db)
    game = await svc.get_game_by_slug(slug)
    if not game or not game.is_active:
        return None
    categories = await svc.get_categories_by_game(game.id)
    roots = [c for c in categories if c.parent_id is None and c.is_active]
    current = None
    if cat_slug:
        current = next((c for c in roots if c.slug == cat_slug), None)
        if current is None:
            return None

    offers = []
    for cat in ([current] if current else roots):
        products, _ = await svc.get_products_by_category(cat.id, 0, 100)
        offers.extend((cat, p) for p in products)

    prices = [p.price for _, p in offers if not p.is_out_of_stock]
    min_price = min(prices) if prices else None
    has_auto = any(_is_auto(p) for _, p in offers)
    if current:
        page = category_seo(game, current, min_price, has_auto)
    else:
        levels = await LoyaltyService(db).get_levels()
        top = max((float(lv.cashback_percent) for lv in levels), default=None)
        page = game_seo(game, [c.name for c in roots], min_price, has_auto, top)
    return game, roots, offers, current, page
