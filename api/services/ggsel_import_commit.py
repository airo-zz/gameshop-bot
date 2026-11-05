"""
api/services/ggsel_import_commit.py
─────────────────────────────────────────────────────────────────────────────
Запись подтверждённого плана импорта GGSEL в каталог (вторая половина импорта;
разбор CSV — api/services/ggsel_import.py, без БД).

  • каждая группа вариантов → раздел игры (существующий раздел с тем же
    названием переиспользуется, дублей нет);
  • каждый вариант → товар: выдача «вручную», количество 1, цена в USD из
    ₽-суммы оффера по курсу RAPIRA, розничная ₽-цена — через наценку;
  • текстовые параметры оффера → поля покупателя на уровне игры (по ключу,
    без дублей);
  • товар с нулевой ценой создаётся неактивным.

Транзакцией управляет вызывающий (роутер): при ошибке сессия откатывается
целиком.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas.admin import ImportCommitIn
from api.services.pricing import rub_to_usd, usd_to_rub
from api.services.rapira_service import get_markup_percent, get_usd_rub_rate
from shared.models.catalog import Category, DeliveryType, Game, Product
from shared.slug import slugify_latin, unique_slug


async def unique_category_slug(db: AsyncSession, game_id, name: str) -> str:
    """Латинский адрес раздела, уникальный внутри игры (страница /game/<игра>/<раздел>)."""
    taken = set((await db.execute(
        select(Category.slug).where(Category.game_id == game_id)
    )).scalars().all())
    return unique_slug(slugify_latin(name), taken)


def _merge_game_fields(game: Game, body: ImportCommitIn) -> None:
    """Поля покупателя из оффера — на игру, объединяя по ключу."""
    new_fields = [f.model_dump() for f in body.input_fields]
    if not new_fields:
        return
    fields = list(game.input_fields or [])
    keys = {f.get("key") for f in fields if isinstance(f, dict)}
    for f in new_fields:
        if f.get("key") not in keys:
            fields.append(f)
            keys.add(f.get("key"))
    game.input_fields = fields


async def commit_ggsel_import(db: AsyncSession, game: Game, body: ImportCommitIn) -> tuple[int, int]:
    """Создаёт разделы и товары по плану. Возвращает (создано разделов, создано товаров)."""
    _merge_game_fields(game, body)

    # Курс и наценка — один раз на весь импорт
    rate = float(await get_usd_rub_rate(db))
    markup = float(await get_markup_percent(db))

    existing_by_name: dict[str, Category] = {
        c.name: c for c in (await db.execute(
            select(Category).where(Category.game_id == game.id)
        )).scalars()
    }
    next_sort = ((await db.execute(
        select(func.coalesce(func.max(Category.sort_order), 0)).where(Category.game_id == game.id)
    )).scalar_one() or 0) + 1

    categories_created = products_created = 0
    for cat_item in body.categories:
        category = existing_by_name.get(cat_item.name)
        if category is None:
            category = Category(
                game_id=game.id,
                name=cat_item.name,
                slug=await unique_category_slug(db, game.id, cat_item.name),
                is_active=True,
                sort_order=next_sort,
            )
            next_sort += 1
            db.add(category)
            await db.flush()
            existing_by_name[cat_item.name] = category
            categories_created += 1

        for idx, prod in enumerate(cat_item.products):
            # ₽-себестоимость варианта = базовая цена оффера + модификатор → USD (источник истины)
            rub_cost = max(0.0, body.base_price + prod.price_modifier)
            price_usd = rub_to_usd(rub_cost, rate)
            price_rub = usd_to_rub(price_usd, rate, markup)
            db.add(Product(
                category_id=category.id,
                name=prod.name,
                price=Decimal(str(price_rub)),
                price_usd=Decimal(str(price_usd)),
                quantity=1,
                delivery_type=DeliveryType.manual,
                is_active=price_rub > 0,
                sort_order=idx,
            ))
            products_created += 1

    await db.flush()
    return categories_created, products_created
