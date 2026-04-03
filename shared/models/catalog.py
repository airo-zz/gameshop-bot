"""
shared/models/catalog.py
─────────────────────────────────────────────────────────────────────────────
Модели каталога: игры → категории → товары → лоты → ключи.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin

import enum


class DeliveryType(str, enum.Enum):
    auto = "auto"  # Ключ/код из БД — мгновенно
    manual = "manual"  # Оператор выдаёт вручную
    mixed = "mixed"  # Зависит от конкретного лота


class Game(Base, UUIDMixin, TimestampMixin):
    """
    Игра — верхний уровень каталога.
    Пример: Brawl Stars, Fortnite, PUBG Mobile.
    """

    __tablename__ = "games"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    banner_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Неактивна при создании — активирует админ после проверки
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default={})
    # Расширяемые атрибуты (платформа, жанр и т.д.)

    # Relationships
    categories: Mapped[list["Category"]] = relationship(
        "Category", back_populates="game", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Game {self.name}>"


class Category(Base, UUIDMixin, TimestampMixin):
    """
    Категория товаров внутри игры.
    Поддерживает вложенность (parent_id → дерево категорий).
    Пример: Brawl Stars → Гемы / Скины / Батл-пасс.
    """

    __tablename__ = "categories"
    __table_args__ = (
        Index("ix_categories_game_id", "game_id"),
        Index("ix_categories_parent_id", "parent_id"),
    )

    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    game: Mapped[Game] = relationship("Game", back_populates="categories")
    parent: Mapped["Category | None"] = relationship(
        "Category", remote_side="Category.id", foreign_keys=[parent_id]
    )
    children: Mapped[list["Category"]] = relationship(
        "Category",
        foreign_keys=[parent_id],
        back_populates="parent",
        overlaps="parent",
    )
    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="category"
    )

    def __repr__(self) -> str:
        return f"<Category {self.name}>"


class Product(Base, UUIDMixin, TimestampMixin):
    """
    Товар — основная единица продажи.
    Содержит базовую информацию, поля для ввода от клиента,
    и ссылки на лоты (пакеты/количества).

    input_fields — JSON-схема полей:
    [
      {"key": "game_id", "label": "ID игрока", "type": "text",
       "placeholder": "123456789", "required": true},
      {"key": "server", "label": "Сервер", "type": "select",
       "options": ["EU", "RU", "Asia"], "required": true}
    ]
    """

    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_category_id", "category_id"),
        Index("ix_products_is_active", "is_active"),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(512), nullable=True)

    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RUB")

    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # NULL = безлимитный запас; используется для услуг и ручной выдачи

    delivery_type: Mapped[DeliveryType] = mapped_column(
        Enum(DeliveryType, name="delivery_type_enum"),
        nullable=False,
        default=DeliveryType.manual,
    )

    # JSON-схема полей ввода от клиента (логин, сервер, ID и т.д.)
    input_fields: Mapped[list] = mapped_column(JSONB, nullable=False, default=[])

    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Текст инструкции, который отправляется клиенту после выполнения заказа

    images: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default={})

    # Relationships
    category: Mapped[Category] = relationship("Category", back_populates="products")
    lots: Mapped[list["ProductLot"]] = relationship(
        "ProductLot",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductLot.sort_order",
    )
    keys: Mapped[list["ProductKey"]] = relationship(
        "ProductKey", back_populates="product"
    )
    reviews: Mapped[list["Review"]] = relationship("Review", back_populates="product")
    favorites: Mapped[list["UserFavorite"]] = relationship(
        "UserFavorite", back_populates="product"
    )

    @property
    def available_keys_count(self) -> int:
        """Кол-во неиспользованных ключей (для auto-выдачи)."""
        return sum(1 for k in self.keys if not k.is_used)

    def __repr__(self) -> str:
        return f"<Product {self.name} {self.price}>"


class ProductLot(Base, UUIDMixin):
    """
    Лот (пакет) товара — конкретное количество по конкретной цене.
    Пример для "Гемы Brawl Stars":
      - 80 гемов   → 99 ₽
      - 170 гемов  → 199 ₽  [ХИТ]
      - 360 гемов  → 399 ₽  [ВЫГОДНО]
    """

    __tablename__ = "product_lots"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    original_price: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    # original_price → перечёркнутая цена в UI (показывает экономию)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    badge: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Примеры: "ХИТ", "ВЫГОДНО", "🔥 -30%", "NEW"
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    product: Mapped[Product] = relationship("Product", back_populates="lots")
    keys: Mapped[list["ProductKey"]] = relationship("ProductKey", back_populates="lot")

    def __repr__(self) -> str:
        return f"<Lot {self.name} {self.price}>"


class ProductKey(Base, UUIDMixin):
    """
    Ключ/код для автоматической выдачи товара.
    Хранится в зашифрованном виде (AES-256 через Fernet).
    """

    __tablename__ = "product_keys"
    __table_args__ = (Index("ix_product_keys_available", "product_id", "is_used"),)

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_lots.id", ondelete="SET NULL"),
        nullable=True,
    )
    key_value: Mapped[str] = mapped_column(Text, nullable=False)
    # Хранится в зашифрованном виде! Расшифровывается только при выдаче.
    is_used: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    order_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        # ForeignKey добавим после определения OrderItem
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )

    # Relationships
    product: Mapped[Product] = relationship("Product", back_populates="keys")
    lot: Mapped[ProductLot | None] = relationship("ProductLot", back_populates="keys")


class UserFavorite(Base):
    """Избранные товары пользователя."""

    __tablename__ = "user_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_user_favorites"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="favorites")
    product: Mapped[Product] = relationship("Product", back_populates="favorites")


class UserViewedProduct(Base):
    """История просмотров товаров (последние 20 на пользователя)."""

    __tablename__ = "user_viewed_products"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_user_viewed"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="viewed_products")
    product: Mapped[Product] = relationship("Product")


class Review(Base, UUIDMixin):
    """Отзыв на товар после выполненного заказа."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_one_review_per_product"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–5
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User")
    product: Mapped[Product] = relationship("Product", back_populates="reviews")
