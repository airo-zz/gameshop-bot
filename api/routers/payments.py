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
    # Токен гостевого чата сайта: переписка гостя переходит в аккаунт
    guest_token: str | None = None
    # Галочки на странице входа сайта
    pd_consent: bool = False
    marketing_consent: bool = False


def verify_widget_body(body: TelegramWidgetAuthIn) -> None:
    """Проверяет подпись и свежесть данных Login Widget, иначе 401."""
    # Поля для проверки подписи (только присутствующие)
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

    # Свежесть (не старше 24 часов)
    if time.time() - body.auth_date > 86400:
        raise HTTPException(status_code=401, detail="Данные авторизации устарели")


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
    verify_widget_body(body)

    # Находим/создаём пользователя (та же логика, что и в Mini App)
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
    _apply_consents(user, body.pd_consent, body.marketing_consent)
    await _absorb_guest(db, user, body.guest_token)

    return TokenResponse(
        access_token=create_access_token(user.telegram_id),
        refresh_token=create_refresh_token(user.telegram_id),
    )


# ── Вход по почте (код из письма) ─────────────────────────────────────────────


class EmailCodeRequestIn(BaseModel):
    email: str = Field(..., max_length=254)


class EmailCodeVerifyIn(BaseModel):
    email: str = Field(..., max_length=254)
    code: str = Field(..., max_length=12)
    guest_token: str | None = None
    pd_consent: bool = False
    marketing_consent: bool = False


def _apply_consents(user: User, pd_consent: bool, marketing_consent: bool) -> None:
    from api.services.account_service import AccountError, apply_login_consents

    try:
        apply_login_consents(user, pd_consent, marketing_consent)
    except AccountError as e:
        raise HTTPException(e.status, e.message)


async def _absorb_guest(db, user: User, guest_token: str | None) -> None:
    """Переписка гостевого чата переходит в аккаунт; сбой не мешает входу."""
    from api.deps import guest_telegram_id
    from api.services.account_service import absorb_guest

    gid = guest_telegram_id(guest_token)
    if gid is None:
        return
    try:
        async with db.begin_nested():
            await absorb_guest(db, user, gid)
    except Exception as exc:  # переписка гостя не критична для входа
        import logging
        logging.getLogger(__name__).warning("absorb_guest failed user=%s: %s", user.id, exc)


@router.get("/auth/methods")
async def auth_methods():
    """Доступные способы входа на сайте (почта — только когда подключён Unisender Go)."""
    return {"telegram": True, "email": bool(settings.UNISENDER_GO_API_KEY)}


@router.post("/auth/email/request", status_code=204)
@limiter.limit("5/minute")
async def auth_email_request(request: Request, body: EmailCodeRequestIn):
    """Отправляет код входа на почту. Новый адрес — будущая регистрация."""
    from api.services import email_auth_service as eas

    try:
        await eas.send_code(eas.normalize_email(body.email), "login")
    except eas.EmailAuthError as e:
        raise HTTPException(e.status, e.message)


@router.post("/auth/email/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
async def auth_email_verify(request: Request, body: EmailCodeVerifyIn, db: DbSession):
    """Проверяет код; находит или создаёт пользователя по почте и выдаёт JWT."""
    from api.services import email_auth_service as eas

    try:
        email = eas.normalize_email(body.email)
        await eas.check_code(email, body.code, "login")
    except eas.EmailAuthError as e:
        raise HTTPException(e.status, e.message)

    user, is_new = await eas.get_or_create_email_user(db, email)
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    _apply_consents(user, body.pd_consent, body.marketing_consent)
    await _absorb_guest(db, user, body.guest_token)
    return TokenResponse(
        access_token=create_access_token(user.telegram_id),
        refresh_token=create_refresh_token(user.telegram_id),
        is_new=is_new,
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
            data = await svc.pay_balance(order, user)
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
