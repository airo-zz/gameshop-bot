"""api/routers/support.py"""
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import CurrentUser, DbSession
from shared.models import SupportTicket, TicketMessage, TicketStatus

router = APIRouter()


class CreateTicketRequest(BaseModel):
    subject: str
    message: str
    order_id: str | None = None


class ReplyTicketRequest(BaseModel):
    text: str


@router.post("")
async def create_ticket(body: CreateTicketRequest, db: DbSession, user: CurrentUser):
    import uuid
    ticket = SupportTicket(
        user_id=user.id,
        order_id=uuid.UUID(body.order_id) if body.order_id else None,
        subject=body.subject,
        status=TicketStatus.open,
    )
    db.add(ticket)
    await db.flush()

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_type="user",
        sender_id=user.id,
        text=body.message,
    )
    db.add(msg)
    return {"ticket_id": str(ticket.id), "ok": True}


@router.get("")
async def list_tickets(db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
        .limit(20)
    )
    tickets = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "subject": t.subject,
            "status": t.status.value,
            "created_at": t.created_at.isoformat(),
        }
        for t in tickets
    ]


@router.post("/{ticket_id}/reply")
async def reply_to_ticket(ticket_id: str, body: ReplyTicketRequest, db: DbSession, user: CurrentUser):
    import uuid
    result = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id == uuid.UUID(ticket_id),
            SupportTicket.user_id == user.id,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        from fastapi import HTTPException
        raise HTTPException(404, "Тикет не найден")

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_type="user",
        sender_id=user.id,
        text=body.text,
    )
    db.add(msg)
    ticket.status = TicketStatus.open  # Реоткрываем если был waiting_user
    return {"ok": True}
