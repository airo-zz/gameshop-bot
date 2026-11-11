"""
api/schemas/catalog.py
─────────────────────────────────────────────────────────────────────────────
Pydantic схемы для каталога — игры, категории, товары.
─────────────────────────────────────────────────────────────────────────────
"""

import re
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field


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
    input_fields: list[dict] = []
    custom_order_enabled: bool = False
    # цена «от» — только в списке игр (GET /catalog/games)
    min_price: Decimal | None = None
    # есть товары с автовыдачей — тоже только в списке игр
    has_auto: bool = False
    # пополнение по ID игрока (без входа в аккаунт) — тоже только в списке игр
    id_topup: bool = False
    # корневые разделы игры {id, slug, name} — тоже только в списке игр: поиск на сайте
    # находит игру по названию раздела («звёзды» → Telegram, раздел «Telegram Звезды»)
    sections: list[dict] = []
    # служебные данные игры — наружу не отдаём, только признаки ниже
    meta: dict = Field(default_factory=dict, exclude=True)
    seo_aliases: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def search_names(self) -> list[str]:
        """Другие названия игры из админки («стим», «Рейд») — для поиска на сайте."""
        parts = re.split(r"[\n,;]+", self.seo_aliases or "")
        return list(dict.fromkeys(a.strip() for a in parts if a.strip()))

    @computed_field
    @property
    def decor_catalog(self) -> bool:
        """Игра «Украшения Discord» — фронт открывает страницу-каталог вместо вкладок."""
        return bool((self.meta or {}).get("decor_catalog"))

    @computed_field
    @property
    def sold_count(self) -> int:
        """«Продано»: GGSEL + выполненные заказы сайта (api/services/sold_counter.py)."""
        return int((self.meta or {}).get("sold_count") or 0)


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
    # Движок автовыдачи (T20): telegram_stars | telegram_premium | None.
    auto_engine: str | None = None
    # Поля покупателя категории (для авто-движка собираются на экране подраздела).
    input_fields: list[dict] | None = None


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
    # Нужно карточке: поле type=quantity (T19) даёт ввод количества с минимумом.
    input_fields: list[dict] = []




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
    # Для «Популярного» на главной: обложка раздела, цена «от» и есть ли автовыдача
    image_url: str | None = None
    min_price: Decimal | None = None
    has_auto: bool = False



