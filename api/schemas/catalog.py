"""
api/schemas/catalog.py
─────────────────────────────────────────────────────────────────────────────
Pydantic схемы для каталога — игры, категории, товары, лоты.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class GameOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    image_url: str | None
    banner_url: str | None
    description: str | None
    is_featured: bool
    sort_order: int
    tags: list[str]
    type: str


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    image_url: str | None
    description: str | None
    sort_order: int
    parent_id: uuid.UUID | None
    children: list["CategoryOut"] = []


class LotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    price: Decimal
    original_price: Decimal | None
    quantity: int
    badge: str | None
    sort_order: int


class ProductListOut(BaseModel):
    """Краткая карточка для списка товаров."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    short_description: str | None
    price: Decimal
    currency: str
    images: list[str]
    is_featured: bool
    delivery_type: str
    stock: int | None
    lots: list[LotOut] = []
    game_name: str | None = None
    game_slug: str | None = None


class InputFieldSchema(BaseModel):
    """Схема поля ввода от клиента."""
    key: str
    label: str
    type: str = "text"           # text | select | number
    placeholder: str = ""
    required: bool = False
    options: list[str] = []      # для type=select


class ProductDetailOut(BaseModel):
    """Полная карточка товара."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    short_description: str | None
    price: Decimal
    currency: str
    images: list[str]
    delivery_type: str
    stock: int | None
    input_fields: list[dict]
    instruction: str | None
    lots: list[LotOut]
    tags: list[str]
    is_featured: bool
    game_name: str | None = None
    # Агрегаты (вычисляются в сервисе)
    avg_rating: float | None = None
    reviews_count: int = 0


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rating: int
    text: str | None
    created_at: str

    class UserSnap(BaseModel):
        first_name: str
        username: str | None

    user: UserSnap


class CatalogSearchParams(BaseModel):
    """Параметры поиска по каталогу."""
    q: str = Field("", min_length=0, max_length=100)
    game_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    delivery_type: str | None = None
    page: int = Field(0, ge=0)
    page_size: int = Field(20, ge=1, le=100)
