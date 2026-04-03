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
    lot_id: uuid.UUID | None = None
    quantity: int = Field(1, ge=1, le=99)
    input_data: dict = Field(default_factory=dict)
    # {"game_id": "123", "server": "EU"}


class UpdateCartItemRequest(BaseModel):
    quantity: int = Field(..., ge=0, le=99)
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
    lot_id: uuid.UUID | None
    quantity: int
    price_snapshot: Decimal
    subtotal: Decimal
    input_data: dict

    # Вложенные данные о товаре (join в сервисе)
    product_name: str = ""
    product_image: str | None = None
    lot_name: str | None = None


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
    payment_method: str = Field(..., pattern="^(balance|card_yukassa|usdt|ton|manual)$")
    promo_code: str | None = None


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    lot_name: str | None
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    input_data: dict
    delivery_data: dict
    delivered_at: datetime | None


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
    # Для карты — URL страницы оплаты
    redirect_url: str | None = None
    # Для крипты — адрес и сумма
    crypto_address: str | None = None
    crypto_amount: str | None = None
    crypto_currency: str | None = None
    # Для баланса — сразу success
    success: bool = False


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ════════════════════════════════════════════════════════════════════════════
# PROFILE
# ════════════════════════════════════════════════════════════════════════════

class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    telegram_id: int
    username: str | None
    first_name: str
    photo_url: str | None = None
    balance: Decimal
    orders_count: int
    total_spent: Decimal
    referral_code: str
    referrals_count: int = 0
    loyalty_level_name: str = "Bronze"
    loyalty_level_emoji: str = "🥉"
    loyalty_discount_percent: Decimal = Decimal("0")
    loyalty_cashback_percent: Decimal = Decimal("0")


class TopUpBalanceRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, le=100000)
    payment_method: str = Field(..., pattern="^(card_yukassa|usdt|ton)$")
