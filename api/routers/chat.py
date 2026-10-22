"""
api/routers/chat.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинты чата покупателя с продавцом.

GET  /chat                          — получить чат текущего пользователя (создать если нет)
GET  /chat/messages                 — получить сообщения + unread_count
POST /chat/messages                 — отправить сообщение (sender_type=user)
POST /chat/read                     — пометить чат прочитанным пользователем
POST /chat/guest                    — гостевой чат сайта без входа (токен гостя)

Все эндпоинты принимают и обычную авторизацию, и токен гостя (ChatUser).

Системные сообщения добавляются напрямую через ChatService (без HTTP эндпоинта)
из api/services/payment_service.py при успешной оплате заказа.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request

from api.deps import ChatUser, DbSession, create_guest_token
from api.rate_limit import limiter
from api.schemas.chat import ChatMessageOut, ChatOut, SendMessageRequest
from api.services.chat_service import ChatService

router = APIRouter()


@router.get("", response_model=ChatOut)
async def get_or_create_chat(db: DbSession, user: ChatUser) -> ChatOut:
    """Возвращает чат текущего пользователя. Создаёт если не существует."""
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    unread_count = await svc.get_user_unread_count(chat.id)
    return ChatOut(
        id=chat.id,
        user_id=chat.user_id,
        created_at=chat.created_at,
        unread_count=unread_count,
    )


@router.get("/messages", response_model=list[ChatMessageOut])
async def get_messages(
    db: DbSession,
    user: ChatUser,
    after_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
) -> list[ChatMessageOut]:
    """Возвращает сообщения чата текущего пользователя."""
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    messages = await svc.get_messages(chat.id, limit=limit, after_id=after_id)
    return [ChatMessageOut.model_validate(m) for m in messages]


@router.post("/messages", response_model=ChatMessageOut, status_code=201)
@limiter.limit("30/minute")
async def send_message(
    request: Request,
    body: SendMessageRequest,
    db: DbSession,
    user: ChatUser,
) -> ChatMessageOut:
    """Отправляет сообщение от имени пользователя."""
    text = body.text.strip() if body.text else None
    if not text and not body.attachments:
        raise HTTPException(status_code=422, detail="Нужен текст или вложение")
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    msg = await svc.send_message(chat.id, "user", text, body.attachments)
    return ChatMessageOut.model_validate(msg)


@router.post("/read", status_code=204)
async def mark_read(
    db: DbSession,
    user: ChatUser,
) -> None:
    """Помечает чат прочитанным пользователем (обновляет last_user_read_at)."""
    svc = ChatService(db)
    chat = await svc.get_or_create_chat(user.telegram_id)
    await svc.mark_read_by_user(chat.id)


@router.post("/guest")
@limiter.limit("5/hour")
async def start_guest_chat(request: Request, db: DbSession) -> dict:
    """
    Гостевой чат сайта: заводит анонимного пользователя и возвращает его токен
    (доступ только к чату). Вызывается сайтом при первом сообщении гостя.
    """
    from api.services.account_service import create_guest

    guest = await create_guest(db)
    return {"guest_token": create_guest_token(guest.telegram_id)}
