"""
api/routers/seo.py
─────────────────────────────────────────────────────────────────────────────
Серверная отдача страниц сайта redonate.gg для поисковиков (Яндекс, Google).

nginx проксирует сюда HTML-страницы сайта (/, /catalog, /cashback, /game/*),
а также /sitemap.xml и /robots.txt. Мы берём собранный index.html сайта
(dist-web, смонтирован read-only) и подставляем в него:
  • <title>, description, canonical, Open Graph — свои для каждой страницы;
  • структурированные данные schema.org (Organization, WebSite+SearchAction,
    BreadcrumbList, ItemList товаров с Offer-ценами, FAQPage);
  • текст страницы внутри #root (названия, описания, цены, ссылки) —
    робот видит контент без JS, а React при запуске заменяет его на SPA.
Данные берутся из БД при запросе (кэш 5 минут) — цены и новые игры всегда
актуальны. Если шаблона нет (dev) — отдаём минимальный HTML.
─────────────────────────────────────────────────────────────────────────────
"""

import html
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from api.deps import DbSession
from api.services.catalog_service import CatalogService
from api.services.loyalty_service import LoyaltyService
from shared.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

SITE = "https://redonate.gg"
BRAND = "reDonate"
TEMPLATE_PATH = Path("/web_dist/index.html")
CACHE_TTL = 300

DEFAULT_TITLE = "reDonate — пополнение игр и цифровых сервисов"
DEFAULT_DESC = (
    "Пополнение игровой валюты и цифровых сервисов. Оплата через СБП, банковской "
    "картой или криптовалютой. Автоматическая выдача заказов и поддержка операторов."
)

FAQ = [
    ("Как быстро приходит товар?",
     "Товары с автовыдачей приходят сразу после оплаты. Остальные заказы оператор обрабатывает в чате, обычно за несколько минут."),
    ("Какие способы оплаты доступны?",
     "СБП, банковские карты (Visa, Mastercard, МИР), криптовалюта (USDT, TON, BTC и др.) и баланс аккаунта."),
    ("Нужна ли регистрация?",
     "Отдельная регистрация не нужна — вход выполняется через Telegram. Заказы, баланс и кэшбэк общие для сайта и Telegram-бота."),
    ("Как работает кэшбэк?",
     "Уровень зависит от трат за календарный месяц. С каждого выполненного заказа на баланс возвращается процент вашего уровня, в пределах месячного лимита."),
    ("Что делать, если возникла проблема?",
     "Напишите в поддержку в Telegram — операторы ответят и помогут с заказом или оплатой."),
]

class TemplateUnavailable(Exception):
    pass


_template_cache: tuple[float, str] | None = None
_page_cache: dict[str, tuple[float, int, str]] = {}


# ── Шаблон ────────────────────────────────────────────────────────────────────

def _template() -> str:
    """index.html сайта; перечитывается после деплоя (по mtime)."""
    global _template_cache
    try:
        mtime = TEMPLATE_PATH.stat().st_mtime
        if _template_cache and _template_cache[0] == mtime:
            return _template_cache[1]
        text = TEMPLATE_PATH.read_text(encoding="utf-8")
        if '<div id="root"></div>' not in text:
            raise OSError("шаблон неполный (идёт деплой?)")
        _template_cache = (mtime, text)
        return text
    except OSError:
        # Во время деплоя файлы на мгновение пропадают — держимся за прошлую копию.
        # Нет и её — пусть nginx отдаст статический index.html (503 → @web_index).
        if _template_cache:
            return _template_cache[1]
        raise TemplateUnavailable


def _e(s: object) -> str:
    return html.escape(str(s), quote=True)


def _money(v: object) -> str:
    n = float(v)
    s = f"{n:,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
    return f"{s} ₽"


