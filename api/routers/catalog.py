from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

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


def _category_to_out(
    cat,
    delivery_map: dict,
) -> CategoryOut:
    """Конвертирует ORM Category в CategoryOut с агрегированным delivery_type."""
    # Для дочерних категорий берём их собственный тип из delivery_map
    children = [_category_to_out(child, delivery_map) for child in (cat.children or [])]
    # Если у корневой категории есть дочерние — агрегируем их типы
    if children:
        child_types = {c.delivery_type for c in children if c.delivery_type and c.delivery_type != "empty"}
        if not child_types:
            delivery_type = None
        elif len(child_types) == 1:
            delivery_type = child_types.pop()
        else:
            delivery_type = "mixed"
    else:
        raw = delivery_map.get(cat.id)
        delivery_type = raw if raw not in (None, "empty") else None

    return CategoryOut(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        image_url=cat.image_url,
        description=cat.description,
        sort_order=cat.sort_order,
        parent_id=cat.parent_id,
        children=children,
        delivery_type=delivery_type,
        auto_engine=cat.auto_engine,
        input_fields=cat.input_fields,
    )


@router.get("/games/{slug}/seo")
async def get_game_seo(slug: str, db: DbSession, cat: str | None = None):
    """
    Тексты страницы игры (или раздела ?cat=<slug>) — те же, что видит поисковик:
    заголовок, описание, H1, другие названия, текст о донате.
    """
    from api.services.seo_content import load_game_page

    data = await load_game_page(db, slug, cat)
    if data is None:
        raise HTTPException(status_code=404, detail="Страница не найдена")
    _game, _roots, _offers, _current, page = data
    return {
        "title": page.title,
        "description": page.description,
        "h1": page.h1,
        "intro": page.intro,
        "aliases": page.aliases,
        "text": page.text,
    }


@router.get("/games/{slug}/categories", response_model=list[CategoryOut])
async def list_categories(slug: str, db: DbSession):
    svc = CatalogService(db)
    game = await svc.get_game_by_slug(slug)
    if not game:
        from fastapi import HTTPException

        raise HTTPException(404, "Игра не найдена")
    categories = await svc.get_categories_by_game(game.id)
    delivery_map = await svc.get_delivery_types_for_game(game.id)
    return [_category_to_out(cat, delivery_map) for cat in categories]


@router.get("/faq")
async def get_faq():
    """Страница «Вопросы и ответы»: разделы с вопросами (api/services/faq_content.py)."""
    from api.services.faq_content import FAQ_SECTIONS

    return [
        {"slug": s["slug"], "title": s["title"], "items": [{"q": q, "a": a} for q, a in s["items"]]}
        for s in FAQ_SECTIONS
    ]


@router.get("/home")
async def get_home_blocks(db: DbSession):
    """Блоки главной сайта: обложки первого экрана, «Популярное» (настраиваются
    в админке) и быстрое пополнение Stars / Premium / Steam."""
    from api.services.home_service import category_summaries, resolve_home, resolve_topup

    hero, popular = await resolve_home(db)
    summary = await category_summaries(db, [c.id for c in popular])
    return {
        "hero": [GameOut.model_validate(g) for g in hero],
        "popular": [
            TrendingCategoryOut(
                id=c.id, name=c.name, slug=c.slug,
                game_name=c.game.name if c.game else "",
                game_slug=c.game.slug if c.game else "",
                game_image_url=c.game.image_url if c.game else None,
                **summary.get(c.id, {}),
            )
            for c in popular
        ],
        "topup": await resolve_topup(db),
    }


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


@router.get("/loyalty")
async def get_loyalty_program(db: DbSession):
    """Публичное описание программы лояльности (страница /cashback на сайте):
    уровни с порогами трат за месяц, кэшбэком и лимитом + условия рефералки."""
    from api.services.loyalty_service import (
        REFERRAL_DISCOUNT_KEY, REFERRAL_MONTHS_KEY, REFERRAL_PERCENT_KEY, LoyaltyService,
    )

    svc = LoyaltyService(db)
    levels = await svc.get_levels()
    ref = await svc.get_referral_settings()
    return {
        "levels": [
            {
                "name": lv.name,
                "min_spent": float(lv.min_spent),
                "cashback_percent": float(lv.cashback_percent),
                "monthly_cashback_cap": (
                    float(lv.monthly_cashback_cap) if lv.monthly_cashback_cap is not None else None
                ),
                "color_hex": lv.color_hex,
            }
            for lv in levels
        ],
        "referral": {
            "percent": float(ref[REFERRAL_PERCENT_KEY]),
            "period_months": int(ref[REFERRAL_MONTHS_KEY]),
            "new_user_discount_percent": float(ref[REFERRAL_DISCOUNT_KEY]),
        },
    }


@router.get("/decor")
async def decor_catalog(db: DbSession) -> dict:
    """Каталог украшений Discord для страницы-витрины (все позиции одним ответом)."""
    from api.services.decor_catalog import public_catalog

    data = await public_catalog(db)
    if data is None:
        raise HTTPException(status_code=404, detail="Каталог украшений недоступен")
    return data
