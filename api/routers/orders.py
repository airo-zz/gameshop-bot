"""api/routers/orders.py"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import CurrentUser, DbSession
from api.schemas.cart import CreateOrderRequest, OrderOut, OrderListItem
from api.services.cart_service import CartService
from api.services.order_service import OrderService
from shared.models import Order

router = APIRouter()


@router.post("", response_model=OrderOut)
async def create_order(body: CreateOrderRequest, db: DbSession, user: CurrentUser):
    cart_svc = CartService(db)
    order_svc = OrderService(db)

    cart = await cart_svc.get_or_create_cart(user)
    if cart.is_empty:
        raise HTTPException(400, "Корзина пуста")

    order = await order_svc.create_from_cart(
        user, cart, body.payment_method, body.promo_code
    )
    # Сохраняем выбранную криптовалюту если метод crypto
    if body.payment_method == 'crypto' and body.crypto_currency:
        order.meta = {**(order.meta or {}), 'crypto_currency': body.crypto_currency}
    await db.flush()

    # Перезагружаем заказ с позициями, чтобы избежать lazy-load в async-контексте
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order.id)
    )
    order = result.scalar_one()
    return order


@router.get("", response_model=list[OrderListItem])
async def list_orders(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(0, ge=0),
):
    svc = OrderService(db)
    orders = await svc.get_user_orders(user.id, page=page)
    return orders


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: UUID, db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id, Order.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    return order
