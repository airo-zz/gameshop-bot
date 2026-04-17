"""
api/routers/admin/chats.py
─────────────────────────────────────────────────────────────────────────────
Управление чатами пользователей в администраторской панели.

GET  /chats                     — список всех чатов с unread, preview
GET  /chats/{chat_id}           — детали чата + все сообщения + user info
POST /chats/{chat_id}/send      — отправить сообщение от admin
POST /chats/{chat_id}/read      — пометить чат прочитанным admin'ом
POST /chats/{chat_id}/notify    — отправить push-уведомление пользователю через бот
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

import structlog
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from api.deps import DbSession
from api.deps_admin import CurrentAdmin
from api.schemas.chat import (
    AdminChatDetail,
    AdminChatListItem,
    AdminChatUserInfo,
    AdminNotifyRequest,
    AdminSendMessageRequest,
    ChatMessageOut,
)
from api.services.chat_service import ChatService
from shared.config import settings
from shared.models.chat import Chat
from shared.models.user import User

router = APIRouter()
log = structlog.get_logger()


def _build_user_info(user: User | None, chat: Chat) -> AdminChatUserInfo:
    if user is None:
        return AdminChatUserInfo(telegram_id=chat.user_id)
    return AdminChatUserInfo(
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name or "",
    )


@router.get("", response_model=list[AdminChatListItem])
async def list_chats(
    db: DbSession,
    admin: CurrentAdmin,
) -> list[AdminChatListItem]:
    """
    Список всех чатов.
    Сортировка: сначала с непрочитанными (у admin), затем по last_message_at DESC.
    """
    svc = ChatService(db)
    chats = await svc.get_all_chats()

    # Загружаем user-info одним запросом
    user_ids = [c.user_id for c in chats]
    users_result = await db.execute(
        select(User).where(User.telegram_id.in_(user_ids))
    )
    users_by_tid: dict[int, User] = {u.telegram_id: u for u in users_result.scalars().all()}

    # Последнее сообщение для preview
    items: list[AdminChatListItem] = []
    for chat in chats:
        unread = await svc.get_admin_unread_count(chat.id)

        # Preview: берём последнее сообщение
        msgs = await svc.get_messages(chat.id, limit=1)
        preview = None
        if msgs:
            last = msgs[-1]
            if last.text:
                preview = last.text[:80] + ("..." if len(last.text) > 80 else "")
            elif last.attachments:
                preview = "[вложение]"

        user = users_by_tid.get(chat.user_id)
        items.append(AdminChatListItem(
            id=chat.id,
            user=_build_user_info(user, chat),
            last_message_preview=preview,
            last_message_at=chat.last_message_at,
            admin_unread_count=unread,
        ))

    # Сортируем: сначала непрочитанные, затем по last_message_at DESC
    items.sort(
        key=lambda x: (
            0 if x.admin_unread_count > 0 else 1,
            -(x.last_message_at.timestamp() if x.last_message_at else 0),
        )
    )

    return items


@router.get("/{chat_id}", response_model=AdminChatDetail)
async def get_chat_detail(
    chat_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> AdminChatDetail:
    """Детали чата + все сообщения + user info."""
    svc = ChatService(db)
    chat = await svc.get_chat_by_id(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")

    user_result = await db.execute(
        select(User).where(User.telegram_id == chat.user_id)
    )
    user = user_result.scalar_one_or_none()

    messages = await svc.get_messages(chat_id, limit=200)

    return AdminChatDetail(
        id=chat.id,
        user=_build_user_info(user, chat),
        created_at=chat.created_at,
        last_message_at=chat.last_message_at,
        messages=[ChatMessageOut.model_validate(m) for m in messages],
    )


@router.post("/{chat_id}/send", response_model=ChatMessageOut, status_code=201)
async def send_message(
    chat_id: uuid.UUID,
    body: AdminSendMessageRequest,
    db: DbSession,
    admin: CurrentAdmin,
) -> ChatMessageOut:
    """Отправляет сообщение от admin в чат пользователя."""
    svc = ChatService(db)
    chat = await svc.get_chat_by_id(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Текст не может быть пустым")

    msg = await svc.send_message(chat_id, "admin", text)
    log.info("admin.chat.send", chat_id=str(chat_id), admin_id=str(admin.id))
    return ChatMessageOut.model_validate(msg)


@router.post("/{chat_id}/read", status_code=204)
async def mark_read(
    chat_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    """Помечает чат прочитанным admin'ом."""
    svc = ChatService(db)
    chat = await svc.get_chat_by_id(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")
    await svc.mark_read_by_admin(chat_id)


@router.post("/{chat_id}/notify", status_code=204)
async def notify_user(
    chat_id: uuid.UUID,
    body: AdminNotifyRequest,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    """Отправляет push-уведомление пользователю через Telegram бот."""
    svc = ChatService(db)
    chat = await svc.get_chat_by_id(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")

    notification_text = body.text or "У вас новое сообщение от продавца. Откройте чат для ответа."

    # Формируем кнопку открытия Mini App
    reply_markup = None
    if settings.MINIAPP_URL or settings.BOT_USERNAME:
        miniapp_url = (
            settings.MINIAPP_URL.rstrip("/")
            if settings.MINIAPP_URL
            else f"https://t.me/{settings.BOT_USERNAME}/app"
        )
        reply_markup = {
            "inline_keyboard": [[{
                "text": "Открыть чат",
                "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=chat",
            }]]
        }

    try:
        from worker.tasks.notification_tasks import send_notification
        send_notification.delay(
            chat.user_id,
            f"<b>Сообщение от продавца</b>\n\n{notification_text}",
            reply_markup,
        )
    except Exception as exc:
        log.error("admin.chat.notify.failed", chat_id=str(chat_id), error=str(exc))
        raise HTTPException(status_code=500, detail="Не удалось отправить уведомление")
