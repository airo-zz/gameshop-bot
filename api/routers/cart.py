"""api/routers/cart.py"""

from fastapi import APIRouter, HTTPException, Request, status
from api.deps import CurrentUser, DbSession
from api.rate_limit import limiter
from api.schemas.cart import (
    AddToCartRequest,
    CartItemOut,
    UpdateCartItemRequest,
    ApplyPromoRequest,
    CartOut,
)
from api.services.cart_service import CartService
from shared.config import settings

router = APIRouter()


@router.get("", response_model=CartOut)
async def get_cart(db: DbSession, user: CurrentUser):
    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    summary = await svc.get_cart_summary(cart, user)

    items_out = []
    for item in cart.items:
        product_name = item.product.name if item.product else ""
        product_image = (
            item.product.images[0] if item.product and item.product.images else None
        )

        items_out.append(
            CartItemOut(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                price_snapshot=item.price_snapshot,
                subtotal=item.subtotal,
                input_data=item.input_data,
                product_name=product_name,
                product_image=product_image,
            )
        )

    return CartOut(
        id=cart.id,
        items=items_out,
        items_count=cart.items_count,
        subtotal=summary["subtotal"],
        discount_amount=summary["discount_amount"],
        total=summary["total"],
        promo_code=summary["promo_code"],
        promo_discount=summary["promo_discount"],
        expires_at=cart.expires_at,
    )


@router.get("/quote")
async def get_cart_quote(db: DbSession, user: CurrentUser):
    """Итоговая сумма корзины по каждому способу оплаты (с наценкой метода)."""
    from api.services.pricing import method_total
    from api.services.rapira_service import DISPLAY_GROUP, get_all_markups

    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    summary = await svc.get_cart_summary(cart, user)
    base = float(summary["total"])  # база показа (без наценки метода) с учётом скидки
    markups = await get_all_markups(db)
    disp = markups[DISPLAY_GROUP]  # наценка, заложенная в base (по умолч. баланс = 0)
    return {
        "crypto": method_total(base, disp, markups["crypto"]),
        "balance": method_total(base, disp, markups["balance"]),
        "card": method_total(base, disp, markups["card"]),
        "sbp": method_total(base, disp, markups["sbp"]),
    }


@router.get("/checkout-fields")
async def get_checkout_fields(db: DbSession, user: CurrentUser):
    """
    Поля покупателя на уровне игры для товаров в корзине — спрашиваются один раз
    при оформлении. Возвращает [{game_id, game_name, fields:[...]}] только для игр,
    у которых есть input_fields.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from shared.models import CartItem, Product
    from shared.models.catalog import Category
    from api.services.order_service import resolve_field_sources

    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.category).selectinload(Category.game))
        .join(CartItem, CartItem.product_id == Product.id)
        .where(CartItem.cart_id == cart.id)
    )
    products = result.scalars().all()

    # Источник полей: категория со своими полями, иначе игра
    sources = resolve_field_sources(list(products))
    return [
        {"game_id": sid, "game_name": src["name"], "fields": src["fields"]}
        for sid, src in sources.items()
    ]


@router.post("/items", status_code=status.HTTP_200_OK)
@limiter.limit(f"{settings.RATE_LIMIT_CLIENT}/minute")
async def add_to_cart(request: Request, body: AddToCartRequest, db: DbSession, user: CurrentUser):
    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    try:
        item = await svc.add_item(
            cart, body.product_id, body.quantity, body.input_data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {
        "ok": True,
        "item_id": str(item.id),
        "item_quantity": item.quantity,
    }


@router.put("/items/{item_id}")
@limiter.limit(f"{settings.RATE_LIMIT_CLIENT}/minute")
async def update_cart_item(
    request: Request, item_id: str, body: UpdateCartItemRequest, db: DbSession, user: CurrentUser
):
    import uuid

    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    try:
        item = await svc.update_item(cart, uuid.UUID(item_id), body.quantity)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"ok": True, "deleted": item is None}


@router.delete("")
async def clear_cart(db: DbSession, user: CurrentUser):
    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    await svc.clear_cart(cart)
    return {"ok": True}


@router.post("/promo")
async def apply_promo(body: ApplyPromoRequest, db: DbSession, user: CurrentUser):
    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    result = await svc.apply_promo(cart, user, body.code)
    return result
