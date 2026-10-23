"""
api/services/home_service.py
─────────────────────────────────────────────────────────────────────────────
Блоки главной страницы сайта, которые настраиваются в админке:
  • hero    — обложки игр на первом экране (до 6, по порядку);
  • popular — разделы в блоке «Популярное» (до 8, по порядку).
Если ничего не выбрано — автоматически, как раньше: первые игры каталога
с обложкой и разделы по заказам за 3 дня (или закреплённые).
Хранится в shop_settings JSON-списками id.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.services.catalog_service import CatalogService
from shared.models import Category, Game
from shared.models.user import ShopSettings

logger = logging.getLogger(__name__)

HERO_KEY = "home_hero_games"
POPULAR_KEY = "home_popular_categories"
HERO_MAX = 6
POPULAR_MAX = 8


async def _read_ids(db: AsyncSession, key: str) -> list[uuid.UUID]:
    row = (await db.execute(select(ShopSettings).where(ShopSettings.key == key))).scalar_one_or_none()
    if not row or not row.value:
        return []
    try:
        return [uuid.UUID(x) for x in json.loads(row.value)]
    except (ValueError, TypeError):
        logger.warning("Некорректное значение shop_settings %s=%r", key, row.value)
        return []


async def _write_ids(db: AsyncSession, key: str, ids: list[uuid.UUID], description: str) -> None:
    row = (await db.execute(select(ShopSettings).where(ShopSettings.key == key))).scalar_one_or_none()
    value = json.dumps([str(i) for i in ids])
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=key, value=value, description=description))


async def get_config(db: AsyncSession) -> dict[str, list[uuid.UUID]]:
    return {"hero": await _read_ids(db, HERO_KEY), "popular": await _read_ids(db, POPULAR_KEY)}


async def set_config(db: AsyncSession, hero: list[uuid.UUID], popular: list[uuid.UUID]) -> None:
    await _write_ids(db, HERO_KEY, list(dict.fromkeys(hero))[:HERO_MAX],
                     "Обложки игр на первом экране сайта (id по порядку)")
    await _write_ids(db, POPULAR_KEY, list(dict.fromkeys(popular))[:POPULAR_MAX],
                     "Разделы в блоке «Популярное» на главной сайта (id по порядку)")


async def resolve_home(db: AsyncSession) -> tuple[list[Game], list[Category]]:
    """Итоговые блоки: выбранное в админке (только активное) или автоматически."""
    cfg = await get_config(db)
    svc = CatalogService(db)

    hero: list[Game] = []
    if cfg["hero"]:
        rows = (await db.execute(
            select(Game).where(Game.id.in_(cfg["hero"]), Game.is_active.is_(True))
        )).scalars().all()
        by_id = {g.id: g for g in rows}
        hero = [by_id[i] for i in cfg["hero"] if i in by_id]
    if not hero:
        hero = [g for g in await svc.get_active_games(type="game") if g.image_url][:HERO_MAX]

    popular: list[Category] = []
    if cfg["popular"]:
        rows = (await db.execute(
            select(Category).join(Game, Game.id == Category.game_id)
            .options(selectinload(Category.game))
            .where(Category.id.in_(cfg["popular"]), Category.is_active.is_(True), Game.is_active.is_(True))
        )).scalars().all()
        by_id = {c.id: c for c in rows}
        popular = [by_id[i] for i in cfg["popular"] if i in by_id]
    if not popular:
        popular = list(await svc.get_trending_categories(limit=POPULAR_MAX))
    return hero, popular
