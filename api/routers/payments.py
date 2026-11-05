"""
api/routers/payments.py
─────────────────────────────────────────────────────────────────────────────
Оплата заказа (POST /payments/orders/{id}/pay) и пополнение баланса
(POST /payments/balance/topup). Логика — в api/services/payment_service.py,
подробности — docs/ORDERS_AND_PAYMENTS.md. Вход (/payments/auth/*) — в auth.py.
─────────────────────────────────────────────────────────────────────────────
"""

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.rate_limit import limiter
from api.schemas.cart import PaymentInitResponse
from api.services.payment_service import PaymentService
from shared.models import Order, OrderStatus

router = APIRouter()


class PayOrderIn(BaseModel):
    # Необязательные — для оплаты заранее созданного заказа (напр. индивидуальный
    # лот), когда покупатель выбирает способ оплаты в момент оплаты.
    payment_method: str | None = Field(None, pattern="^(balance|sbp|card|crypto)$")
    # Откуда платят — определяет URL возврата после оплаты (сайт vs Mini App).
    source: str = Field("miniapp", pattern="^(web|miniapp)$")
    # Доплата: списать доступный баланс, остаток оплатить через шлюз.
    use_balance: bool = False


@router.post("/orders/{order_id}/pay", response_model=PaymentInitResponse)
@limiter.limit("10/minute")
async def initiate_payment(
    request: Request, order_id: UUID, db: DbSession, user: CurrentUser,
    body: PayOrderIn | None = None,
):
    from shared.models import PaymentMethod
    from api.services.order_service import OrderService

    # Блокируем заказ FOR UPDATE чтобы предотвратить параллельную оплату
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user.id)
        .with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    # Допускаем оплату только нового или ожидающего заказа
    if order.status not in (OrderStatus.new, OrderStatus.pending_payment):
        raise HTTPException(400, "Заказ уже обрабатывается или оплачен")

    # Способ оплаты можно задать прямо при оплате (заранее созданный заказ / спец-лот)
    if body and body.payment_method:
        try:
            order.payment_method = PaymentMethod(body.payment_method)
        except ValueError:
            raise HTTPException(400, "Неподдерживаемый метод оплаты")
        await OrderService(db).apply_payment_method(order, body.payment_method)
        await db.flush()

    if order.payment_method is None:
        raise HTTPException(400, "У заказа не указан метод оплаты")

    svc = PaymentService(db)
    method = order.payment_method.value

    async def _clear_cart_if_from_cart() -> None:
        # Корзину чистим только ПОСЛЕ успешной инициации оплаты и только для
        # заказов из корзины (спец-лоты не трогают корзину).
        if (order.meta or {}).get("from_cart"):
            from api.services.cart_service import CartService
            cart_svc = CartService(db)
            cart = await cart_svc.get_or_create_cart(user)
            await cart_svc.clear_cart(cart)

    if method == "balance":
        try:
            data = await svc.pay_balance(order, user, body.source if body else "miniapp")
        except ValueError as e:
            raise HTTPException(400, str(e))
        await _clear_cart_if_from_cart()
        return PaymentInitResponse(
            method="balance", status="succeeded",
            success=data.get("success", True),
            payment_id=data.get("payment_id"),
        )

    # Внешний шлюз Platega: СБП / карта / крипта.
    if method in ("sbp", "card", "crypto"):
        source = body.source if body else "miniapp"
        use_balance = bool(body and body.use_balance)
        try:
            data = await svc.pay_platega(order, user, method, source, use_balance)
        except ValueError as e:
            raise HTTPException(400, str(e))
        await _clear_cart_if_from_cart()
        return PaymentInitResponse(method=method, status="pending", **data)

    raise HTTPException(400, "Неподдерживаемый метод оплаты")


class BalanceTopupRequest(BaseModel):
    amount: Decimal = Field(..., ge=10, le=100000, description="Сумма в рублях")
    method: str = Field(..., pattern="^(sbp|card|crypto)$")
    source: str = Field("miniapp", pattern="^(web|miniapp)$")


@router.post("/balance/topup")
@limiter.limit("10/minute")
async def topup_balance(request: Request, body: BalanceTopupRequest, db: DbSession, user: CurrentUser):
    svc = PaymentService(db)
    try:
        data = await svc.topup_platega(user, body.amount, body.method, body.source)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return data
