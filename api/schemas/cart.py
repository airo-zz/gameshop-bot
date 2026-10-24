"""
api/schemas/cart.py + order.py
─────────────────────────────────────────────────────────────────────────────
Схемы для корзины, заказов и платежей.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ════════════════════════════════════════════════════════════════════════════
# CART
# ════════════════════════════════════════════════════════════════════════════

class AddToCartRequest(BaseModel):
    product_id: uuid.UUID
    # Предел зависит от товара (штуки ≤ 99, «за единицу» — больше), проверяет CartService
    quantity: int = Field(1, ge=1, le=1_000_000)
    input_data: dict = Field(default_factory=dict)
    # {"game_id": "123", "server": "EU"} — все поля необязательны


class UpdateCartItemRequest(BaseModel):
    quantity: int = Field(..., ge=0, le=1_000_000)
    # 0 = удалить


class ApplyPromoRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, v: str) -> str:
        return v.strip().upper()


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    price_snapshot: Decimal
    subtotal: Decimal
    input_data: dict

    # Вложенные данные о товаре (join в сервисе)
    product_name: str = ""
    product_image: str | None = None


class CartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    items: list[CartItemOut]
    items_count: int
    subtotal: Decimal
    discount_amount: Decimal = Decimal("0")
    total: Decimal
    promo_code: str | None = None
    promo_discount: Decimal | None = None
    expires_at: datetime | None = None


# ════════════════════════════════════════════════════════════════════════════
# ORDERS
# ════════════════════════════════════════════════════════════════════════════

class CreateOrderRequest(BaseModel):
    payment_method: str = Field(..., pattern="^(balance|sbp|card|crypto|manual)$")
    promo_code: str | None = None
    # Данные покупателя на уровне игры: { game_id: { field_key: value } }
    input_data: dict[str, dict[str, str]] = Field(default_factory=dict)


# Покупателю — только то, что ему выдано: коды/ключи и сообщение. Служебные
# результаты движков (fragment/fazer: себестоимость, id заказов поставщика,
# технические детали) остаются только в админке.
PUBLIC_DELIVERY_KEYS = ("keys", "message")


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    game_name: str | None = None
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    input_data: dict
    delivery_data: dict
    delivered_at: datetime | None
    instruction: str | None = None

    @field_validator("delivery_data", mode="before")
    @classmethod
    def _public_delivery(cls, v):
        if not isinstance(v, dict):
            return {}
        return {k: v[k] for k in PUBLIC_DELIVERY_KEYS if v.get(k) not in (None, "", [])}


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    payment_method: str | None
    items: list[OrderItemOut]
    input_data: dict = Field(default_factory=dict)
    created_at: datetime
    paid_at: datetime | None
    completed_at: datetime | None


class OrderListItem(BaseModel):
    """Краткая карточка заказа для списка."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: str
    total_amount: Decimal
    items_count: int = 0
    created_at: datetime
    completed_at: datetime | None


# ════════════════════════════════════════════════════════════════════════════
# PAYMENTS
# ════════════════════════════════════════════════════════════════════════════

class PaymentInitResponse(BaseModel):
    """Ответ при инициализации оплаты."""
    payment_id: uuid.UUID
    method: str
    status: str
    # Для внешнего шлюза (Platega) — URL страницы оплаты
    redirect_url: str | None = None
    # Для баланса — сразу success
    success: bool = False


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    # Вход по почте: аккаунт создан только что (сайт предложит привязать Telegram)
    is_new: bool = False


# ════════════════════════════════════════════════════════════════════════════
# PROFILE
# ════════════════════════════════════════════════════════════════════════════

class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    telegram_id: int
    username: str | None
    first_name: str
    photo_url: str | None = None
    # Вход на сайте по почте: email (если привязан) и есть ли Telegram
    email: str | None = None
    has_telegram: bool = True
    marketing_consent: bool = False
    balance: Decimal
    orders_count: int
    total_spent: Decimal
    referral_code: str
    referrals_count: int = 0
    loyalty_level_name: str = "Bronze"
    loyalty_level_emoji: str = "🥉"
    loyalty_discount_percent: Decimal = Decimal("0")
    loyalty_cashback_percent: Decimal = Decimal("0")
    loyalty_color_hex: str = "#CD7F32"
    loyalty_levels: list[dict] = []
    # Модель Bybit: уровень по тратам за месяц (МСК)
    loyalty_level_index: int = 0
    loyalty_cashback_cap: Decimal | None = None      # потолок кэшбэка в месяц
    loyalty_month_cashback: Decimal = Decimal("0")   # уже начислено в этом месяце
    loyalty_month_spent: Decimal = Decimal("0")
    loyalty_prev_month_spent: Decimal = Decimal("0")
    loyalty_held_from_prev_month: bool = False
    loyalty_next_level_name: str | None = None
    loyalty_next_level_min_spent: Decimal | None = None
    loyalty_period_ends_at: str | None = None        # ISO, когда пересчитается уровень
    # Рефералка
    # Рефералка: % пригласившему с заказов друга, сколько месяцев (0 — бессрочно)
    referral_percent: Decimal = Decimal("0")
    referral_period_months: int = 0
    referral_new_user_discount_percent: Decimal = Decimal("0")
