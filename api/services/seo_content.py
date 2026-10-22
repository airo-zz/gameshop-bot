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
    faq: list[tuple[str, str]] = field(default_factory=list)
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


def game_seo(game, cat_names: list[str], min_price: Decimal | float | None,
             has_auto: bool, top_cashback: float | None) -> PageSeo:
    name = game.name
    names = [clean_name(c) for c in cat_names if clean_name(c)]
    main = _lower_first(names[0]) if names else "внутриигровую валюту"
    what = ", ".join(_lower_first(n) for n in names[:3]) or "внутриигровая валюта и наборы"
    al = aliases(game)
    price = f" от {money(min_price)}" if min_price else ""
    service = getattr(game, "type", "game") == "service"

    title = (game.seo_title or "").strip() or _fit(
        f"Донат {name} — купить {main}{price} | {BRAND}",
        f"Донат {name} — купить {main} | {BRAND}",
        f"Донат {name}{price} | {BRAND}",
        f"Донат {name} | {BRAND}",
    )
    cashback = f", кэшбэк до {top_cashback:g}% на баланс" if top_cashback else ""
    description = (game.seo_description or "").strip() or (
        f"{'Пополнение' if service else 'Донат в'} {name}"
        + (f" ({', '.join(al[:2])})" if al else "")
        + f": {what}. "
        + (f"Цены от {money(min_price)}. " if min_price else "")
        + f"Оплата через СБП, банковской картой или криптовалютой{cashback}."
    )[:320]
    h1 = f"Донат {name}" if not service else f"Пополнение {name}"
    intro = ((game.description or "").strip()
             or f"Купить {what} для {name} онлайн: оплата через СБП, банковской картой или криптовалютой.")

    speed = ("Позиции с автовыдачей приходят сразу после оплаты, остальные заказы оператор "
             "выполняет обычно за несколько минут." if has_auto else
             "Заказ выполняет оператор, обычно за несколько минут после оплаты. "
             "Статус виден в разделе «Мои заказы».")
    faq = [
        (f"Как задонатить в {name}?",
         f"Выберите {main} или другой вариант на этой странице, укажите данные для пополнения, "
         "если игра их требует, и оплатите заказ через СБП, банковской картой или криптовалютой. "
         + speed),
        (f"Сколько стоит донат в {name}?",
         (f"Цены начинаются от {money(min_price)}. " if min_price else "")
         + "Стоимость каждого варианта указана в списке на странице."),
        (f"Как быстро приходит донат {name}?", speed),
        (f"Можно ли купить донат {name} из России?",
         "Да. Оплата принимается через СБП и карты российских банков, а также криптовалютой."),
        ("Что делать, если возникли вопросы по заказу?",
         "Напишите в чат с оператором прямо на сайте — поможем с заказом или оплатой."),
    ]
    return PageSeo(title, description, h1, intro, faq, al, (game.seo_text or "").strip() or None)


def category_seo(game, cat, min_price: Decimal | float | None, has_auto: bool) -> PageSeo:
    name, cname = game.name, clean_name(cat.name) or cat.name
    lc = _lower_first(cname)
    # «Discord Nitro» в игре Discord — не повторяем название игры
    suffix = "" if name.lower() in cname.lower() else f" {name}"
    price = f" от {money(min_price)}" if min_price else ""
    title = _fit(
        f"Купить {lc}{suffix}{price} | {BRAND}",
        f"Купить {lc}{suffix} | {BRAND}",
        f"{cname}{suffix} | {BRAND}",
    )
    description = (
        f"{cname}{'' if not suffix else ' для ' + name}"
        + (f" — цены от {money(min_price)}" if min_price else "")
        + ". Оплата через СБП, банковской картой или криптовалютой, кэшбэк на баланс."
    )[:320]
    speed = ("Сразу после оплаты, если у позиции автовыдача; остальные заказы оператор "
             "выполняет обычно за несколько минут." if has_auto else
             "Заказ выполняет оператор, обычно за несколько минут после оплаты.")
    faq = [
        (f"Как купить {lc}{suffix}?",
         "Выберите нужный вариант в списке, укажите данные для пополнения, если они нужны, "
         "и оплатите через СБП, банковской картой или криптовалютой."),
        (f"Какие цены на {lc}{suffix}?",
         (f"От {money(min_price)}. " if min_price else "") + "Цена каждого варианта указана в списке."),
        ("Как быстро выполняется заказ?", speed),
    ]
    intro = ((getattr(cat, "description", None) or "").strip()
             or f"{cname}{suffix} — выберите вариант и оплатите онлайн.")
    return PageSeo(title, description, f"{cname}{suffix}", intro, faq, aliases(game), None)


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
