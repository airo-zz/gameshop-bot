"""
shared/models/support.py + admin.py
─────────────────────────────────────────────────────────────────────────────
Модели системы поддержки и администраторов.
─────────────────────────────────────────────────────────────────────────────
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin


# ─── SUPPORT ──────────────────────────────────────────────────────────────────


class TicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    waiting_user = "waiting_user"  # Ожидаем ответа клиента
    resolved = "resolved"
    closed = "closed"


class SupportTicket(Base, UUIDMixin, TimestampMixin):
    """Тикет поддержки."""

    __tablename__ = "support_tickets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticket_status_enum"),
        nullable=False,
        default=TicketStatus.open,
        index=True,
    )
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="support_tickets")
    messages: Mapped[list["TicketMessage"]] = relationship(
        "TicketMessage",
        back_populates="ticket",
        order_by="TicketMessage.created_at",
        cascade="all, delete-orphan",
    )
    assigned_to: Mapped["AdminUser | None"] = relationship("AdminUser")

    def __repr__(self) -> str:
        return f"<Ticket #{self.id} {self.status}>"


class TicketMessage(Base, UUIDMixin):
    """Сообщение в тикете (от клиента или от оператора)."""

    __tablename__ = "ticket_messages"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_type: Mapped[str] = mapped_column(
        String(8),
        nullable=False,  # "user" или "admin"
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=[]
    )
    is_template_response: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    ticket: Mapped[SupportTicket] = relationship(
        "SupportTicket", back_populates="messages"
    )


class SupportTemplate(Base, UUIDMixin):
    """Шаблоны быстрых ответов для операторов поддержки."""

    __tablename__ = "support_templates"

    title: Mapped[str] = mapped_column(String(128), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── ADMIN ────────────────────────────────────────────────────────────────────


class AdminRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    manager = "manager"
    operator = "operator"
    content = "content"


# Дефолтные права для каждой роли
DEFAULT_PERMISSIONS: dict[AdminRole, list[str]] = {
    AdminRole.owner: ["*"],  # Полный доступ
    AdminRole.admin: [
        "games.*",
        "categories.*",
        "products.*",
        "orders.*",
        "users.*",
        "discounts.*",
        "support.*",
        "analytics.view",
    ],
    AdminRole.manager: [
        "orders.*",
        "users.view",
        "users.edit",
        "discounts.*",
        "support.*",
        "analytics.view",
    ],
    AdminRole.operator: [
        "orders.view",
        "orders.update_status",
        "orders.add_notes",
        "support.*",
        "users.view",
    ],
    AdminRole.content: [
        "games.*",
        "categories.*",
        "products.*",
    ],
}


class AdminUser(Base, UUIDMixin, TimestampMixin):
    """Администратор системы."""

    __tablename__ = "admin_users"

    telegram_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False, index=True
    )
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    role: Mapped[AdminRole] = mapped_column(
        Enum(AdminRole, name="admin_role_enum"),
        nullable=False,
        default=AdminRole.operator,
    )
    permissions: Mapped[list] = mapped_column(JSONB, nullable=False, default=[])
    # Дополнительные/переопределённые права поверх роли

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    added_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    action_logs: Mapped[list["AdminActionLog"]] = relationship(
        "AdminActionLog",
        back_populates="admin",
        foreign_keys="AdminActionLog.admin_id",
    )

    def has_permission(self, permission: str) -> bool:
        """Проверка права с поддержкой wildcard (*) и dot-notation."""
        all_perms = DEFAULT_PERMISSIONS.get(self.role, []) + list(self.permissions)
        if "*" in all_perms:
            return True
        if permission in all_perms:
            return True
        # Проверка wildcard: "orders.*" покрывает "orders.view"
        parts = permission.split(".")
        for i in range(len(parts)):
            wildcard = ".".join(parts[: i + 1]) + ".*"
            if wildcard in all_perms:
                return True
        return False

    def __repr__(self) -> str:
        return f"<Admin {self.role} tg={self.telegram_id}>"


class AdminActionLog(Base, UUIDMixin):
    """
    Неизменяемый лог всех действий администраторов.
    Записывается автоматически через middleware/сервис.
    Нельзя удалить через интерфейс.
    """

    __tablename__ = "admin_action_log"

    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    # Например: "product.create", "order.status_change", "user.block"

    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    before_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    admin: Mapped[AdminUser] = relationship(
        "AdminUser",
        back_populates="action_logs",
        foreign_keys=[admin_id],
    )

    def __repr__(self) -> str:
        return f"<AdminLog {self.action} by {self.admin_id}>"
