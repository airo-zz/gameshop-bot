"""
api/routers/admin/catalog.py
─────────────────────────────────────────────────────────────────────────────
Admin API: управление каталогом (игры, категории, товары, лоты).
─────────────────────────────────────────────────────────────────────────────
"""

import re
import uuid
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.schemas.admin import (
    BulkPriceUpdateIn,
    CategoryCreateIn,
    CategoryOut,
    CategoryUpdateIn,
    GameCreateIn,
    GameOut,
    GameUpdateIn,
    LotCreateIn,
    LotOut,
    LotUpdateIn,
    PaginatedResponse,
    ProductCreateIn,
    ProductListItem,
    ProductOut,
    ProductUpdateIn,
)
from api.utils.admin_log import log_admin_action
from shared.models.catalog import Category, Game, Product, ProductLot

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _slugify(name: str) -> str:
    """Генерирует slug из имени если не передан явно."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    slug = slug.strip("-")
    return slug


# ── Games ─────────────────────────────────────────────────────────────────────


@router.get("/games", response_model=list[GameOut])
async def list_games(
    db: DbSession,
    admin: CurrentAdmin,
    is_active: bool | None = Query(None),
    type: str | None = Query(None, pattern="^(game|service)$"),
) -> list[GameOut]:
    q = select(Game).order_by(Game.sort_order, Game.name)
    if is_active is not None:
        q = q.where(Game.is_active == is_active)
    if type is not None:
        q = q.where(Game.type == type)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/games", response_model=GameOut, status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("catalog.edit")])
async def create_game(
    body: GameCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> GameOut:
    slug = body.slug or _slugify(body.name)

    existing = await db.execute(select(Game).where(Game.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Игра со slug '{slug}' уже существует",
        )

    game = Game(
        name=body.name,
        slug=slug,
        image_url=body.image_url,
        description=body.description,
        is_active=body.is_active,
        is_featured=body.is_featured,
        sort_order=body.sort_order,
        type=body.type,
    )
    db.add(game)
    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="game.create",
        entity_type="game",
        entity_id=game.id,
        after_data={"name": game.name, "slug": game.slug},
    )

    return game


@router.patch("/games/{game_id}", response_model=GameOut,
              dependencies=[require_permission("catalog.edit")])
async def update_game(
    game_id: uuid.UUID,
    body: GameUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> GameOut:
    result = await db.execute(select(Game).where(Game.id == game_id))
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Игра не найдена")

    before = {"name": game.name, "slug": game.slug, "is_active": game.is_active}

    update_data = body.model_dump(exclude_none=True)

    if "slug" in update_data and update_data["slug"] != game.slug:
        dup = await db.execute(
            select(Game).where(Game.slug == update_data["slug"], Game.id != game_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Slug '{update_data['slug']}' уже занят",
            )

    for field, value in update_data.items():
        setattr(game, field, value)

    await log_admin_action(
        db=db,
        admin=admin,
        action="game.update",
        entity_type="game",
        entity_id=game.id,
        before_data=before,
        after_data=update_data,
    )

    return game


# ── Categories ────────────────────────────────────────────────────────────────


@router.get("/games/{game_id}/categories", response_model=list[CategoryOut])
async def list_categories(
    game_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> list[CategoryOut]:
    result = await db.execute(
        select(Game).where(Game.id == game_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Игра не найдена")

    cats = await db.execute(
        select(Category)
        .where(Category.game_id == game_id)
        .order_by(Category.sort_order, Category.name)
    )
    return cats.scalars().all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("catalog.edit")])
async def create_category(
    body: CategoryCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> CategoryOut:
    game = await db.execute(select(Game).where(Game.id == body.game_id))
    if not game.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Игра не найдена")

    if body.parent_id:
        parent = await db.execute(
            select(Category).where(
                Category.id == body.parent_id,
                Category.game_id == body.game_id,
            )
        )
        if not parent.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Родительская категория не найдена",
            )

    slug = body.slug or _slugify(body.name)

    category = Category(
        game_id=body.game_id,
        parent_id=body.parent_id,
        name=body.name,
        slug=slug,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(category)
    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="category.create",
        entity_type="category",
        entity_id=category.id,
        after_data={"name": category.name, "game_id": str(body.game_id)},
    )

    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut,
              dependencies=[require_permission("catalog.edit")])
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> CategoryOut:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")

    before = {"name": category.name, "is_active": category.is_active}
    update_data = body.model_dump(exclude_none=True)

    for field, value in update_data.items():
        setattr(category, field, value)

    await log_admin_action(
        db=db,
        admin=admin,
        action="category.update",
        entity_type="category",
        entity_id=category.id,
        before_data=before,
        after_data=update_data,
    )

    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[require_permission("catalog.edit")])
async def delete_category(
    category_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")

    await log_admin_action(
        db=db,
        admin=admin,
        action="category.delete",
        entity_type="category",
        entity_id=category.id,
        before_data={"name": category.name},
    )

    await db.delete(category)


# ── Products ──────────────────────────────────────────────────────────────────


@router.get("/products", response_model=PaginatedResponse[ProductListItem])
async def list_products(
    db: DbSession,
    admin: CurrentAdmin,
    game_id: uuid.UUID | None = Query(None),
    category_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None, max_length=128),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[ProductListItem]:
    q = select(Product)

    if category_id:
        q = q.where(Product.category_id == category_id)
    elif game_id:
        category_ids_q = select(Category.id).where(Category.game_id == game_id)
        q = q.where(Product.category_id.in_(category_ids_q))

    if is_active is not None:
        q = q.where(Product.is_active == is_active)

    if search:
        q = q.where(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.short_description.ilike(f"%{search}%"),
            )
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.order_by(Product.sort_order, Product.name)
    q = q.offset((page - 1) * page_size).limit(page_size)

    items_result = await db.execute(q)
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total else 1,
    )


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> ProductOut:
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots))
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")
    return product


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("catalog.edit")])
async def create_product(
    body: ProductCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> ProductOut:
    cat = await db.execute(select(Category).where(Category.id == body.category_id))
    if not cat.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")

    from decimal import Decimal
    from shared.models.catalog import DeliveryType

    try:
        delivery_type = DeliveryType(body.delivery_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Недопустимый delivery_type: {body.delivery_type}",
        )

    product = Product(
        category_id=body.category_id,
        name=body.name,
        description=body.description,
        short_description=body.short_description,
        price=Decimal(str(body.price)),
        stock=body.stock,
        delivery_type=delivery_type,
        input_fields=body.input_fields,
        instruction=body.instruction,
        images=body.images,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(product)
    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="product.create",
        entity_type="product",
        entity_id=product.id,
        after_data={"name": product.name, "category_id": str(body.category_id)},
    )

    # Подгружаем lots для ответа
    await db.refresh(product, ["lots"])
    return product


@router.patch("/products/{product_id}", response_model=ProductOut,
              dependencies=[require_permission("catalog.edit")])
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> ProductOut:
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots))
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")

    before = {"name": product.name, "is_active": product.is_active, "price": str(product.price)}
    update_data = body.model_dump(exclude_none=True)

    if "category_id" in update_data:
        cat = await db.execute(
            select(Category).where(Category.id == update_data["category_id"])
        )
        if not cat.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена"
            )

    if "delivery_type" in update_data:
        from shared.models.catalog import DeliveryType
        try:
            update_data["delivery_type"] = DeliveryType(update_data["delivery_type"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Недопустимый delivery_type: {update_data['delivery_type']}",
            )

    if "price" in update_data:
        from decimal import Decimal
        update_data["price"] = Decimal(str(update_data["price"]))

    for field, value in update_data.items():
        setattr(product, field, value)

    await log_admin_action(
        db=db,
        admin=admin,
        action="product.update",
        entity_type="product",
        entity_id=product.id,
        before_data=before,
        after_data={k: str(v) if not isinstance(v, (str, bool, int, list, dict, type(None))) else v
                    for k, v in update_data.items()},
    )

    return product


# ── Lots ──────────────────────────────────────────────────────────────────────


@router.post("/products/{product_id}/lots", response_model=LotOut,
             status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("catalog.edit")])
async def create_lot(
    product_id: uuid.UUID,
    body: LotCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> LotOut:
    result = await db.execute(select(Product).where(Product.id == product_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")

    from decimal import Decimal

    lot = ProductLot(
        product_id=product_id,
        name=body.name,
        price=Decimal(str(body.price)),
        original_price=Decimal(str(body.original_price)) if body.original_price is not None else None,
        quantity=body.quantity,
        badge=body.badge,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(lot)
    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="lot.create",
        entity_type="lot",
        entity_id=lot.id,
        after_data={"name": lot.name, "price": str(lot.price), "product_id": str(product_id)},
    )

    return lot


@router.patch("/lots/{lot_id}", response_model=LotOut,
              dependencies=[require_permission("catalog.edit")])
async def update_lot(
    lot_id: uuid.UUID,
    body: LotUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> LotOut:
    result = await db.execute(select(ProductLot).where(ProductLot.id == lot_id))
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Лот не найден")

    before = {"name": lot.name, "price": str(lot.price), "is_active": lot.is_active}
    update_data = body.model_dump(exclude_none=True)

    from decimal import Decimal

    for key in ("price", "original_price"):
        if key in update_data and update_data[key] is not None:
            update_data[key] = Decimal(str(update_data[key]))

    for field, value in update_data.items():
        setattr(lot, field, value)

    await log_admin_action(
        db=db,
        admin=admin,
        action="lot.update",
        entity_type="lot",
        entity_id=lot.id,
        before_data=before,
        after_data={k: str(v) if not isinstance(v, (str, bool, int, list, dict, type(None))) else v
                    for k, v in update_data.items()},
    )

    return lot


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[require_permission("catalog.edit")])
async def delete_product(
    product_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")

    await log_admin_action(
        db=db,
        admin=admin,
        action="product.delete",
        entity_type="product",
        entity_id=product.id,
        before_data={"name": product.name, "category_id": str(product.category_id)},
    )

    await db.delete(product)


@router.post("/products/bulk-price-update",
             dependencies=[require_permission("catalog.edit")])
async def bulk_price_update(
    body: BulkPriceUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    from decimal import Decimal, ROUND_HALF_UP

    # Определяем целевые товары
    q = select(Product)
    if body.scope == "game" and body.game_id:
        category_ids_q = select(Category.id).where(Category.game_id == body.game_id)
        q = q.where(Product.category_id.in_(category_ids_q))
    elif body.scope == "category" and body.category_id:
        q = q.where(Product.category_id == body.category_id)
    elif body.scope == "selected" and body.product_ids:
        q = q.where(Product.id.in_(body.product_ids))
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Некорректные параметры scope/id")

    if body.include_lots:
        q = q.options(selectinload(Product.lots))

    result = await db.execute(q)
    products = result.scalars().all()

    value = Decimal(str(body.value))
    updated_count = 0

    for product in products:
        if body.mode == "percent":
            new_price = (product.price * (1 + value / 100)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            new_price = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        product.price = new_price
        updated_count += 1

        if body.include_lots:
            for lot in product.lots:
                if body.mode == "percent":
                    lot.price = (lot.price * (1 + value / 100)).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                else:
                    lot.price = new_price

    await log_admin_action(
        db=db,
        admin=admin,
        action="product.bulk_price_update",
        entity_type="product",
        entity_id=None,
        after_data={
            "mode": body.mode,
            "value": str(body.value),
            "scope": body.scope,
            "updated_count": updated_count,
            "include_lots": body.include_lots,
        },
    )

    return {"updated_count": updated_count}


@router.delete("/lots/{lot_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[require_permission("catalog.edit")])
async def delete_lot(
    lot_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    result = await db.execute(select(ProductLot).where(ProductLot.id == lot_id))
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Лот не найден")

    await log_admin_action(
        db=db,
        admin=admin,
        action="lot.delete",
        entity_type="lot",
        entity_id=lot.id,
        before_data={"name": lot.name, "product_id": str(lot.product_id)},
    )

    await db.delete(lot)
