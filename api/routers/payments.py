"""api/routers/payments.py"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import CurrentUser, DbSession
from api.schemas.cart import PaymentInitResponse, TokenResponse, RefreshTokenRequest
from api.services.payment_service import PaymentService
from api.deps import create_access_token, create_refresh_token, decode_token
from shared.models import Order, User

router = APIRouter()


@router.post("/auth/telegram", response_model=TokenResponse)
async def auth_telegram(
    db: DbSession,
    x_telegram_init_data: str,
    user: CurrentUser,  # Верифицируется через initData
):
    """Обменивает Telegram initData на JWT токены."""
    access = create_access_token(user.telegram_id)
    refresh = create_refresh_token(user.telegram_id)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshTokenRequest, db: DbSession):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Неверный тип токена")
    tg_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.telegram_id == tg_id))
    user = result.scalar_one_or_none()
    if not user or user.is_blocked:
        raise HTTPException(401, "Пользователь не найден или заблокирован")
    return TokenResponse(
        access_token=create_access_token(tg_id),
        refresh_token=create_refresh_token(tg_id),
    )


@router.post("/orders/{order_id}/pay", response_model=PaymentInitResponse)
async def initiate_payment(order_id: str, db: DbSession, user: CurrentUser):
    import uuid
    result = await db.execute(
        select(Order).where(Order.id == uuid.UUID(order_id), Order.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    svc = PaymentService(db)

    if order.payment_method.value == "balance":
        data = await svc.pay_balance(order, user)
        return PaymentInitResponse(method="balance", status="succeeded", success=True, **data)

    elif order.payment_method.value == "card_yukassa":
        data = await svc.pay_yukassa(order, user)
        return PaymentInitResponse(method="card_yukassa", status="pending", **data)

    elif order.payment_method.value == "usdt":
        data = await svc.pay_crypto(order, user, "USDT")
        return PaymentInitResponse(method="usdt", status="pending", **data)

    elif order.payment_method.value == "ton":
        data = await svc.pay_crypto(order, user, "TON")
        return PaymentInitResponse(method="ton", status="pending", **data)

    raise HTTPException(400, "Неподдерживаемый метод оплаты")
