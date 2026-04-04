"""api/routers/cart.py"""

from fastapi import APIRouter
from api.deps import CurrentUser, DbSession
from api.schemas.cart import (
    AddToCartRequest,
    CartItemOut,
    UpdateCartItemRequest,
    ApplyPromoRequest,
    CartOut,
)
from api.services.cart_service import CartService

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
        lot_name = None
        if item.lot_id and item.product:
            lot = next((l for l in item.product.lots if l.id == item.lot_id), None)
            lot_name = lot.name if lot else None

        items_out.append(
            CartItemOut(
                id=item.id,
                product_id=item.product_id,
                lot_id=item.lot_id,
                quantity=item.quantity,
                price_snapshot=item.price_snapshot,
                subtotal=item.subtotal,
                input_data=item.input_data,
                product_name=product_name,
                product_image=product_image,
                lot_name=lot_name,
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
        expires_at=cart.expires_at,
    )


@router.post("/items")
async def add_to_cart(body: AddToCartRequest, db: DbSession, user: CurrentUser):
    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    item = await svc.add_item(
        cart, body.product_id, body.lot_id, body.quantity, body.input_data
    )
    return {
        "ok": True,
        "item_id": str(item.id),
        "cart_items_count": cart.items_count + 1,
    }


@router.put("/items/{item_id}")
async def update_cart_item(
    item_id: str, body: UpdateCartItemRequest, db: DbSession, user: CurrentUser
):
    import uuid

    svc = CartService(db)
    cart = await svc.get_or_create_cart(user)
    item = await svc.update_item(cart, uuid.UUID(item_id), body.quantity)
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
