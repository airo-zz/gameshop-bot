"""
api/routers/support.py
─────────────────────────────────────────────────────────────────────────────
Клиентские эндпоинты поддержки — создание тикетов, ответы, просмотр.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, HTTPException, Query, UploadFile, status

from api.deps import CurrentUser, DbSession
from api.schemas.support import (
    CreateTicketRequest,
    ReplyTicketRequest,
    TicketMessageOut,
    TicketOut,
)
from api.services.support_service import SupportService

router = APIRouter()

SUPPORT_UPLOAD_DIR = Path("/static/uploads/support")
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/upload")
async def upload_attachment(file: UploadFile, user: CurrentUser) -> dict:
    """Загрузка вложения к тикету. Только изображения, макс 5 МБ."""
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Неподдерживаемый тип: {content_type}. Разрешены: jpg, png, webp",
        )

    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл слишком большой. Максимум 5 МБ.",
        )

    SUPPORT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.{ext}"
    dest = SUPPORT_UPLOAD_DIR / filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(contents)

    return {"url": f"/static/uploads/support/{filename}"}


@router.post("")
async def create_ticket(body: CreateTicketRequest, db: DbSession, user: CurrentUser):
    svc = SupportService(db)
    order_id = uuid.UUID(body.order_id) if body.order_id else None

    ticket = await svc.create_ticket(
        user_id=user.id,
        subject=body.subject,
        message_text=body.message,
        order_id=order_id,
        attachments=body.attachments,
        source="miniapp",
    )
    return {"ticket_id": str(ticket.id), "ok": True}


@router.get("", response_model=list[TicketOut])
async def list_tickets(db: DbSession, user: CurrentUser):
    svc = SupportService(db)
    tickets = await svc.list_user_tickets(user.id)
    return [TicketOut.model_validate(t) for t in tickets]


@router.get("/by-order/{order_id}", response_model=TicketOut)
async def get_ticket_by_order(
    order_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
):
    """Найти тикет по ID заказа."""
    svc = SupportService(db)
    ticket = await svc.get_ticket_by_order_id(order_id, user_id=user.id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    return TicketOut.model_validate(ticket)


@router.get("/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: uuid.UUID, db: DbSession, user: CurrentUser):
    svc = SupportService(db)
    ticket = await svc.get_ticket(ticket_id, user_id=user.id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    return TicketOut.model_validate(ticket)


@router.get("/{ticket_id}/messages", response_model=list[TicketMessageOut])
async def get_ticket_messages(
    ticket_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
    before_id: uuid.UUID | None = Query(None),
):
    svc = SupportService(db)
    # Проверяем владение тикетом
    ticket = await svc.get_ticket(ticket_id, user_id=user.id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    messages = await svc.get_messages(ticket_id, limit=limit, before_id=before_id)
    return [TicketMessageOut.model_validate(m) for m in messages]


@router.post("/{ticket_id}/reply")
async def reply_to_ticket(
    ticket_id: uuid.UUID,
    body: ReplyTicketRequest,
    db: DbSession,
    user: CurrentUser,
):
    svc = SupportService(db)
    ticket = await svc.get_ticket(ticket_id, user_id=user.id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    msg = await svc.add_message(
        ticket_id=ticket_id,
        sender_type="user",
        sender_id=user.id,
        text=body.text,
        attachments=body.attachments,
    )
    return {"ok": True, "message_id": str(msg.id)}