def _render(path: str, title: str, desc: str, body: str, ld: list[dict], noindex: bool = False) -> str:
    page = _template()
    url = SITE + (path if path != "/" else "/")
    head = [
        f'<link rel="canonical" href="{_e(url)}" />',
        f'<meta property="og:url" content="{_e(url)}" />',
        '<meta name="robots" content="noindex, follow" />' if noindex else
        '<meta name="robots" content="index, follow, max-image-preview:large" />',
    ]
    if path == "/":
        if settings.YANDEX_VERIFICATION:
            head.append(f'<meta name="yandex-verification" content="{_e(settings.YANDEX_VERIFICATION)}" />')
        if settings.GOOGLE_SITE_VERIFICATION:
            head.append(f'<meta name="google-site-verification" content="{_e(settings.GOOGLE_SITE_VERIFICATION)}" />')
    for block in ld:
        # </script> внутри JSON ломает разметку — экранируем «<»
        head.append('<script type="application/ld+json">'
                    + json.dumps(block, ensure_ascii=False).replace("<", "\\u003c") + "</script>")

    page = re.sub(r"<title>.*?</title>", f"<title>{_e(title)}</title>", page, count=1, flags=re.S)
    for pattern, value in (
        (r'<meta name="description" content="[^"]*"\s*/?>', f'<meta name="description" content="{_e(desc)}" />'),
        (r'<meta property="og:title" content="[^"]*"\s*/?>', f'<meta property="og:title" content="{_e(title)}" />'),
        (r'<meta property="og:description" content="[^"]*"\s*/?>', f'<meta property="og:description" content="{_e(desc)}" />'),
        (r'<meta property="og:url" content="[^"]*"\s*/?>', ""),
    ):
        page = re.sub(pattern, value, page, count=1)
    page = page.replace("</head>", "\n    " + "\n    ".join(head) + "\n  </head>", 1)
    # Контент для робота. Стиль минимальный: React заменит его сразу после загрузки JS.
    prerender = (
        '<div id="seo" style="max-width:1100px;margin:0 auto;padding:24px 20px;'
        'font-family:system-ui,sans-serif;color:#DCEBFF;background:#0B0C0F">'
        + body + "</div>"
    )
    page = page.replace('<div id="root"></div>', f'<div id="root">{prerender}</div>', 1)
    return page


def _nav() -> str:
    return (
        f'<header><a href="/">{BRAND}</a> · <a href="/catalog">Каталог</a> · '
        '<a href="/cashback">Кэшбэк</a></header>'
    )


def _org_ld() -> list[dict]:
    return [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": BRAND,
            "url": SITE,
            "logo": f"{SITE}/apple-touch-icon.png",
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": BRAND,
            "url": SITE,
            "inLanguage": "ru",
            "potentialAction": {
                "@type": "SearchAction",
                "target": f"{SITE}/catalog?q={{search_term_string}}",
                "query-input": "required name=search_term_string",
            },
        },
    ]


def _breadcrumbs(items: list[tuple[str, str]]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": SITE + path}
            for i, (name, path) in enumerate(items)
        ],
    }


# ── Страницы ──────────────────────────────────────────────────────────────────

async def _home(db) -> tuple[int, str]:
    games = await CatalogService(db).get_active_games()
    links = "".join(f'<li><a href="/game/{_e(g.slug)}">Пополнить {_e(g.name)}</a></li>' for g in games)
    faq_html = "".join(f"<h3>{_e(q)}</h3><p>{_e(a)}</p>" for q, a in FAQ)
    body = (
        _nav()
        + "<h1>Пополнение игр и цифровых сервисов</h1>"
        + "<p>Внутриигровая валюта, наборы и подписки для мобильных и компьютерных игр. "
          "Оплата через СБП, банковской картой или криптовалютой, кэшбэк с каждой покупки.</p>"
        + f"<h2>Каталог</h2><ul>{links}</ul>"
        + f"<h2>Частые вопросы</h2>{faq_html}"
    )
    ld = _org_ld() + [{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in FAQ
        ],
    }]
    return 200, _render("/", DEFAULT_TITLE, DEFAULT_DESC, body, ld)


async def _catalog(db) -> tuple[int, str]:
    games = await CatalogService(db).get_active_games()
    items = "".join(
        f'<li><a href="/game/{_e(g.slug)}">{_e(g.name)}</a> — {"сервис" if g.type == "service" else "игра"}</li>'
        for g in games
    )
    body = _nav() + "<h1>Каталог игр и сервисов</h1>" + f"<ul>{items}</ul>"
    ld = [
        _breadcrumbs([("Главная", "/"), ("Каталог", "/catalog")]),
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/game/{g.slug}", "name": g.name}
                for i, g in enumerate(games)
            ],
        },
    ]
    title = "Каталог игр и сервисов | reDonate"
    desc = ("Все игры и цифровые сервисы, которые можно пополнить в reDonate: внутриигровая валюта, "
            "наборы и подписки. Оплата через СБП, банковской картой или криптовалютой.")
    return 200, _render("/catalog", title, desc, body, ld)


