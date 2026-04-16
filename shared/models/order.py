"""
shared/models/order.py
─────────────────────────────────────────────────────────────────────────────
Модели заказов и платежей.

Статусы заказа (конечный автомат):
  new → pending_payment → paid → processing → completed
                       ↘ cancelled
                                          ↘ clarification → processing
                                          ↘ dispute
─────────────────────────────────────────────────────────────────────────────
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime, Enum, ForeignKey, Integer,
    Numeric, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin


class OrderStatus(str, enum.Enum):
    new = "new"
    pending_payment = "pending_payment"
    paid = "paid"
    processing = "processing"
    clarification = "clarification"   # Требуется уточнение данных
    completed = "completed"
    cancelled = "cancelled"
    dispute = "dispute"


class PaymentMethod(str, enum.Enum):
    balance = "balance"
    card_yukassa = "card_yukassa"
    crypto = "crypto"
    usdt = "usdt"       # legacy, kept for existing orders
    ton = "ton"         # legacy, kept for existing orders
    manual = "manual"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"
    cancelled = "cancelled"


# Переходы между статусами (для валидации в OrderService)
ALLOWED_STATUS_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.new: {OrderStatus.pending_payment, OrderStatus.cancelled},
    OrderStatus.pending_payment: {OrderStatus.paid, OrderStatus.cancelled},
    OrderStatus.paid: {OrderStatus.processing, OrderStatus.cancelled},
    OrderStatus.processing: {
        OrderStatus.completed, OrderStatus.clarification, OrderStatus.dispute
    },
    OrderStatus.clarification: {OrderStatus.processing, OrderStatus.cancelled},
    OrderStatus.completed: {OrderStatus.dispute},
    OrderStatus.cancelled: set(),   # Терминальный статус
    OrderStatus.dispute: {OrderStatus.completed, OrderStatus.cancelled},
}


class Order(Base, UUIDMixin, TimestampMixin):
    """Заказ пользователя."""
    __tablename__ = "orders"

    # Читаемый номер заказа (генерируется триггером в БД или сервисом)
    order_number: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False, index=True
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status_enum"),
        nullable=False,
        default=OrderStatus.new,
        index=True,
    )

    # Финансы
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # total_amount = subtotal - discount_amount

    # Оплата
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="payment_method_enum"), nullable=True
    )
    promo_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("promo_codes.id", ondelete="SET NULL"), nullable=True
    )

    # Временны́е метки ключевых событий
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Заметки оператора (внутренние, клиент не видит)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # idempotency_key, внешние ID и т.д.

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="order")
    discount_log: Mapped[list["OrderDiscountLog"]] = relationship(
        "OrderDiscountLog", back_populates="order"
    )
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        "OrderStatusHistory", back_populates="order", order_by="OrderStatusHistory.created_at"
    )
    promo_code: Mapped["PromoCode | None"] = relationship("PromoCode")

    def can_transition_to(self, new_status: OrderStatus) -> bool:
        return new_status in ALLOWED_STATUS_TRANSITIONS.get(self.status, set())

    def __repr__(self) -> str:
        return f"<Order #{self.order_number} {self.status} {self.total_amount}>"


class OrderItem(Base, UUIDMixin):
    """Позиция заказа — снимок товара на момент покупки."""
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
    )
    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_lots.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Снимки данных на момент покупки (не изменятся если товар будет переименован)
    product_name: Mapped[str] = mapped_column(String(256), nullable=False)
    lot_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Данные от клиента (логин, сервер, ID)
    input_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Данные выдачи (ключи, коды — зашифрованы)
    delivery_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    order: Mapped[Order] = relationship("Order", back_populates="items")
    product: Mapped["Product"] = relationship("Product")
    lot: Mapped["ProductLot | None"] = relationship("ProductLot")


class OrderStatusHistory(Base, UUIDMixin):
    """Полный лог смен статуса заказа."""
    __tablename__ = "order_status_history"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    from_status: Mapped[OrderStatus | None] = mapped_column(
        Enum(OrderStatus, name="order_status_enum"), nullable=True
    )
    to_status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status_enum"), nullable=False
    )
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # NULL = системное изменение (webhook, автоматика)
    changed_by_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="system"
    )
    # "system", "admin", "user"
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship("Order", back_populates="status_history")


class OrderDiscountLog(Base, UUIDMixin):
    """Лог применённых скидок к заказу."""
    __tablename__ = "order_discount_log"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    discount_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    applied_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship("Order", back_populates="discount_log")
    discount_rule: Mapped["DiscountRule | None"] = relationship("DiscountRule")


class Payment(Base, UUIDMixin):
    """
    Транзакция оплаты.
    Один заказ может иметь несколько платежей (попытки, частичные оплаты).
    """
    __tablename__ = "payments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method_enum"), nullable=False
    )
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status_enum"),
        nullable=False,
        default=PaymentStatus.pending,
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RUB")

    # Идентификаторы во внешних системах
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    # ID транзакции в ЮKassa, CryptoBot и т.д.

    idempotency_key: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )
    # Защита от двойного списания

    raw_response: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Сырой ответ от платёжной системы (для отладки и диспутов)

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship("Order", back_populates="payments")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Payment {self.method} {self.amount} {self.status}>"
