from fastapi import APIRouter, Query

from api.deps import CurrentUser, OptionalUser, DbSession
from api.schemas.catalog import (
    GameOut,
    CategoryOut,
    ProductListOut,
    ProductDetailOut,
)
from api.services.catalog_service import CatalogService

router = APIRouter()


@router.get("/games", response_model=list[GameOut])
async def list_games(db: DbSession):
    svc = CatalogService(db)
    return await svc.get_active_games()


@router.get("/games/{slug}/categories", response_model=list[CategoryOut])
async def list_categories(slug: str, db: DbSession):
    svc = CatalogService(db)
    game = await svc.get_game_by_slug(slug)
    if not game:
        from fastapi import HTTPException

        raise HTTPException(404, "Игра не найдена")
    return await svc.get_categories_by_game(game.id)


@router.get("/products", response_model=list[ProductListOut])
async def list_products(
    db: DbSession,
    category_id: str | None = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
):
    import uuid

    svc = CatalogService(db)
    cat_uuid = uuid.UUID(category_id) if category_id else None
    products, _ = await svc.get_products_by_category(cat_uuid, page, page_size)
    return products


@router.get("/products/search", response_model=list[ProductListOut])
async def search_products(
    db: DbSession,
    q: str = Query(""),
    page: int = Query(0, ge=0),
):
    svc = CatalogService(db)
    products, _ = await svc.search_products(q, page=page)
    return products


@router.get("/products/{product_id}", response_model=ProductDetailOut)
async def get_product(product_id: str, db: DbSession, user: OptionalUser = None):
    import uuid
    from fastapi import HTTPException

    svc = CatalogService(db)
    product = await svc.get_product_detail(uuid.UUID(product_id))
    if not product:
        raise HTTPException(404, "Товар не найден")
    if user:
        await svc.track_view(user.id, product.id)
    avg, count = await svc.get_product_avg_rating(product.id)
    result = ProductDetailOut.model_validate(product)
    result.avg_rating = avg
    result.reviews_count = count
    return result


@router.post("/products/{product_id}/favorite")
async def toggle_favorite(product_id: str, db: DbSession, user: CurrentUser):
    import uuid

    svc = CatalogService(db)
    added = await svc.toggle_favorite(user.id, uuid.UUID(product_id))
    return {"added": added}


@router.get("/favorites", response_model=list[ProductListOut])
async def get_favorites(db: DbSession, user: CurrentUser):
    svc = CatalogService(db)
    return await svc.get_favorites(user.id)


@router.get("/recently-viewed", response_model=list[ProductListOut])
async def get_recently_viewed(db: DbSession, user: CurrentUser):
    svc = CatalogService(db)
    return await svc.get_recently_viewed(user.id)
