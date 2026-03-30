"""
shared/models/cart.py
─────────────────────────────────────────────────────────────────────────────
Корзина покупателя.

Особенности:
  • Один пользователь — одна активная корзина (UNIQUE на user_id)
  • price_snapshot — цена фиксируется при добавлении (резервирование на 24ч)
  • input_data — данные введённые клиентом (логин, сервер, ID игрока)
  • Брошенная корзина фиксируется в abandoned_carts для Celery-напоминаний
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer,
    Numeric, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, UUIDMixin


class Cart(Base, UUIDMixin):
    """Корзина пользователя — всегда одна активная."""
    __tablename__ = "carts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,    # Один пользователь = одна корзина
        index=True,
    )
    promo_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("promo_codes.id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # expires_at — TTL резервирования цены (обычно +24ч от последнего изменения)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="cart")
    items: Mapped[list["CartItem"]] = relationship(
        "CartItem", back_populates="cart", cascade="all, delete-orphan"
    )
    promo_code: Mapped["PromoCode | None"] = relationship("PromoCode")

    @property
    def total(self) -> Decimal:
        return sum(item.subtotal for item in self.items)

    @property
    def items_count(self) -> int:
        return sum(item.quantity for item in self.items)

    @property
    def is_empty(self) -> bool:
        return len(self.items) == 0

    def __repr__(self) -> str:
        return f"<Cart user={self.user_id} items={self.items_count}>"


class CartItem(Base, UUIDMixin):
    """Позиция в корзине."""
    __tablename__ = "cart_items"

    cart_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_lots.id", ondelete="SET NULL"),
        nullable=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    price_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Цена зафиксирована на момент добавления — защита от изменений цены

    input_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default={})
    # Введённые данные: {"game_id": "123456", "server": "EU"}

    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    cart: Mapped[Cart] = relationship("Cart", back_populates="items")
    product: Mapped["Product"] = relationship("Product")
    lot: Mapped["ProductLot | None"] = relationship("ProductLot")

    @property
    def subtotal(self) -> Decimal:
        return self.price_snapshot * self.quantity

    def __repr__(self) -> str:
        return f"<CartItem product={self.product_id} qty={self.quantity}>"


class AbandonedCart(Base, UUIDMixin):
    """
    Снимок брошенной корзины для Celery-задачи напоминаний.
    Создаётся когда пользователь добавил товар, но не купил за N часов.
    """
    __tablename__ = "abandoned_carts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    cart_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Сериализованное содержимое корзины на момент обнаружения

    reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    second_reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recovered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # True = пользователь вернулся и купил после напоминания

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User")
