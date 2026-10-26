"""
api/services/home_service.py
─────────────────────────────────────────────────────────────────────────────
Блоки главной страницы сайта, которые настраиваются в админке:
  • hero    — обложки игр на первом экране (до 6, по порядку);
  • popular — разделы в блоке «Популярное» (до 8, по порядку);
  • topup   — блок быстрого пополнения: Telegram Stars / Premium и Steam
              (находится сам: по Category.auto_engine и товару FazerCards steam_topup).
Если ничего не выбрано — автоматически, как раньше: первые игры каталога
с обложкой и разделы по заказам за 3 дня (или закреплённые).
Хранится в shop_settings JSON-списками id.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.services.catalog_service import CatalogService, _product_to_list_out
from shared.models import Category, Game, Product
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


# ── Сводка по разделам «Популярного» ─────────────────────────────────────────

def _qty_field(p: Product) -> dict | None:
    """Поле «Количество» товара «за единицу» (Stars, сумма Steam)."""
    return next((f for f in p.input_fields or [] if isinstance(f, dict) and f.get("type") == "quantity"), None)


def _qty_min(p: Product) -> int:
    """Минимум для товара «за единицу», иначе 1."""
    try:
        return max(1, int((_qty_field(p) or {}).get("min") or 1))
    except (TypeError, ValueError):
        return 1


async def category_summaries(db: AsyncSession, cat_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """{id раздела: {min_price, has_auto}} — цена «от» (для товара за единицу —
    за минимальное количество) и есть ли автовыдача. Товары подразделов считаются."""
    if not cat_ids:
        return {}
    rows = (await db.execute(
        select(Product, Category.id, Category.parent_id)
        .join(Category, Category.id == Product.category_id)
        .where(
            (Category.id.in_(cat_ids)) | (Category.parent_id.in_(cat_ids)),
            Category.is_active.is_(True),
            Product.is_active.is_(True),
        )
    )).all()
    out: dict[uuid.UUID, dict] = {}
    for p, cid, parent in rows:
        root = cid if cid in cat_ids else parent
        s = out.setdefault(root, {"min_price": None, "has_auto": False})
        if str(getattr(p.delivery_type, "value", p.delivery_type) or "").startswith("auto"):
            s["has_auto"] = True
        if p.is_out_of_stock:
            continue
        price = Decimal(p.price) * _qty_min(p)
        if s["min_price"] is None or price < s["min_price"]:
            s["min_price"] = price
    return out


# ── Быстрое пополнение ───────────────────────────────────────────────────────

def _buyer_fields(cat: Category) -> list[dict]:
    """Поля получателя (@username, логин Steam) — раздела или игры, без «Количества»."""
    fields = cat.input_fields or (cat.game.input_fields if cat.game else None) or []
    return [f for f in fields if isinstance(f, dict) and f.get("type") != "quantity"]


async def resolve_topup(db: AsyncSession) -> list[dict]:
    """
    Варианты блока быстрого пополнения в порядке вкладок: stars, premium, steam.
    Вариант без активных товаров не попадает — вкладка появится сама,
    когда товар заведут (Steam — импортом FazerCards «Steam по логину»).
    """
    base = (
        select(Product)
        .join(Category, Category.id == Product.category_id)
        .join(Game, Game.id == Category.game_id)
        .options(selectinload(Product.category).selectinload(Category.game))
        .where(Product.is_active.is_(True), Category.is_active.is_(True), Game.is_active.is_(True))
        .order_by(Product.sort_order, Product.price)
    )
    groups = {
        "stars": base.where(Category.auto_engine == "telegram_stars"),
        "premium": base.where(Category.auto_engine == "telegram_premium"),
        "steam": base.where(Product.meta["fazer"]["kind"].astext == "steam_topup"),
    }
    out: list[dict] = []
    for kind, q in groups.items():
        products = list((await db.execute(q)).scalars().all())
        if kind in ("stars", "steam"):
            # нужен товар «за единицу»: покупатель вводит количество/сумму
            products = [p for p in products if _qty_field(p)]
        if not products:
            continue
        cat = products[0].category
        out.append({
            "kind": kind,
            "game_slug": cat.game.slug,
            "category_slug": cat.slug,
            "category_name": cat.name,
            "fields": _buyer_fields(cat),
            "products": [_product_to_list_out(p) for p in products if p.category_id == cat.id],
        })
    return out
