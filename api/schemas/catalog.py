"""
api/schemas/catalog.py
─────────────────────────────────────────────────────────────────────────────
Pydantic схемы для каталога — игры, категории, товары.
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
    delivery_type: str | None = None  # 'auto' | 'manual' | 'mixed' | None


class ProductListOut(BaseModel):
    """Краткая карточка для списка товаров."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    short_description: str | None
    price: Decimal
    original_price: Decimal | None = None
    currency: str
    quantity: int
    badge: str | None = None
    images: list[str]
    is_featured: bool
    is_out_of_stock: bool
    delivery_type: str
    stock: int | None
    game_name: str | None = None
    game_slug: str | None = None
    category_id: uuid.UUID | None = None


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
    original_price: Decimal | None = None
    currency: str
    quantity: int
    badge: str | None = None
    images: list[str]
    delivery_type: str
    stock: int | None
    is_out_of_stock: bool
    input_fields: list[dict]
    instruction: str | None
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


class TrendingCategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    game_name: str
    game_slug: str
    game_image_url: str | None = None


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
