"""
shared/models/discount.py
─────────────────────────────────────────────────────────────────────────────
Расширяемая система скидок на основе правил (discount_rules).

Типы скидок:
  product      → на конкретный товар
  category     → на категорию
  loyalty      → по уровню лояльности
  promo        → промокод
  time_based   → временная акция (чёрная пятница и т.д.)
  manual       → ручная скидка оператора на заказ

Логика применения (в OrderService):
  1. Собрать все активные правила, применимые к заказу
  2. Отсортировать по priority DESC
  3. Применить первое non-stackable правило
  4. Применить все stackable правила дополнительно
  5. Записать каждое в order_discount_log
─────────────────────────────────────────────────────────────────────────────
"""

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey,
    Integer, Numeric, String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin


class DiscountType(str, enum.Enum):
    product = "product"
    category = "category"
    loyalty = "loyalty"
    promo = "promo"
    time_based = "time_based"
    manual = "manual"


class DiscountValueType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"


class DiscountRule(Base, UUIDMixin, TimestampMixin):
    """
    Правило скидки — атомарная единица системы.

    Примеры:
      • Скидка 10% на все гемы Brawl Stars (type=category, target_id=<category_uuid>)
      • Скидка 50₽ на заказ от 500₽ (type=time_based, min_order_amount=500)
      • Скидка Gold-уровня 7% (type=loyalty, target_id=<loyalty_level_uuid>)
    """
    __tablename__ = "discount_rules"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, name="discount_type_enum"), nullable=False
    )
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    # target_id ссылается на products.id / categories.id / loyalty_levels.id
    # в зависимости от type (полиморфная ссылка, без FK для гибкости)

    discount_value_type: Mapped[DiscountValueType] = mapped_column(
        Enum(DiscountValueType, name="discount_value_type_enum"),
        nullable=False,
        default=DiscountValueType.percent,
    )
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Если percent → 10.00 = скидка 10%
    # Если fixed   → 50.00 = скидка 50₽

    min_order_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    max_discount_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    # Потолок скидки — например, макс. 500₽ даже если процент даёт больше

    stackable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # True = суммируется с другими скидками
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Чем выше — применяется первым при конфликте

    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    promo_code: Mapped["PromoCode | None"] = relationship(
        "PromoCode", back_populates="discount_rule", uselist=False
    )

    @property
    def is_expired(self) -> bool:
        now = datetime.now(timezone.utc)
        if self.starts_at and now < self.starts_at:
            return True
        if self.ends_at and now > self.ends_at:
            return True
        return False

    @property
    def is_limit_reached(self) -> bool:
        return self.usage_limit is not None and self.usage_count >= self.usage_limit

    def calculate_discount(self, amount: Decimal) -> Decimal:
        """Рассчитать сумму скидки для заданной суммы заказа."""
        if self.discount_value_type == DiscountValueType.percent:
            discount = amount * self.discount_value / 100
        else:
            discount = self.discount_value

        if self.max_discount_amount:
            discount = min(discount, self.max_discount_amount)

        return min(discount, amount)  # Скидка не может превышать сумму заказа

    def __repr__(self) -> str:
        return f"<DiscountRule {self.name} {self.discount_value}{self.discount_value_type}>"


class PromoCode(Base, UUIDMixin):
    """
    Промокод — публичный текстовый код привязанный к DiscountRule.
    Один промокод = одно правило скидки.
    """
    __tablename__ = "promo_codes"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    discount_rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("discount_rules.id", ondelete="CASCADE"),
        nullable=False,
    )

    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    per_user_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    discount_rule: Mapped[DiscountRule] = relationship(
        "DiscountRule", back_populates="promo_code"
    )
    usages: Mapped[list["PromoCodeUsage"]] = relationship(
        "PromoCodeUsage", back_populates="promo_code"
    )

    @property
    def is_available(self) -> bool:
        if not self.is_active:
            return False
        if self.expires_at and datetime.now(timezone.utc) > self.expires_at:
            return False
        if self.max_uses is not None and self.used_count >= self.max_uses:
            return False
        return True

    def __repr__(self) -> str:
        return f"<PromoCode {self.code}>"


class PromoCodeUsage(Base, UUIDMixin):
    """Лог использований промокода — для проверки per_user_limit."""
    __tablename__ = "promo_code_usages"

    promo_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("promo_codes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    promo_code: Mapped[PromoCode] = relationship("PromoCode", back_populates="usages")