async def _cashback(db) -> tuple[int, str]:
    levels = await LoyaltyService(db).get_levels()
    rows = "".join(
        f"<tr><td>{_e(lv.name)}</td><td>от {_money(lv.min_spent)}</td><td>{float(lv.cashback_percent):g}%</td>"
        f"<td>{_money(lv.monthly_cashback_cap) if lv.monthly_cashback_cap is not None else 'без лимита'}</td></tr>"
        for lv in levels
    )
    top = f"{float(levels[-1].cashback_percent):g}%" if levels else ""
    body = (
        _nav()
        + f"<h1>Кэшбэк до {top} с каждой покупки</h1>"
        + "<p>Уровень зависит от трат за календарный месяц и сохраняется весь следующий месяц. "
          "Кэшбэк начисляется на баланс после выполнения заказа, в пределах месячного лимита уровня.</p>"
        + "<table><thead><tr><th>Уровень</th><th>Траты за месяц</th><th>Кэшбэк</th><th>Лимит в месяц</th></tr></thead>"
        + f"<tbody>{rows}</tbody></table>"
    )
    ld = [_breadcrumbs([("Главная", "/"), ("Кэшбэк", "/cashback")])]
    title = "Кэшбэк и программа лояльности | reDonate"
    desc = (f"Программа лояльности reDonate: кэшбэк до {top} на баланс с каждого выполненного заказа, "
            f"{len(levels)} уровней по тратам за месяц, условия реферальной программы.")
    return 200, _render("/cashback", title, desc, body, ld)


async def _game(db, slug: str) -> tuple[int, str]:
    svc = CatalogService(db)
    game = await svc.get_game_by_slug(slug)
    if not game or not game.is_active:
        body = _nav() + "<h1>Страница не найдена</h1><p><a href='/catalog'>Перейти в каталог</a></p>"
        return 404, _render(f"/game/{slug}", "Страница не найдена | reDonate", DEFAULT_DESC, body, [], noindex=True)

    categories = await svc.get_categories_by_game(game.id)
    roots = [c for c in categories if c.parent_id is None and c.is_active]
    sections, offers = [], []
    for cat in roots:
        products, _ = await svc.get_products_by_category(cat.id, 0, 100)
        if not products:
            continue
        lis = "".join(
            f"<li>{_e(p.name)} — {_money(p.price)}"
            + (" (нет в наличии)" if p.is_out_of_stock else "") + "</li>"
            for p in products
        )
        desc_html = f"<p>{_e(cat.description)}</p>" if getattr(cat, "description", None) else ""
        sections.append(f"<h2>{_e(cat.name)}</h2>{desc_html}<ul>{lis}</ul>")
        offers.extend((cat, p) for p in products)

    prices = [float(p.price) for _, p in offers if not p.is_out_of_stock]
    min_price = min(prices) if prices else None
    cat_names = ", ".join(c.name.lower() for c in roots[:3]) or "внутриигровая валюта и наборы"

    title = f"Купить донат {game.name}" + (f" — от {_money(min_price)}" if min_price else "") + " | reDonate"
    desc = (f"Пополнение {game.name}: {cat_names}. "
            + (f"Цены от {_money(min_price)}. " if min_price else "")
            + "Оплата через СБП, банковской картой или криптовалютой, кэшбэк на баланс.")
    intro = (game.description or "").strip()
    body = (
        _nav()
        + f'<nav><a href="/">Главная</a> / <a href="/catalog">Каталог</a> / {_e(game.name)}</nav>'
        + f"<h1>Донат {_e(game.name)}</h1>"
        + (f"<p>{_e(intro)}</p>" if intro else f"<p>Пополнение {_e(game.name)} онлайн: {_e(cat_names)}.</p>")
        + "".join(sections)
    )
    page_url = f"{SITE}/game/{game.slug}"
    image = f"{SITE}{game.image_url}" if game.image_url and game.image_url.startswith("/") else game.image_url
    ld: list[dict] = [_breadcrumbs([("Главная", "/"), ("Каталог", "/catalog"), (game.name, f"/game/{game.slug}")])]
    if offers:
        ld.append({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": f"Донат {game.name}",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": i + 1,
                    "item": {
                        "@type": "Product",
                        "name": f"{game.name}: {p.name}",
                        "category": cat.name,
                        **({"image": image} if image else {}),
                        "brand": {"@type": "Brand", "name": game.name},
                        "offers": {
                            "@type": "Offer",
                            "price": f"{float(p.price):.2f}",
                            "priceCurrency": "RUB",
                            "availability": "https://schema.org/OutOfStock" if p.is_out_of_stock
                            else "https://schema.org/InStock",
                            "url": f"{page_url}?cat={cat.id}",
                            "seller": {"@type": "Organization", "name": BRAND},
                        },
                    },
                }
                for i, (cat, p) in enumerate(offers[:100])
            ],
        })
    return 200, _render(f"/game/{game.slug}", title, desc, body, ld)


