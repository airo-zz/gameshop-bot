"""
api/schemas/admin.py
─────────────────────────────────────────────────────────────────────────────
Pydantic схемы для администраторской части API.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from shared.models import AdminRole

T = TypeVar("T")


# ── Generic ───────────────────────────────────────────────────────────────────


class PaginatedResponse(BaseModel, Generic[T]):
    """Универсальная пагинация для списочных эндпоинтов."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


# ── Auth / Me ─────────────────────────────────────────────────────────────────


class AdminMeOut(BaseModel):
    """Ответ GET /admin/me."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_id: int
    username: str | None
    first_name: str
    role: AdminRole
    permissions: list[str]
    """Полный эффективный список прав: DEFAULT_PERMISSIONS[role] + кастомные."""


# ── Dashboard ─────────────────────────────────────────────────────────────────


class DashboardOut(BaseModel):
    """Ответ GET /admin/dashboard. Расширяется по мере добавления виджетов."""

    model_config = ConfigDict(from_attributes=True)

    orders_today: int = 0
    orders_pending: int = 0
    revenue_today: float = 0.0
    open_tickets: int = 0


# ── Orders ────────────────────────────────────────────────────────────────────


class AssignedAdminOut(BaseModel):
    """Назначенный администратор заказа."""

    id: uuid.UUID
    username: str | None = None
    first_name: str
    color_index: int
    """Индекс цвета из палитры ADMIN_COLORS (telegram_id % 8)."""


class OrderListItem(BaseModel):
    """Краткая карточка заказа для списка заказов в admin-панели."""

    id: uuid.UUID
    order_number: str
    status: str
    total_amount: float
    payment_method: str | None
    user_telegram_id: int
    user_first_name: str
    user_username: str | None = None
    created_at: datetime
    paid_at: datetime | None = None
    completed_at: datetime | None = None
    items_count: int
    deleted_at: datetime | None = None
    assigned_admin: AssignedAdminOut | None = None
    assigned_at: datetime | None = None


class OrderDetailOut(BaseModel):
    """Полные данные заказа для страницы деталей."""

    id: uuid.UUID
    order_number: str
    status: str
    subtotal: float
    discount_amount: float
    total_amount: float
    payment_method: str | None
    input_data: dict[str, Any] = {}
    notes: str | None
    cancel_reason: str | None
    created_at: datetime
    paid_at: datetime | None
    processing_started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    assigned_admin: AssignedAdminOut | None = None
    assigned_at: datetime | None = None
    user: dict[str, Any]
    """Поля: id, telegram_id, username, first_name, last_name, balance, orders_count, total_spent, is_blocked."""
    items: list[dict[str, Any]]
    """Поля: id, product_id, product_name, quantity, unit_price, total_price, input_data, delivery_data, delivered_at."""
    status_history: list[dict[str, Any]]
    """Поля: id, from_status, to_status, changed_by_type, reason, created_at."""
    payments: list[dict[str, Any]]
    """Поля: id, method, status, amount, currency, external_id, paid_at, created_at."""


class OrderStatusChangeRequest(BaseModel):
    """Тело запроса смены статуса заказа."""

    status: str = Field(..., description="Новый статус заказа")
    reason: str | None = Field(None, max_length=512, description="Причина смены статуса")


class OrderNotesRequest(BaseModel):
    """Тело запроса добавления заметки к заказу."""

    text: str = Field(..., min_length=1, max_length=2048)


# ── Catalog — Games ───────────────────────────────────────────────────────────


class GameCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    slug: str | None = Field(None, max_length=64)
    image_url: str | None = None
    description: str | None = None
    is_active: bool = True
    is_featured: bool = False
    sort_order: int = 0
    type: str = Field("game", pattern="^(game|service)$")
    input_fields: list[Any] = []


class GameUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    slug: str | None = Field(None, max_length=64)
    image_url: str | None = None
    description: str | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    sort_order: int | None = None
    type: str | None = Field(None, pattern="^(game|service)$")
    input_fields: list[Any] | None = None


class GameOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    image_url: str | None
    description: str | None
    is_active: bool
    is_featured: bool
    sort_order: int
    type: str
    input_fields: list[Any]
    created_at: datetime


# ── Catalog — Categories ──────────────────────────────────────────────────────


class CategoryCreateIn(BaseModel):
    game_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str = Field(..., min_length=1, max_length=128)
    slug: str | None = Field(None, max_length=64)
    description: str | None = None
    is_active: bool = True
    sort_order: int = 0


class CategoryUpdateIn(BaseModel):
    game_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    name: str | None = Field(None, min_length=1, max_length=128)
    slug: str | None = Field(None, max_length=64)
    description: str | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    sort_order: int | None = None
    # null/[] = наследовать поля игры; непустой список = свои поля категории
    input_fields: list[Any] | None = None
    # Движок автовыдачи (T20): "" / "none" = выключить, telegram_stars | telegram_premium.
    # Обрабатывается отдельно в update_category (exclude_none не даёт очистить через None).
    auto_engine: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    game_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    slug: str
    description: str | None = None
    is_active: bool
    is_featured: bool
    sort_order: int
    input_fields: list[Any] | None = None
    auto_engine: str | None = None


# ── Catalog — Products ────────────────────────────────────────────────────────


class ProductCreateIn(BaseModel):
    category_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = None
    short_description: str | None = Field(None, max_length=512)
    # Цена в USD (источник истины). Если задана — ₽-цена считается из неё.
    # price (₽) можно передать напрямую (legacy/ручной ввод), если price_usd не задан.
    price_usd: float | None = Field(None, ge=0)
    price: float | None = Field(None, ge=0)
    original_price: float | None = Field(None, ge=0)
    quantity: int = Field(1, ge=1)
    badge: str | None = Field(None, max_length=32)
    stock: int | None = None
    is_out_of_stock: bool = False
    delivery_type: str = "manual"
    input_fields: list[Any] = []
    instruction: str | None = None
    images: list[str] = []
    is_active: bool = True
    sort_order: int = 0


class ProductUpdateIn(BaseModel):
    category_id: uuid.UUID | None = None
    name: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = None
    short_description: str | None = Field(None, max_length=512)
    price_usd: float | None = Field(None, ge=0)
    price: float | None = Field(None, ge=0)
    original_price: float | None = Field(None, ge=0)
    quantity: int | None = Field(None, ge=1)
    badge: str | None = Field(None, max_length=32)
    stock: int | None = None
    is_out_of_stock: bool | None = None
    delivery_type: str | None = None
    input_fields: list[Any] | None = None
    instruction: str | None = None
    images: list[str] | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    description: str | None
    short_description: str | None
    price: float
    price_usd: float | None
    original_price: float | None
    quantity: int
    badge: str | None
    stock: int | None
    is_out_of_stock: bool
    delivery_type: str
    input_fields: list[Any]
    instruction: str | None
    images: list[str]
    is_active: bool
    sort_order: int
    created_at: datetime


class ProductListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    price: float
    original_price: float | None = None
    badge: str | None = None
    stock: int | None
    is_out_of_stock: bool = False
    delivery_type: str
    is_active: bool
    sort_order: int
    created_at: datetime


# ── Catalog — Reorder / BulkPrice ─────────────────────────────────────────────


class SortItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class ReorderIn(BaseModel):
    items: list[SortItem]


class BulkPriceUpdateIn(BaseModel):
    mode: str = Field(..., pattern="^(percent|fixed)$")
    # percent: может быть отрицательным (снижение, напр. -5); fixed: цена ≥ 0.
    # Диапазон проверяется в эндпоинте с учётом mode.
    value: float
    scope: str = Field(..., pattern="^(game|category|selected)$")
    game_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    product_ids: list[uuid.UUID] = []


# ── Catalog — CSV Import (ggsel) ──────────────────────────────────────────────


class ImportProductItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    # Модификатор к базовой цене оффера (может быть отрицательным).
    price_modifier: float = 0


class ImportCategoryItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    products: list[ImportProductItem]


class ImportInputField(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    type: str = Field("text", pattern="^(text|number|select)$")
    required: bool = False


class ImportPreviewOut(BaseModel):
    """Результат разбора CSV — план импорта для предпросмотра."""

    categories: list[ImportCategoryItem]
    input_fields: list[ImportInputField]
    warnings: list[str]
    stats: dict[str, int]


class ImportCommitIn(BaseModel):
    """Подтверждённый план импорта (после предпросмотра)."""

    game_id: uuid.UUID
    # Базовая цена оффера с ggsel; итоговая цена лота = base_price + price_modifier.
    base_price: float = Field(0, ge=0)
    categories: list[ImportCategoryItem]
    input_fields: list[ImportInputField] = []


class ImportCommitOut(BaseModel):
    categories_created: int
    products_created: int


# ── Users ─────────────────────────────────────────────────────────────────────


class UserUpdateIn(BaseModel):
    """Тело PATCH /admin/users/{user_id}."""

    is_blocked: bool | None = None
    blocked_reason: str | None = Field(None, max_length=512)
    loyalty_level_id: str | None = None
    total_spent: float | None = Field(None, ge=0)


class BalanceAdjustIn(BaseModel):
    """Тело POST /admin/users/{user_id}/balance."""

    amount: float = Field(..., gt=0, description="Абсолютное значение суммы (всегда > 0)")
    type: str = Field(
        ...,
        description="Тип операции: manual_credit или manual_debit",
    )
    description: str | None = Field(None, max_length=512)


# ── Discounts — DiscountRule ──────────────────────────────────────────────────


class DiscountRuleCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    type: str = Field(..., description="product | category | loyalty | promo | time_based | manual")
    target_id: str | None = None
    discount_value_type: str = Field(..., description="percent | fixed")
    discount_value: float = Field(..., ge=0)
    min_order_amount: float | None = Field(None, ge=0)
    max_discount_amount: float | None = Field(None, ge=0)
    stackable: bool = False
    priority: int = 0
    starts_at: str | None = None
    ends_at: str | None = None
    is_active: bool = True
    usage_limit: int | None = Field(None, ge=1)


class DiscountRuleUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    type: str | None = None
    target_id: str | None = None
    discount_value_type: str | None = None
    discount_value: float | None = Field(None, ge=0)
    min_order_amount: float | None = Field(None, ge=0)
    max_discount_amount: float | None = Field(None, ge=0)
    stackable: bool | None = None
    priority: int | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    is_active: bool | None = None
    usage_limit: int | None = Field(None, ge=1)


class DiscountRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    type: str
    target_id: uuid.UUID | None
    discount_value_type: str
    discount_value: float
    min_order_amount: float
    max_discount_amount: float | None
    stackable: bool
    priority: int
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool
    usage_limit: int | None
    usage_count: int
    created_at: datetime


# ── Discounts — PromoCode ─────────────────────────────────────────────────────


class PromoCreateIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    discount_rule_id: str
    max_uses: int | None = Field(None, ge=1)
    per_user_limit: int = Field(1, ge=1)
    is_active: bool = True
    expires_at: str | None = None


class PromoCreateDirectIn(BaseModel):
    """Создание промокода без предварительного создания DiscountRule.
    DiscountRule типа 'promo' создаётся автоматически под капотом."""

    code: str = Field(..., min_length=1, max_length=32)
    discount_value_type: str = Field(..., description="percent | fixed")
    discount_value: float = Field(..., ge=0)
    max_discount_amount: float | None = Field(None, ge=0, description="Макс. скидка (только для percent)")
    min_order_amount: float | None = Field(None, ge=0, description="Мин. сумма заказа")
    max_uses: int | None = Field(None, ge=1, description="None = без ограничений")
    per_user_limit: int = Field(1, ge=1)
    expires_at: str | None = Field(None, description="None = бессрочный")


class PromoUpdateIn(BaseModel):
    max_uses: int | None = Field(None, ge=1)
    per_user_limit: int | None = Field(None, ge=1)
    is_active: bool | None = None
    expires_at: str | None = None


class PromoCodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    discount_rule_id: uuid.UUID
    discount_rule_name: str
    max_uses: int | None
    used_count: int
    per_user_limit: int
    is_active: bool
    expires_at: datetime | None
    created_at: datetime
