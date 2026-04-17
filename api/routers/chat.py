"""
api/routers/chat.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинты чата покупателя с продавцом.

GET  /chat                          — получить чат текущего пользователя (создать если нет)
GET  /chat/messages?after_id=&limit=50 — получить сообщения
POST /chat/messages                 — отправить сообщение (sender_type=user)

Системные сообщения добавляются напрямую через ChatService (без HTTP эндпоинта)
из api/services/payment_service.py при успешной оплате заказа.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from fastapi import APIRouter, HTTPException, Query

from api.deps import CurrentUser, DbSession
from api.schemas.chat import ChatMessageOut, ChatOut, SendMessageRequest
from api.services.chat_service import ChatService

router = APIRouter()


@router.get("", response_model=ChatOut)
async def get_or_create_chat(db: DbSession, user: CurrentUser) -> ChatOut:
    """Возвращает чат текущего пользователя. Создаёт если не существует."""
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    return ChatOut.model_validate(chat)


@router.get("/messages", response_model=list[ChatMessageOut])
async def get_messages(
    db: DbSession,
    user: CurrentUser,
    after_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
) -> list[ChatMessageOut]:
    """Возвращает сообщения чата текущего пользователя."""
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    messages = await svc.get_messages(chat.id, limit=limit, after_id=after_id)
    return [ChatMessageOut.model_validate(m) for m in messages]


@router.post("/messages", response_model=ChatMessageOut, status_code=201)
async def send_message(
    body: SendMessageRequest,
    db: DbSession,
    user: CurrentUser,
) -> ChatMessageOut:
    """Отправляет сообщение от имени пользователя."""
    text = body.text.strip() if body.text else None
    if not text and not body.attachments:
        raise HTTPException(status_code=422, detail="Нужен текст или вложение")
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    msg = await svc.send_message(chat.id, "user", text, body.attachments)
    return ChatMessageOut.model_validate(msg)
