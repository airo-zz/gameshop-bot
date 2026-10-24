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

Скорость первой загрузки (людям):
  • modulepreload скриптов открытой страницы по карте сборки
    (dist-web/build-manifest.json) — браузер грузит их параллельно, а не цепочкой;
  • данные страницы прямо в HTML (window.__INITIAL_DATA__ → кэш React Query,
    src/main.tsx) — без отдельных запросов к API при старте;
  • шапка сайта в той же вёрстке, что у React, — экран не пустой, пока грузится JS.
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
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from api.deps import DbSession
from api.services.catalog_service import CatalogService
from api.services.loyalty_service import LoyaltyService
from api.services.seo_content import clean_name, load_game_page
from shared.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

SITE = "https://redonate.gg"
BRAND = "reDonate"
TEMPLATE_PATH = Path("/web_dist/index.html")
MANIFEST_PATH = Path("/web_dist/build-manifest.json")
CACHE_TTL = 300

DEFAULT_TITLE = "reDonate — пополнение игр и цифровых сервисов"
DEFAULT_DESC = (
    "Пополнение игровой валюты и цифровых сервисов. Оплата через СБП, банковской "
    "картой или криптовалютой. Автоматическая выдача заказов и поддержка операторов."
)

FAQ = [
    ("Как быстро приходит товар?",
     "Товары с автовыдачей приходят сразу после оплаты. Остальные заказы оператор выполняет в чате — обычно за несколько минут, максимум до 12 часов."),
    ("Какие способы оплаты доступны?",
     "СБП, банковские карты (Visa, Mastercard, МИР), криптовалюта (USDT, TON, BTC и др.) и баланс аккаунта."),
    ("Нужна ли регистрация?",
     "Аккаунт создаётся при первом входе: по почте с кодом подтверждения или через Telegram. Если войти через Telegram, заказы, баланс и кэшбэк будут общими с Telegram-ботом."),
    ("Как работает кэшбэк?",
     "Уровень зависит от трат за календарный месяц. С каждого выполненного заказа на баланс возвращается процент вашего уровня, в пределах месячного лимита."),
    ("Что делать, если возникла проблема?",
     "Напишите в чат с оператором прямо на сайте — поможем с заказом или оплатой."),
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


_manifest_cache: tuple[float, dict] | None = None


def _manifest() -> dict:
    """Карта сборки сайта (vite): какие файлы нужны каждой странице."""
    global _manifest_cache
    try:
        mtime = MANIFEST_PATH.stat().st_mtime
        if _manifest_cache and _manifest_cache[0] == mtime:
            return _manifest_cache[1]
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        _manifest_cache = (mtime, data)
        return data
    except (OSError, ValueError):
        return _manifest_cache[1] if _manifest_cache else {}


def _preload_tags(page_module: str | None) -> list[str]:
    """modulepreload всех скриптов страницы и её стили — сразу, параллельно."""
    m = _manifest()
    if not page_module or page_module not in m:
        return []
    js: list[str] = []
    css: list[str] = []
    seen: set[str] = set()

    def walk(key: str) -> None:
        if key in seen or key == "index.html" or key not in m:
            return
        seen.add(key)
        entry = m[key]
        for imp in entry.get("imports", []):
            walk(imp)
        if entry.get("file", "").endswith(".js"):
            js.append(entry["file"])
        css.extend(c for c in entry.get("css", []) if c not in css)

    walk(page_module)
    return ([f'<link rel="stylesheet" crossorigin href="/{_e(c)}">' for c in css]
            + [f'<link rel="modulepreload" crossorigin href="/{_e(f)}">' for f in js])


# Страницы сайта → модуль страницы (ключ в карте сборки)
PAGE_MODULES = {
    "home": "src/web/pages/WebHomePage.tsx",
    "catalog": "src/web/pages/WebCatalogPage.tsx",
    "cashback": "src/web/pages/WebCashbackPage.tsx",
    "reviews": "src/web/pages/WebReviewsPage.tsx",
    "faq": "src/web/pages/WebFaqPage.tsx",
    "game": "src/web/pages/WebGamePage.tsx",
}

_NAV_ITEMS = [("Каталог", "/catalog"), ("Кэшбэк", "/cashback"), ("Отзывы", "/reviews"), ("Вопросы", "/faq")]


def _shell(active: str | None, main_html: str = "") -> str:
    """Шапка сайта в той же вёрстке, что WebLayout (React нарисует её же — без подмены)."""
    links = "".join(
        f'<a href="{href}" class="text-sm whitespace-nowrap transition-colors  '
        + ("text-[var(--text)]" if href == active else "text-[var(--text-2)] hover:text-[var(--text)]")
        + f'">{label}</a>'
        for label, href in _NAV_ITEMS
    )
    return (
        '<div class="min-h-screen flex flex-col" style="background: var(--bg);">'
        '<header class="sticky top-0 z-40 border-b border-[var(--border)]" style="background: var(--bg);">'
        '<div class="web-container flex items-center gap-8 h-16">'
        f'<a class="flex items-center shrink-0" aria-label="{BRAND}" href="/">'
        f'<img src="/logo-full.svg" alt="{BRAND}" width="800" height="154" class="h-6 md:h-7 w-auto"></a>'
        f'<nav class="hidden md:flex items-center gap-5 lg:gap-6">{links}</nav>'
        '</div></header>'
        + (f'<main class="flex-1 min-h-[calc(100dvh-64px)]">{main_html}</main>' if main_html else "")
        + '</div>'
    )


_UPLOAD_RE = re.compile(r"^(.*/static/uploads/[^/?#]+?)\.(png|jpe?g|webp)$", re.I)


def _hero_html(games) -> str:
    """Первый экран главной — та же разметка, что у React-компонента Hero."""
    from api.routers.seo_hero import COVER_ITEM, HERO_TEMPLATE

    covers = [g for g in games if g.image_url][:6]
    if len(covers) < 3:
        return ""
    items = []
    for i, g in enumerate(covers):
        url = g.image_url if g.image_url.startswith("http") else SITE + g.image_url
        m = _UPLOAD_RE.match(url)
        src = f"{m.group(1)}.w320.webp" if m else url
        srcset = f' srcset="{_e(m.group(1))}.w320.webp 320w, {_e(m.group(1))}.w640.webp 640w"' if m else ""
        items.append(COVER_ITEM.format(
            hidden="hidden lg:block" if i >= 3 else "",
            style=' style="transform: translateY(28px);"' if i % 3 == 1 else "",
            slug=_e(g.slug), src=_e(src), srcset=srcset, name=_e(g.name),
        ))
    return HERO_TEMPLATE.format(covers="".join(items))


# Плашка cookie в той же вёрстке, что web/components/CookieBanner.tsx: видна
# с первой отрисовки (а не после загрузки JS). Кнопки работают и до JS;
# если выбор уже сделан — скрыта скриптом в <head> (класс cc-ok).
_CC_SET = "try{{localStorage.setItem('cookie_consent','{v}')}}catch(e){{}};document.getElementById('cookie-ssr').remove()"
COOKIE_SSR = (
    '<div id="cookie-ssr" class="pointer-events-none flex justify-start md:justify-center pl-4 pr-[88px] md:px-24" '
    'style="position:fixed;left:0;right:0;bottom:16px;z-index:180;margin-bottom:env(safe-area-inset-bottom, 0px)">'
    '<div role="region" aria-label="Cookie" class="pointer-events-auto w-full max-w-[560px] rounded-2xl border '
    'border-[var(--border)] bg-[var(--bg2)] p-4 md:p-5" style="box-shadow:0 16px 40px rgba(0,0,0,0.45)">'
    '<p class="text-[13px] leading-relaxed text-[var(--text-2)]">Мы используем cookie: необходимые — для входа и '
    'корзины, аналитические (Яндекс.Метрика) — чтобы улучшать сайт. Подробнее — в '
    '<a href="/app/legal/privacy.html#cookie" target="_blank" rel="noopener noreferrer" '
    'class="underline hover:text-[var(--text)]">политике конфиденциальности</a>.</p>'
    '<div class="mt-3 flex flex-wrap gap-2">'
    f'<button type="button" onclick="{_CC_SET.format(v="all")}" class="h-10 px-4 rounded-xl text-sm font-semibold '
    'text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors">Принять</button>'
    f'<button type="button" onclick="{_CC_SET.format(v="necessary")}" class="h-10 px-4 rounded-xl text-sm '
    'text-[var(--text-2)] bg-[var(--bg3)] hover:text-[var(--text)] transition-colors">Только необходимые</button>'
    '</div></div></div>'
)
COOKIE_HEAD = (
    '<style>.cc-ok #cookie-ssr{display:none}</style>'
    '<script>try{if(localStorage.getItem("cookie_consent"))document.documentElement.classList.add("cc-ok")}catch(e){}</script>'
)


def _initial_script(entries: list[tuple[list, object]]) -> str:
    """Данные страницы для кэша React Query: [[queryKey, data], …] + время сборки."""
    payload = {"t": int(time.time() * 1000), "q": [[k, v] for k, v in entries]}
    data = json.dumps(jsonable_encoder(payload), ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return f"<script>window.__INITIAL_DATA__={data}</script>"


def _e(s: object) -> str:
    return html.escape(str(s), quote=True)


def _money(v: object) -> str:
    n = float(v)
    s = f"{n:,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
    return f"{s} ₽"


def _render(path: str, title: str, desc: str, body: str, ld: list[dict], noindex: bool = False,
            image: str | None = None, page: str | None = None, initial: list | None = None,
            active: str | None = None, main_html: str = "") -> str:
    template_page = page
    page = _template()
    url = SITE + (path if path != "/" else "/")
    preload = _preload_tags(PAGE_MODULES.get(template_page or ""))
    head = [
        f'<link rel="canonical" href="{_e(url)}" />',
        f'<meta property="og:url" content="{_e(url)}" />',
        '<meta name="robots" content="noindex, follow" />' if noindex else
        '<meta name="robots" content="index, follow, max-image-preview:large" />',
        # Текст для роботов (#seo) людям не показываем: при работающем JS он
        # скрыт до загрузки сайта, а React заменит его тем же содержимым в
        # оформлении. Если сайт не загрузился за 8 с — текст показываем.
        '<style>.js #seo{display:none}</style>',
        '<script>document.documentElement.classList.add("js");'
        'setTimeout(function(){if(!window.__appMounted)document.documentElement.classList.remove("js")},8000)'
        '</script>',
    ]
    if path == "/":
        if settings.YANDEX_VERIFICATION:
            head.append(f'<meta name="yandex-verification" content="{_e(settings.YANDEX_VERIFICATION)}" />')
        if settings.GOOGLE_SITE_VERIFICATION:
            head.append(f'<meta name="google-site-verification" content="{_e(settings.GOOGLE_SITE_VERIFICATION)}" />')
    head.extend(preload)
    if template_page:
        head.append(COOKIE_HEAD)
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
        *(((r'<meta property="og:image" content="[^"]*"\s*/?>', f'<meta property="og:image" content="{_e(image)}" />'),)
          if image else ()),
    ):
        page = re.sub(pattern, value, page, count=1)
    page = page.replace("</head>", "\n    " + "\n    ".join(head) + "\n  </head>", 1)
    # Контент для робота. Стиль минимальный: React заменит его сразу после загрузки JS.
    prerender = (
        '<div id="seo" style="max-width:1100px;margin:0 auto;padding:24px 20px;'
        'font-family:system-ui,sans-serif;color:#DCEBFF;background:#0B0C0F">'
        + body + "</div>"
    )
    shell = (_shell(active, main_html) + COOKIE_SSR) if template_page else ""
    data = _initial_script(initial) if initial else ""
    page = page.replace('<div id="root"></div>', f'<div id="root">{shell}{prerender}</div>{data}', 1)
    return page


def _nav() -> str:
    return (
        f'<header><a href="/">{BRAND}</a> · <a href="/catalog">Каталог</a> · '
        '<a href="/cashback">Кэшбэк</a> · <a href="/reviews">Отзывы</a> · <a href="/faq">Вопросы и ответы</a></header>'
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
            "alternateName": "redonate.gg",
            "url": SITE + "/",
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


# ── Данные страниц для кэша React Query (те же ответы, что у API) ───────────

async def _data_common(db) -> list:
    from api.routers import catalog as cat_api
    from api.schemas.catalog import GameOut

    games = [GameOut.model_validate(g) for g in await CatalogService(db).get_active_games()]
    return [
        (["web", "games", "all"], games),
        (["web", "trending-categories"], await cat_api.get_trending_categories(db)),
    ]


async def _data_game(db, slug: str, cat_slug: str | None) -> list:
    from api.routers import catalog as cat_api

    out = await _data_common(db)
    cats = await cat_api.list_categories(slug, db)
    out.append((["web", "categories", slug], cats))
    roots = [c for c in cats if not c.parent_id]
    current = next((c for c in roots if cat_slug and c.slug == cat_slug), None) or (roots[0] if roots else None)
    if current:
        products = await cat_api.list_products(db, category_id=current.id, page=0, page_size=20)
        out.append((["web", "products", str(current.id)], products))
    out.append((["web", "game-seo", slug, cat_slug or ""], await cat_api.get_game_seo(slug, db, cat_slug)))
    out.append((["reviews", "game", slug], await _game_reviews(db, slug)))
    return out


async def _game_reviews(db, slug: str) -> dict:
    """Отзывы игры — тот же запрос, что делает блок отзывов на странице игры (WebGamePage)."""
    from api.routers import reviews as rev_api

    return (await rev_api.list_reviews(db, game=slug, kind="text", offset=0, limit=4)).model_dump()


def _reviews_html(data: dict, game_name: str) -> str:
    sm = data.get("summary") or {}
    if not sm.get("total"):
        return ""
    pct = f"{sm['percent']:g}".replace(".", ",")
    items = "".join(
        f"<li>{_e(r['author'])}, {r['created_at']:%d.%m.%Y} — "
        f"{'положительный' if r['positive'] else 'отрицательный'}: {_e(r['text'])}</li>"
        for r in data["items"] if r["text"]
    )
    return (f"<h2>Отзывы о покупке {_e(game_name)}</h2>"
            f"<p>{sm['total']} отзывов, {pct}% положительных.</p><ul>{items}</ul>")


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
    from api.routers import catalog as cat_api

    initial = await _data_common(db) + [
        (["web", "home-blocks"], await cat_api.get_home_blocks(db)),
        (["web", "loyalty"], await cat_api.get_loyalty_program(db)),
        (["reviews", "home"], await _reviews_data(db, kind="text", limit=6)),
    ]
    from api.services.home_service import resolve_home

    hero_games, _ = await resolve_home(db)
    return 200, _render("/", DEFAULT_TITLE, DEFAULT_DESC, body, ld, page="home", initial=initial,
                        main_html=_hero_html(hero_games))


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
    return 200, _render("/catalog", title, desc, body, ld, page="catalog",
                        initial=await _data_common(db), active="/catalog")


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
    from api.routers import catalog as cat_api

    initial = await _data_common(db) + [(["web", "loyalty"], await cat_api.get_loyalty_program(db))]
    return 200, _render("/cashback", title, desc, body, ld, page="cashback", initial=initial, active="/cashback")


REVIEWS_PAGE = 20


async def _reviews_data(db, kind: str = "all", limit: int = REVIEWS_PAGE) -> dict:
    """Тот же ответ, что GET /api/v1/reviews (api/routers/reviews.py)."""
    from api.routers import reviews as rev_api

    return (await rev_api.list_reviews(db, game=None, kind=kind, offset=0, limit=limit)).model_dump()


async def _reviews(db) -> tuple[int, str]:
    data = await _reviews_data(db)
    sm = data["summary"] or {"total": 0, "positive": 0, "percent": 0}
    items = "".join(
        f"<li><b>{_e(r['author'])}</b>, {r['created_at']:%d.%m.%Y}"
        + (f", {_e(r['game_name'])}" if r["game_name"] else "")
        + f" — {'положительный' if r['positive'] else 'отрицательный'}"
        + (f": {_e(r['text'])}" if r["text"] else "")
        + "</li>"
        for r in data["items"]
    )
    pct = f"{sm['percent']:g}".replace(".", ",")
    body = (
        _nav()
        + "<h1>Отзывы покупателей</h1>"
        + f"<p>{sm['total']} отзывов, {pct}% положительных.</p>"
        + f"<ul>{items}</ul>"
    )
    ld = [_breadcrumbs([("Главная", "/"), ("Отзывы", "/reviews")])]
    title = "Отзывы покупателей | reDonate"
    desc = (f"Отзывы о reDonate: {sm['total']} отзывов, {pct}% положительных. "
            "Что пишут покупатели о пополнении игр и цифровых сервисов.")
    initial = await _data_common(db) + [
        (["reviews", "", "all"], {"pages": [data], "pageParams": [0]}),
    ]
    return 200, _render("/reviews", title, desc, body, ld, page="reviews", initial=initial, active="/reviews")


async def _faq_page(db) -> tuple[int, str]:
    from api.routers import catalog as cat_api
    from api.services.faq_content import FAQ_SECTIONS, faq_flat

    body = _nav() + "<h1>Вопросы и ответы</h1>" + "".join(
        f"<h2>{_e(s['title'])}</h2>" + "".join(f"<h3>{_e(q)}</h3><p>{_e(a)}</p>" for q, a in s["items"])
        for s in FAQ_SECTIONS
    )
    ld = [_breadcrumbs([("Главная", "/"), ("Вопросы и ответы", "/faq")]), _faq_ld(faq_flat())]
    title = "Вопросы и ответы | reDonate"
    desc = ("Как оформить и оплатить заказ, сколько ждать выполнения, как вернуть деньги, "
            "как работают аккаунт, кэшбэк и бонусы reDonate.")
    initial = await _data_common(db) + [(["web", "faq"], await cat_api.get_faq())]
    return 200, _render("/faq", title, desc, body, ld, page="faq", initial=initial, active="/faq")


def _faq_ld(faq: list[tuple[str, str]]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in faq
        ],
    }


async def _game(db, slug: str, cat_slug: str | None = None) -> tuple[int, str]:
    data = await load_game_page(db, slug, cat_slug)
    path = f"/game/{slug}" + (f"/{cat_slug}" if cat_slug else "")
    if data is None:
        body = _nav() + "<h1>Страница не найдена</h1><p><a href='/catalog'>Перейти в каталог</a></p>"
        return 404, _render(path, "Страница не найдена | reDonate", DEFAULT_DESC, body, [], noindex=True)
    game, roots, offers, current, page = data

    sections: dict = {}
    for cat, p in offers:
        sections.setdefault(cat.id, (cat, []))[1].append(p)
    sections_html = ""
    for cat, products in sections.values():
        lis = "".join(
            f"<li>{_e(p.name)} — {_money(p.price)}" + (" (нет в наличии)" if p.is_out_of_stock else "") + "</li>"
            for p in products
        )
        heading = _e(clean_name(cat.name)) if current else (
            f'<a href="/game/{_e(game.slug)}/{_e(cat.slug)}">{_e(clean_name(cat.name))} {_e(game.name)}</a>'
        )
        desc_html = f"<p>{_e(cat.description)}</p>" if getattr(cat, "description", None) and not current else ""
        sections_html += f"<h2>{heading}</h2>{desc_html}<ul>{lis}</ul>"

    crumbs = [("Главная", "/"), ("Каталог", "/catalog"), (game.name, f"/game/{game.slug}")]
    if current:
        crumbs.append((clean_name(current.name), path))
    other_cats = "".join(
        f'<li><a href="/game/{_e(game.slug)}/{_e(c.slug)}">{_e(clean_name(c.name))}</a></li>'
        for c in roots if not current or c.id != current.id
    )
    body = (
        _nav()
        + "<nav>" + " / ".join(
            f'<a href="{_e(u)}">{_e(n)}</a>' if i < len(crumbs) - 1 else _e(n)
            for i, (n, u) in enumerate(crumbs)) + "</nav>"
        + f"<h1>{_e(page.h1)}</h1><p>{_e(page.intro)}</p>"
        + (f"<p>Также ищут: {_e(', '.join(page.aliases))}.</p>" if page.aliases else "")
        + sections_html
        + (f"<h2>{'Другие разделы' if current else 'Разделы'} {_e(game.name)}</h2><ul>{other_cats}</ul>" if other_cats else "")
        + _reviews_html(await _game_reviews(db, slug), game.name)
        + (f"<div>{_e(page.text)}</div>" if page.text else "")
    )

    image = f"{SITE}{game.image_url}" if game.image_url and game.image_url.startswith("/") else game.image_url
    ld: list[dict] = [_breadcrumbs(crumbs)]
    if offers:
        ld.append({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": page.h1,
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": i + 1,
                    "item": {
                        "@type": "Product",
                        "name": f"{game.name}: {p.name}",
                        "category": clean_name(cat.name),
                        **({"image": image} if image else {}),
                        "brand": {"@type": "Brand", "name": game.name},
                        "offers": {
                            "@type": "Offer",
                            "price": f"{float(p.price):.2f}",
                            "priceCurrency": "RUB",
                            "availability": "https://schema.org/OutOfStock" if p.is_out_of_stock
                            else "https://schema.org/InStock",
                            "url": f"{SITE}/game/{game.slug}/{cat.slug}",
                            "seller": {"@type": "Organization", "name": BRAND},
                        },
                    },
                }
                for i, (cat, p) in enumerate(offers[:100])
            ],
        })
    initial = await _data_game(db, slug, cat_slug)
    return 200, _render(path, page.title, page.description, body, ld, image=image, page="game", initial=initial)


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


