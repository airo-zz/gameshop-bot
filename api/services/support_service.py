"""
api/services/support_service.py
─────────────────────────────────────────────────────────────────────────────
Сервис поддержки — тикеты, сообщения, назначение, уведомления.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.models import SupportTicket, TicketMessage, TicketStatus
from shared.models.support import AdminUser, SupportTemplate
from shared.models.order import Order
from shared.models.user import User

logger = logging.getLogger(__name__)


class SupportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Ticket lifecycle ─────────────────────────────────────────────────

    async def create_ticket(
        self,
        user_id: uuid.UUID,
        subject: str,
        message_text: str,
        order_id: uuid.UUID | None = None,
        attachments: list[str] | None = None,
        source: str = "miniapp",
    ) -> SupportTicket:
        ticket = SupportTicket(
            user_id=user_id,
            order_id=order_id,
            subject=subject,
            status=TicketStatus.open,
        )
        self.db.add(ticket)
        await self.db.flush()

        msg = TicketMessage(
            ticket_id=ticket.id,
            sender_type="user",
            sender_id=user_id,
            text=message_text,
            attachments=attachments or [],
        )
        self.db.add(msg)
        await self.db.flush()

        # Уведомление операторам
        self._notify_operators_new_ticket(ticket, message_text)

        return ticket

    async def get_ticket(
        self,
        ticket_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
    ) -> SupportTicket | None:
        stmt = (
            select(SupportTicket)
            .options(
                selectinload(SupportTicket.user),
                selectinload(SupportTicket.assigned_to),
            )
            .where(SupportTicket.id == ticket_id)
        )
        if user_id:
            stmt = stmt.where(SupportTicket.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_ticket_with_messages(
        self,
        ticket_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
    ) -> SupportTicket | None:
        stmt = (
            select(SupportTicket)
            .options(
                selectinload(SupportTicket.messages),
                selectinload(SupportTicket.user),
                selectinload(SupportTicket.assigned_to),
            )
            .where(SupportTicket.id == ticket_id)
        )
        if user_id:
            stmt = stmt.where(SupportTicket.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_open_ticket_for_user(
        self,
        user_id: uuid.UUID,
    ) -> SupportTicket | None:
        """Последний активный тикет юзера (для live chat в боте)."""
        result = await self.db.execute(
            select(SupportTicket)
            .where(
                SupportTicket.user_id == user_id,
                SupportTicket.status.notin_([
                    TicketStatus.closed,
                    TicketStatus.resolved,
                ]),
            )
            .order_by(SupportTicket.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_user_tickets(
        self,
        user_id: uuid.UUID,
        limit: int = 20,
    ) -> list[SupportTicket]:
        result = await self.db.execute(
            select(SupportTicket)
            .where(SupportTicket.user_id == user_id)
            .order_by(SupportTicket.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_all_tickets(
        self,
        status: TicketStatus | None = None,
        assigned_to_id: uuid.UUID | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[SupportTicket], int]:
        """Список тикетов для операторов с фильтрами и пагинацией."""
        stmt = (
            select(SupportTicket)
            .options(
                selectinload(SupportTicket.user),
                selectinload(SupportTicket.assigned_to),
            )
        )
        count_stmt = select(func.count(SupportTicket.id))

        if status:
            stmt = stmt.where(SupportTicket.status == status)
            count_stmt = count_stmt.where(SupportTicket.status == status)
        if assigned_to_id:
            stmt = stmt.where(SupportTicket.assigned_to_id == assigned_to_id)
            count_stmt = count_stmt.where(SupportTicket.assigned_to_id == assigned_to_id)
        if search:
            stmt = stmt.where(SupportTicket.subject.ilike(f"%{search}%"))
            count_stmt = count_stmt.where(SupportTicket.subject.ilike(f"%{search}%"))

        total = (await self.db.execute(count_stmt)).scalar() or 0
        tickets = (
            await self.db.execute(
                stmt.order_by(SupportTicket.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()

        return list(tickets), total

    # ── Messages ─────────────────────────────────────────────────────────

    async def add_message(
        self,
        ticket_id: uuid.UUID,
        sender_type: str,
        sender_id: uuid.UUID,
        text: str,
        attachments: list[str] | None = None,
        is_template: bool = False,
    ) -> TicketMessage:
        msg = TicketMessage(
            ticket_id=ticket_id,
            sender_type=sender_type,
            sender_id=sender_id,
            text=text,
            attachments=attachments or [],
            is_template_response=is_template,
        )
        self.db.add(msg)

        # Обновляем статус тикета
        ticket = await self._get_ticket_with_user(ticket_id)
        if ticket:
            if sender_type == "admin":
                ticket.status = TicketStatus.waiting_user
                self._notify_user_reply(ticket, text)
            elif sender_type == "user":
                if ticket.status == TicketStatus.waiting_user:
                    ticket.status = TicketStatus.open
                if ticket.status not in (TicketStatus.closed, TicketStatus.resolved):
                    self._notify_operators_new_message(ticket, text)

        await self.db.flush()
        return msg

    async def get_messages(
        self,
        ticket_id: uuid.UUID,
        limit: int = 50,
        before_id: uuid.UUID | None = None,
    ) -> list[TicketMessage]:
        stmt = (
            select(TicketMessage)
            .where(TicketMessage.ticket_id == ticket_id)
        )
        if before_id:
            subq = select(TicketMessage.created_at).where(TicketMessage.id == before_id).scalar_subquery()
            stmt = stmt.where(TicketMessage.created_at < subq)

        stmt = stmt.order_by(TicketMessage.created_at.asc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── Status & Assignment ──────────────────────────────────────────────

    async def change_status(
        self,
        ticket_id: uuid.UUID,
        new_status: TicketStatus,
        admin_id: uuid.UUID | None = None,
    ) -> SupportTicket | None:
        ticket = await self._get_ticket_with_user(ticket_id)
        if not ticket:
            return None

        old_status = ticket.status
        ticket.status = new_status

        if new_status in (TicketStatus.closed, TicketStatus.resolved):
            ticket.closed_at = datetime.now(timezone.utc)
            self._notify_user_ticket_closed(ticket)

        await self.db.flush()
        return ticket

    async def assign_ticket(
        self,
        ticket_id: uuid.UUID,
        admin_id: uuid.UUID,
    ) -> SupportTicket | None:
        ticket = await self._get_ticket_bare(ticket_id)
        if not ticket:
            return None

        ticket.assigned_to_id = admin_id
        if ticket.status == TicketStatus.open:
            ticket.status = TicketStatus.in_progress

        await self.db.flush()
        return ticket

    # ── Templates ────────────────────────────────────────────────────────

    async def list_templates(
        self,
        category: str | None = None,
    ) -> list[SupportTemplate]:
        stmt = (
            select(SupportTemplate)
            .where(SupportTemplate.is_active.is_(True))
            .order_by(SupportTemplate.sort_order, SupportTemplate.title)
        )
        if category:
            stmt = stmt.where(SupportTemplate.category == category)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── Helpers for support bot ──────────────────────────────────────────

    async def get_user_by_telegram_id(self, telegram_id: int) -> User | None:
        result = await self.db.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        return result.scalar_one_or_none()

    async def get_user_recent_orders(
        self,
        user_id: uuid.UUID,
        limit: int = 5,
    ) -> list[Order]:
        result = await self.db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ── Private helpers ──────────────────────────────────────────────────

    async def _get_ticket_bare(self, ticket_id: uuid.UUID) -> SupportTicket | None:
        result = await self.db.execute(
            select(SupportTicket).where(SupportTicket.id == ticket_id)
        )
        return result.scalar_one_or_none()

    async def _get_ticket_with_user(self, ticket_id: uuid.UUID) -> SupportTicket | None:
        result = await self.db.execute(
            select(SupportTicket)
            .options(selectinload(SupportTicket.user))
            .where(SupportTicket.id == ticket_id)
        )
        return result.scalar_one_or_none()

    def _notify_operators_new_ticket(
        self,
        ticket: SupportTicket,
        message_text: str,
    ) -> None:
        try:
            from worker.tasks.notification_tasks import notify_operators_new_ticket
            user = ticket.user if hasattr(ticket, "user") and ticket.user else None
            user_name = (user.first_name or user.username or "") if user else ""
            notify_operators_new_ticket.delay(
                str(ticket.id),
                ticket.subject,
                message_text[:200],
                user_name,
            )
        except Exception as exc:
            logger.warning("Failed to notify operators: %s", exc)

    def _notify_operators_new_message(
        self,
        ticket: SupportTicket,
        message_text: str,
    ) -> None:
        try:
            from worker.tasks.notification_tasks import notify_operators_new_message
            user = ticket.user if hasattr(ticket, "user") and ticket.user else None
            user_name = (user.first_name or user.username or "") if user else ""
            notify_operators_new_message.delay(
                str(ticket.id),
                user_name,
                message_text[:200],
            )
        except Exception as exc:
            logger.warning("Failed to notify operators about new message: %s", exc)

    def _notify_user_reply(self, ticket: SupportTicket, reply_text: str) -> None:
        try:
            from worker.tasks.notification_tasks import notify_support_user
            notify_support_user.delay(
                ticket.user.telegram_id if hasattr(ticket, "user") and ticket.user else 0,
                reply_text,
                str(ticket.id),
            )
        except Exception as exc:
            logger.warning("Failed to notify user about reply: %s", exc)

    def _notify_user_ticket_closed(self, ticket: SupportTicket) -> None:
        try:
            from worker.tasks.notification_tasks import notify_support_user
            tg_id = ticket.user.telegram_id if hasattr(ticket, "user") and ticket.user else 0
            if tg_id:
                notify_support_user.delay(
                    tg_id,
                    f"Ваш тикет «{ticket.subject}» был закрыт.\n"
                    f"Если вопрос не решён — напишите новое сообщение.",
                    str(ticket.id),
                )
        except Exception as exc:
            logger.warning("Failed to notify user about ticket close: %s", exc)
