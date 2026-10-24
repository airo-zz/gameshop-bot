"""
api/services/ggsel_reviews.py
─────────────────────────────────────────────────────────────────────────────
Выгрузка отзывов продавца с GGSEL в таблицу reviews (source='ggsel').

API продавца: https://seller.ggsel.com/api_sellers/api
(seller.ggsel.net отдаёт 502, сайт ggsel.net режет зарубежные IP — .com работает).
  POST /apilogin {seller_id, timestamp, sign=sha256(key+timestamp)} → token
  GET  /reviews?seller_id=&type=all&rows=100&page=N  (Bearer token)
       → reviews[{id, type good|bad, name (товар), date «ДД.ММ.ГГГГ», info, comment}]
Страницы — от новых к старым; останавливаемся на странице без новых отзывов
(totalItems у GGSEL — заглушка 999).

Игра отзыва: ищем название/другие названия игр каталога в названии лота,
иначе — известные игры из GAME_PATTERNS, иначе — первая часть названия лота.
Отзывы без игры каталога перепривязываются при каждой синхронизации —
заведёте игру (например, Brawl Stars) — её отзывы подтянутся сами.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.seo_content import aliases
from shared.config import settings
from shared.models import Game, Review

logger = logging.getLogger(__name__)

API = "https://seller.ggsel.com/api_sellers/api"
SOURCE = "ggsel"
MAX_PAGES = 200

# Игры, которых может не быть в каталоге: шаблон в названии лота → название для показа
GAME_PATTERNS: list[tuple[str, str]] = [
    (r"discord", "Discord"),
    (r"telegram", "Telegram"),
    (r"brawl", "Brawl Stars"),
    (r"ea sports fc|fc points|fc 2\d", "EA SPORTS FC"),
    (r"marvel rivals|lattices", "Marvel Rivals"),
    (r"world of tanks|\bwot\b", "World of Tanks"),
    (r"mobile legends", "Mobile Legends"),
    (r"pubg", "PUBG Mobile"),
    (r"mortal kombat", "Mortal Kombat Mobile"),
    (r"call of dragons", "Call of Dragons"),
    (r"star citizen|starter pack", "Star Citizen"),
    (r"playstation", "PlayStation Store"),
    (r"genshin", "Genshin Impact"),
    (r"honkai", "Honkai: Star Rail"),
]


class GgselError(Exception):
    pass


async def _login(client: httpx.AsyncClient) -> str:
    ts = int(time.time())
    sign = hashlib.sha256(f"{settings.GGSEL_API_KEY}{ts}".encode()).hexdigest()
    resp = await client.post(
        f"{API}/apilogin",
        json={"seller_id": settings.GGSEL_SELLER_ID, "timestamp": ts, "sign": sign},
    )
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    token = data.get("token")
    if not token:
        raise GgselError(f"apilogin HTTP {resp.status_code}: {data.get('desc') or data or resp.text[:200]}")
    return token


def _clean(name: str) -> str:
    s = re.sub(r"[^\w\s.,:;!?()+\-—–/&']", " ", name or "", flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


class GameMatcher:
    """Сопоставление названия лота GGSEL с игрой каталога."""

    def __init__(self, games: list[Game]):
        names: list[tuple[str, Game]] = []
        for g in games:
            for n in [g.name, *aliases(g)]:
                if len(n) >= 3:
                    names.append((n.lower(), g))
        # длинные названия раньше: «FC Mobile» не должен перехватить «EA SPORTS FC»
        self._names = sorted(names, key=lambda x: -len(x[0]))

    def match(self, product_name: str) -> tuple[Game | None, str | None]:
        low = (product_name or "").lower()
        for n, g in self._names:
            if n in low:
                return g, None
        for pattern, title in GAME_PATTERNS:
            if re.search(pattern, low):
                return None, title
        # «24/7 - Undecember - Донат | Алмазы» → «Undecember»
        parts = [p.strip() for p in re.split(r"\s[-|/]\s|\|", _clean(product_name)) if p.strip()]
        parts = [p.strip(" -") for p in parts]
        parts = [p for p in parts if p and not re.fullmatch(r"(24/7|авто(выдача)?( 24/7)?|донат)", p.lower())]
        # Служебные лоты («Доплата за товар») — без игры
        if not parts or re.search(r"доплата", parts[0].lower()):
            return None, None
        return None, parts[0][:128]


def _parse_date(s: str) -> datetime:
    try:
        d = datetime.strptime(s.strip(), "%d.%m.%Y")
        # Время у GGSEL не отдаётся — полдень МСК, чтобы дата не «уезжала» по поясам
        return d.replace(hour=9, tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)


async def sync_ggsel_reviews(db: AsyncSession, full: bool = False) -> dict:
    """
    Загружает новые отзывы (full=True — пройти все страницы) и перепривязывает
    отзывы без игры каталога. Возвращает {added, updated, relinked}.
    """
    if not settings.GGSEL_API_KEY:
        raise GgselError("GGSEL_API_KEY не задан")

    games = list((await db.execute(select(Game).where(Game.is_active == True))).scalars().all())  # noqa: E712
    matcher = GameMatcher(games)

    existing: dict[str, Review] = {
        r.external_id: r
        for r in (await db.execute(select(Review).where(Review.source == SOURCE))).scalars().all()
    }

    added = updated = 0
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        seen_ids: set[str] = set()
        for page in range(1, MAX_PAGES + 1):
            resp = await client.get(
                f"{API}/reviews",
                params={"seller_id": settings.GGSEL_SELLER_ID, "type": "all", "lang": "ru-RU",
                        "rows": 100, "page": page},
                headers=headers,
            )
            if resp.status_code != 200:
                raise GgselError(f"reviews HTTP {resp.status_code}: {resp.text[:200]}")
            rows = resp.json().get("reviews") or []
            fresh = [x for x in rows if str(x.get("id")) not in seen_ids]
            if not fresh:
                break
            page_new = 0
            for x in fresh:
                ext = str(x["id"])
                seen_ids.add(ext)
                text = (x.get("info") or "").strip() or None
                reply = (x.get("comment") or "").strip() or None
                rating = 5 if x.get("type") == "good" else 1
                r = existing.get(ext)
                if r:
                    # GGSEL позволяет покупателю поменять оценку/текст, продавцу — ответить
                    if (r.text, r.reply, r.rating) != (text, reply, rating):
                        r.text, r.reply, r.rating = text, reply, rating
                        updated += 1
                    continue
                game, game_name = matcher.match(x.get("name") or "")
                r = Review(
                    source=SOURCE,
                    external_id=ext,
                    rating=rating,
                    text=text,
                    reply=reply,
                    product_name=(x.get("name") or "")[:255] or None,
                    game_id=game.id if game else None,
                    game_name=game_name,
                    created_at=_parse_date(x.get("date") or ""),
                    is_visible=True,
                )
                db.add(r)
                existing[ext] = r
                added += 1
                page_new += 1
            if not full and page_new == 0:
                break  # дошли до уже загруженных — дальше только старые

    # Перепривязка: появились игры в каталоге или их другие названия
    relinked = 0
    for r in existing.values():
        if r.game_id is None and r.product_name:
            game, _ = matcher.match(r.product_name)
            if game:
                r.game_id, r.game_name = game.id, None
                relinked += 1

    await db.commit()
    logger.info("GGSEL reviews: +%d, изменено %d, привязано к играм %d", added, updated, relinked)
    return {"added": added, "updated": updated, "relinked": relinked}