@router.get("/seo/render/reviews", response_class=HTMLResponse, include_in_schema=False)
async def render_reviews(db: DbSession):
    return await _cached("/reviews", lambda: _reviews(db))


@router.get("/seo/render/faq", response_class=HTMLResponse, include_in_schema=False)
async def render_faq(db: DbSession):
    return await _cached("/faq", lambda: _faq_page(db))


@router.get("/seo/render/game/{slug}", response_class=HTMLResponse, include_in_schema=False)
async def render_game(slug: str, db: DbSession):
    return await _cached(f"/game/{slug}", lambda: _game(db, slug))


@router.get("/seo/render/game/{slug}/{cat_slug}", response_class=HTMLResponse, include_in_schema=False)
async def render_game_category(slug: str, cat_slug: str, db: DbSession):
    return await _cached(f"/game/{slug}/{cat_slug}", lambda: _game(db, slug, cat_slug))


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
        url("/reviews", today, "0.6", "daily"),
        url("/faq", today, "0.5", "monthly"),
    ]
    svc = CatalogService(db)
    for g in games:
        updated = getattr(g, "updated_at", None)
        lastmod = updated.date().isoformat() if updated else today
        parts.append(url(f"/game/{g.slug}", lastmod, "0.8", "daily"))
        for c in await svc.get_categories_by_game(g.id):
            if c.parent_id is None and c.is_active:
                parts.append(url(f"/game/{g.slug}/{c.slug}", lastmod, "0.7", "daily"))
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
Disallow: /chat
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
Disallow: /chat
Disallow: /app/
Disallow: /api/
Disallow: /webhooks/
Clean-param: q /catalog
Clean-param: cat /game/
Clean-param: q /game/

Sitemap: {SITE}/sitemap.xml
"""


@router.get("/robots.txt", include_in_schema=False)
async def robots():
    return PlainTextResponse(ROBOTS)
