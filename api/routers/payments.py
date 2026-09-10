"""api/routers/payments.py"""

import time
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from api.deps import CurrentUser, DbSession, get_or_create_user
from api.rate_limit import limiter
from api.schemas.cart import PaymentInitResponse, TokenResponse, RefreshTokenRequest
from api.services.payment_service import PaymentService
from api.deps import create_access_token, create_refresh_token, decode_token
from api.utils.telegram_login import verify_login_widget
from shared.config import settings
from shared.models import Order, OrderStatus, User

router = APIRouter()


@router.post("/auth/telegram", response_model=TokenResponse)
@limiter.limit("5/minute")
async def auth_telegram(
    request: Request,
    db: DbSession,
    user: CurrentUser,
):
    """Обменивает Telegram initData на JWT токены. Auth через CurrentUser dependency."""
    access = create_access_token(user.telegram_id)
    refresh = create_refresh_token(user.telegram_id)
    return TokenResponse(access_token=access, refresh_token=refresh)


class TelegramWidgetAuthIn(BaseModel):
    """Данные Telegram Login Widget (вход на сайте через браузер)."""

    id: int
    first_name: str = ""
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


@router.post("/auth/telegram-widget", response_model=TokenResponse)
@limiter.limit("5/minute")
async def auth_telegram_widget(
    request: Request,
    body: TelegramWidgetAuthIn,
    db: DbSession,
):
    """
    Авторизация обычного пользователя на сайте через Telegram Login Widget.
    Проверяет подпись, находит/создаёт пользователя, выдаёт те же JWT, что и Mini App.
    """
    # 1. Собираем поля для проверки подписи (только присутствующие)
    fields: dict[str, str] = {
        "id": str(body.id),
        "first_name": body.first_name,
        "auth_date": str(body.auth_date),
    }
    if body.last_name:
        fields["last_name"] = body.last_name
    if body.username:
        fields["username"] = body.username
    if body.photo_url:
        fields["photo_url"] = body.photo_url

    if not verify_login_widget(fields, body.hash, settings.BOT_TOKEN):
        raise HTTPException(status_code=401, detail="Невалидная подпись")

    # 2. Свежесть (не старше 24 часов)
    if time.time() - body.auth_date > 86400:
        raise HTTPException(status_code=401, detail="Данные авторизации устарели")

    # 3. Находим/создаём пользователя (та же логика, что и в Mini App)
    user = await get_or_create_user(
        {
            "id": body.id,
            "first_name": body.first_name,
            "last_name": body.last_name,
            "username": body.username,
        },
        db,
    )
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    return TokenResponse(
        access_token=create_access_token(user.telegram_id),
        refresh_token=create_refresh_token(user.telegram_id),
    )


@router.post("/auth/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(request: Request, body: RefreshTokenRequest, db: DbSession):
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
@limiter.limit("10/minute")
async def initiate_payment(request: Request, order_id: UUID, db: DbSession, user: CurrentUser):
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

    if order.payment_method is None:
        raise HTTPException(400, "У заказа не указан метод оплаты")

    svc = PaymentService(db)

    if order.payment_method.value == "balance":
        try:
            data = await svc.pay_balance(order, user)
        except ValueError as e:
            raise HTTPException(400, str(e))
        return PaymentInitResponse(
            method="balance", status="succeeded",
            success=data.get("success", True),
            payment_id=data.get("payment_id"),
        )

    elif order.payment_method.value == "card_yukassa":
        data = await svc.pay_yukassa(order, user)
        return PaymentInitResponse(method="card_yukassa", status="pending", **data)

    elif order.payment_method.value in ("crypto", "usdt", "ton"):
        # Определяем валюту: из meta (новый flow) или из legacy method name
        currency = (order.meta or {}).get("crypto_currency")
        if not currency:
            currency = "USDT" if order.payment_method.value == "usdt" else "TON"
        data = await svc.pay_crypto(order, user, currency)
        return PaymentInitResponse(method="crypto", status="pending", **data)

    raise HTTPException(400, "Неподдерживаемый метод оплаты")


class BalanceTopupRequest(BaseModel):
    amount: Decimal = Field(..., ge=10, le=100000, description="Сумма в рублях")
    method: str = Field(..., pattern="^(card_yukassa|crypto)$")
    currency: str = Field("USDT", description="Криптовалюта (для метода crypto)")


@router.post("/balance/topup")
@limiter.limit("10/minute")
async def topup_balance(request: Request, body: BalanceTopupRequest, db: DbSession, user: CurrentUser):
    svc = PaymentService(db)
    try:
        if body.method == "card_yukassa":
            data = await svc.topup_yukassa(user, body.amount)
        else:
            data = await svc.topup_crypto(user, body.amount, body.currency)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return data
