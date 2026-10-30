"""
api/services/seo_feeds.py
─────────────────────────────────────────────────────────────────────────────
Служебные файлы сайта для поисковиков и нейросетей:
  • site_urls()      — адреса для sitemap.xml и IndexNow (один список);
  • build_llms_txt() — /llms.txt: что за магазин, как покупать, каталог с ценами
    «от» — коротким текстом, который ассистенты (ChatGPT, Perplexity, Алиса…)
    берут как источник ответа «где купить донат»;
  • submit_indexnow() — сообщает Bing/Яндексу (через api.indexnow.org) о новых и
    изменённых страницах. Что уже отправлено — в Redis (адрес → lastmod).
Факты в llms.txt — только из БД и faq_content.py (правила магазина), не выдумываем.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.catalog_service import CatalogService
from api.services.faq_content import FAQ_SECTIONS
from api.services.home_service import category_summaries
from api.services.review_service import ReviewService
from api.services.seo_content import clean_name
from shared.config import settings

logger = logging.getLogger(__name__)

SITE = "https://redonate.gg"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
INDEXNOW_SENT_KEY = "seo:indexnow:sent"


@dataclass
class SiteUrl:
    path: str
    lastmod: str
    priority: str
    freq: str


async def site_urls(db: AsyncSession) -> list[SiteUrl]:
    """Все индексируемые страницы сайта: служебные, игры и их разделы."""
    today = datetime.now(timezone.utc).date().isoformat()
    out = [
        SiteUrl("/", today, "1.0", "daily"),
        SiteUrl("/catalog", today, "0.9", "daily"),
        SiteUrl("/cashback", today, "0.5", "monthly"),
        SiteUrl("/reviews", today, "0.6", "daily"),
        SiteUrl("/faq", today, "0.5", "monthly"),
    ]
    svc = CatalogService(db)
    for g in await svc.get_active_games():
        updated = getattr(g, "updated_at", None)
        lastmod = updated.date().isoformat() if updated else today
        out.append(SiteUrl(f"/game/{g.slug}", lastmod, "0.8", "daily"))
        if (g.meta or {}).get("decor_catalog"):
            continue   # коллекции украшений — фильтр одной страницы, не отдельные адреса
        for c in await svc.get_categories_by_game(g.id):
            if c.parent_id is None and c.is_active:
                out.append(SiteUrl(f"/game/{g.slug}/{c.slug}", lastmod, "0.7", "daily"))
    return out


def _money(v: Decimal | float) -> str:
    s = f"{float(v):,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
    return f"{s} ₽"


async def build_llms_txt(db: AsyncSession) -> str:
    svc = CatalogService(db)
    games = await svc.get_active_games()
    cats_by_game = {}
    for g in games:
        if (g.meta or {}).get("decor_catalog"):
            cats_by_game[g.id] = []
            continue
        cats_by_game[g.id] = [c for c in await svc.get_categories_by_game(g.id)
                              if c.parent_id is None and c.is_active]
    summary = await category_summaries(db, [c.id for cats in cats_by_game.values() for c in cats])
    reviews = await ReviewService(db).summary()

    lines = [
        "# reDonate",
        "",
        "> Магазин пополнения игр и цифровых сервисов для покупателей из России и СНГ: "
        "игровая валюта, наборы, подписки, Telegram Stars и Premium. Сайт redonate.gg "
        f"и Telegram-бот @{settings.BOT_USERNAME}.",
        "",
        "Как купить: выбрать игру в каталоге, раздел и товар, указать данные для пополнения "
        "(обычно ID игрока), оплатить через СБП, банковской картой (Visa, Mastercard, МИР) "
        "или криптовалютой. Товары с пометкой «Автовыдача» приходят сразу после оплаты, "
        "остальные выполняет оператор — до 12 часов, обычно быстрее. С каждого заказа "
        "начисляется кэшбэк на баланс. Поддержка — чат с оператором на сайте и "
        f"@{settings.SUPPORT_BOT_USERNAME} в Telegram.",
    ]
    if reviews.total:
        pct = round(reviews.positive * 100 / reviews.total)
        lines += ["", f"Отзывы: {reviews.total}, из них {pct}% положительных — {SITE}/reviews"]

    lines += ["", "## Каталог", ""]
    for g in games:
        lines.append(f"- [{g.name}]({SITE}/game/{g.slug})")
        for c in cats_by_game[g.id]:
            s = summary.get(c.id) or {}
            extra = []
            if s.get("min_price") is not None:
                extra.append(f"от {_money(s['min_price'])}")
            if s.get("has_auto"):
                extra.append("автовыдача")
            tail = f" — {', '.join(extra)}" if extra else ""
            name = clean_name(c.name)
            if g.name.lower() not in name.lower():
                name = f"{name} {g.name}"
            lines.append(f"  - [{name}]({SITE}/game/{g.slug}/{c.slug}){tail}")

    lines += ["", "## Вопросы и ответы", ""]
    for section in FAQ_SECTIONS:
        lines += [f"### {section['title']}", ""]
        for q, a in section["items"]:
            lines += [f"**{q}** {a}", ""]

    lines += [
        "## Страницы",
        "",
        f"- [Каталог]({SITE}/catalog)",
        f"- [Вопросы и ответы]({SITE}/faq)",
        f"- [Кэшбэк и программа лояльности]({SITE}/cashback)",
        f"- [Отзывы]({SITE}/reviews)",
        f"- [Пользовательское соглашение]({SITE}/app/legal/terms.html)",
        "",
    ]
    return "\n".join(lines)


async def submit_indexnow(db: AsyncSession, redis, force: bool = False) -> int:
    """Отправляет в IndexNow новые и изменённые (по lastmod) страницы. Возвращает их число."""
    if not settings.INDEXNOW_KEY:
        return 0
    urls = await site_urls(db)
    sent = {} if force else {
        k.decode(): v.decode() for k, v in (await redis.hgetall(INDEXNOW_SENT_KEY)).items()
    }
    changed = [u for u in urls if sent.get(u.path) != u.lastmod]
    if not changed:
        return 0
    payload = {
        "host": "redonate.gg",
        "key": settings.INDEXNOW_KEY,
        "keyLocation": f"{SITE}/{settings.INDEXNOW_KEY}.txt",
        "urlList": [SITE + u.path for u in changed],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(INDEXNOW_ENDPOINT, json=payload)
    # 200 — принято, 202 — принято, ключ ещё проверяется
    if resp.status_code not in (200, 202):
        raise RuntimeError(f"IndexNow {resp.status_code}: {resp.text[:200]}")
    await redis.hset(INDEXNOW_SENT_KEY, mapping={u.path: u.lastmod for u in changed})
    logger.info("IndexNow: отправлено %d адресов", len(changed))
    return len(changed)