async def _cached(key: str, builder) -> HTMLResponse:
    now = time.time()
    hit = _page_cache.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        return HTMLResponse(hit[2], status_code=hit[1])
    try:
        status, page = await builder()
    except TemplateUnavailable:
        return Response(status_code=503)
    except Exception:
        # SEO не должен ронять сайт: 503 → nginx отдаёт статический index.html
        logger.exception("seo render failed: %s", key)
        return Response(status_code=503)
    _page_cache[key] = (now, status, page)
    if len(_page_cache) > 500:
        _page_cache.clear()
    return HTMLResponse(page, status_code=status)


@router.get("/seo/render/", response_class=HTMLResponse, include_in_schema=False)
async def render_home(db: DbSession):
    return await _cached("/", lambda: _home(db))


@router.get("/seo/render/catalog", response_class=HTMLResponse, include_in_schema=False)
async def render_catalog(db: DbSession):
    return await _cached("/catalog", lambda: _catalog(db))


@router.get("/seo/render/cashback", response_class=HTMLResponse, include_in_schema=False)
async def render_cashback(db: DbSession):
    return await _cached("/cashback", lambda: _cashback(db))


@router.get("/seo/render/game/{slug}", response_class=HTMLResponse, include_in_schema=False)
async def render_game(slug: str, db: DbSession):
    return await _cached(f"/game/{slug}", lambda: _game(db, slug))


# ── sitemap.xml / robots.txt ──────────────────────────────────────────────────

@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap(db: DbSession):
    games = await CatalogService(db).get_active_games()
    today = datetime.now(timezone.utc).date().isoformat()

    def url(loc: str, lastmod: str, priority: str, freq: str) -> str:
        return (f"<url><loc>{_e(SITE + loc)}</loc><lastmod>{lastmod}</lastmod>"
                f"<changefreq>{freq}</changefreq><priority>{priority}</priority></url>")

    parts = [
        url("/", today, "1.0", "daily"),
        url("/catalog", today, "0.9", "daily"),
        url("/cashback", today, "0.5", "monthly"),
    ]
    for g in games:
        updated = getattr(g, "updated_at", None)
        parts.append(url(f"/game/{g.slug}", (updated.date().isoformat() if updated else today), "0.8", "daily"))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(parts) + "</urlset>")
    return Response(xml, media_type="application/xml")


ROBOTS = f"""User-agent: *
Allow: /
Disallow: /cart
Disallow: /checkout
Disallow: /orders
Disallow: /balance
Disallow: /profile
Disallow: /login
Disallow: /request
Disallow: /app/
Disallow: /api/
Disallow: /webhooks/

User-agent: Yandex
Allow: /
Disallow: /cart
Disallow: /checkout
Disallow: /orders
Disallow: /balance
Disallow: /profile
Disallow: /login
Disallow: /request
Disallow: /app/
Disallow: /api/
Disallow: /webhooks/
Clean-param: q /catalog
Clean-param: cat /game/

Sitemap: {SITE}/sitemap.xml
"""


@router.get("/robots.txt", include_in_schema=False)
async def robots():
    return PlainTextResponse(ROBOTS)
