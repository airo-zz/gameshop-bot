"""
shared/models/user.py
─────────────────────────────────────────────────────────────────────────────
Модели пользователей и системы лояльности.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKey, Integer,
    Numeric, String, Text, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin


class LoyaltyLevel(Base, UUIDMixin):
    """
    Уровни программы лояльности.
    Настраиваются через admin-панель без изменения кода.

    Пример конфигурации по умолчанию:
      Bronze  → от 0 ₽         → 0% скидка, 0% кэшбек
      Silver  → от 3 000 ₽     → 3% скидка, 1% кэшбек
      Gold    → от 10 000 ₽    → 7% скидка, 2% кэшбек
      VIP     → от 30 000 ₽    → 12% скидка, 3% кэшбек
    """
    __tablename__ = "loyalty_levels"

    name: Mapped[str] = mapped_column(String(32), nullable=False)
    min_spent: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    min_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    cashback_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color_hex: Mapped[str] = mapped_column(String(7), nullable=False, default="#CD7F32")
    icon_emoji: Mapped[str] = mapped_column(String(8), nullable=False, default="🥉")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="loyalty_level")

    def __repr__(self) -> str:
        return f"<LoyaltyLevel {self.name} min={self.min_spent}>"


class User(Base, UUIDMixin, TimestampMixin):
    """
    Основная таблица пользователей.
    Создаётся при первом /start.
    """
    __tablename__ = "users"

    # Telegram данные
    telegram_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False, index=True
    )
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language_code: Mapped[str] = mapped_column(String(8), nullable=False, default="ru")
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Финансы
    balance: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )

    # Реферальная программа
    referral_code: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False,
        server_default=text("substr(md5(random()::text), 1, 8)"),
    )
    referred_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Лояльность
    loyalty_level_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("loyalty_levels.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Денормализованные счётчики (обновляются при каждом заказе — быстрее агрегатов)
    total_spent: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    orders_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Статус
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    blocked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    last_active_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    loyalty_level: Mapped[LoyaltyLevel | None] = relationship(
        "LoyaltyLevel", back_populates="users"
    )
    referred_by: Mapped["User | None"] = relationship(
        "User", remote_side="User.id", foreign_keys=[referred_by_id]
    )
    referrals: Mapped[list["User"]] = relationship(
        "User", foreign_keys=[referred_by_id], back_populates="referred_by",
        overlaps="referred_by",
    )
    cart: Mapped["Cart | None"] = relationship("Cart", back_populates="user", uselist=False)
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="user")
    favorites: Mapped[list["UserFavorite"]] = relationship("UserFavorite", back_populates="user")
    viewed_products: Mapped[list["UserViewedProduct"]] = relationship(
        "UserViewedProduct", back_populates="user"
    )
    support_tickets: Mapped[list["SupportTicket"]] = relationship(
        "SupportTicket", back_populates="user"
    )
    balance_transactions: Mapped[list["BalanceTransaction"]] = relationship(
        "BalanceTransaction", back_populates="user"
    )

    @property
    def display_name(self) -> str:
        if self.username:
            return f"@{self.username}"
        return self.first_name or f"user_{self.telegram_id}"

    def __repr__(self) -> str:
        return f"<User tg={self.telegram_id} {self.display_name}>"


class BalanceTransaction(Base, UUIDMixin):
    """Лог всех операций с внутренним балансом."""
    __tablename__ = "balance_transactions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Положительное = пополнение, отрицательное = списание
    balance_before: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    type: Mapped[str] = mapped_column(
        String(32), nullable=False
    )
    # Типы: top_up, order_payment, order_refund, cashback, manual_credit, manual_debit, referral_bonus
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Ссылка на заказ или платёж (polymorphic)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship("User", back_populates="balance_transactions")


class ShopSettings(Base):
    """
    Хранилище настроек магазина в формате ключ-значение.
    Используется для конфигурируемых параметров вроде суммы реферального бонуса.

    Ключи (примеры):
      referral_bonus_amount — сумма бонуса в ₽ за первую оплату реферала
    """
    __tablename__ = "shop_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<ShopSettings {self.key}={self.value!r}>"


class ReferralReward(Base, UUIDMixin):
    """Начисления за реферальную программу."""
    __tablename__ = "referral_rewards"

    referrer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    referred_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reward_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
