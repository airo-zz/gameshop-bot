from uuid import UUID

from fastapi import APIRouter, Query

from api.deps import CurrentUser, OptionalUser, DbSession
from api.schemas.catalog import (
    GameOut,
    CategoryOut,
    ProductListOut,
    ProductDetailOut,
    TrendingCategoryOut,
)
from api.services.catalog_service import CatalogService, _product_to_list_out

router = APIRouter()


@router.get("/games", response_model=list[GameOut])
async def list_games(
    db: DbSession,
    type: str | None = Query(None, pattern="^(game|service)$"),
):
    svc = CatalogService(db)
    return await svc.get_active_games(type=type)


@router.get("/games/search", response_model=list[GameOut])
async def search_games(
    db: DbSession,
    q: str = Query("", min_length=1),
):
    svc = CatalogService(db)
    return await svc.search_games(q)


@router.get("/games/{slug}/categories", response_model=list[CategoryOut])
async def list_categories(slug: str, db: DbSession):
    svc = CatalogService(db)
    game = await svc.get_game_by_slug(slug)
    if not game:
        from fastapi import HTTPException

        raise HTTPException(404, "Игра не найдена")
    return await svc.get_categories_by_game(game.id)


@router.get("/categories/trending", response_model=list[TrendingCategoryOut])
async def get_trending_categories(db: DbSession):
    svc = CatalogService(db)
    categories = await svc.get_trending_categories(limit=6)
    return [
        TrendingCategoryOut(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            game_name=cat.game.name if cat.game else "",
            game_slug=cat.game.slug if cat.game else "",
            game_image_url=cat.game.image_url if cat.game else None,
        )
        for cat in categories
    ]


@router.get("/products/trending", response_model=list[ProductListOut])
async def get_trending(db: DbSession):
    svc = CatalogService(db)
    products = await svc.get_trending(limit=6)
    return [_product_to_list_out(p) for p in products]


@router.get("/products", response_model=list[ProductListOut])
async def list_products(
    db: DbSession,
    category_id: UUID | None = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
):
    svc = CatalogService(db)
    products, _ = await svc.get_products_by_category(category_id, page, page_size)
    return [_product_to_list_out(p) for p in products]


@router.get("/products/search", response_model=list[ProductListOut])
async def search_products(
    db: DbSession,
    q: str = Query(""),
    page: int = Query(0, ge=0),
):
    svc = CatalogService(db)
    products, _ = await svc.search_products(q, page=page)
    return [_product_to_list_out(p) for p in products]


@router.get("/products/{product_id}", response_model=ProductDetailOut)
async def get_product(product_id: UUID, db: DbSession, user: OptionalUser = None):
    from fastapi import HTTPException

    svc = CatalogService(db)
    product = await svc.get_product_detail(product_id)
    if not product:
        raise HTTPException(404, "Товар не найден")
    if user:
        await svc.track_view(user.id, product.id)
    avg, count = await svc.get_product_avg_rating(product.id)
    game_name: str | None = None
    if product.category and product.category.game:
        game_name = product.category.game.name
    result = ProductDetailOut.model_validate(product)
    result.avg_rating = avg
    result.reviews_count = count
    result.game_name = game_name
    return result


@router.post("/products/{product_id}/favorite")
async def toggle_favorite(product_id: UUID, db: DbSession, user: CurrentUser):
    svc = CatalogService(db)
    added = await svc.toggle_favorite(user.id, product_id)
    return {"added": added}


@router.get("/favorites", response_model=list[ProductListOut])
async def get_favorites(db: DbSession, user: CurrentUser):
    svc = CatalogService(db)
    products = await svc.get_favorites(user.id)
    return [_product_to_list_out(p) for p in products]


@router.get("/recently-viewed", response_model=list[ProductListOut])
async def get_recently_viewed(db: DbSession, user: CurrentUser):
    svc = CatalogService(db)
    products = await svc.get_recently_viewed(user.id)
    return [_product_to_list_out(p) for p in products]
