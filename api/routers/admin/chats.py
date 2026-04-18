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
from pathlib import Path

import aiofiles
import structlog
from fastapi import APIRouter, HTTPException, UploadFile, status
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
    LinkedOrderOut,
)
from api.services.chat_service import ChatService
from shared.config import settings
from shared.models.chat import Chat
from shared.models.order import Order
from shared.models.user import User

router = APIRouter()
log = structlog.get_logger()

CHAT_UPLOAD_DIR = Path("/static/uploads/chat")
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


def _build_user_info(user: User | None, chat: Chat) -> AdminChatUserInfo:
    if user is None:
        return AdminChatUserInfo(telegram_id=chat.user_id)
    return AdminChatUserInfo(
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name or "",
    )


def _build_linked_order(order: "Order | None") -> "LinkedOrderOut | None":
    if order is None:
        return None
    return LinkedOrderOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status.value,
        total_amount=float(order.total_amount),
        assigned_admin_id=order.assigned_admin_id,
    )


@router.get("", response_model=list[AdminChatListItem])
async def list_chats(
    db: DbSession,
    admin: CurrentAdmin,
    filter_mode: str | None = None,
    # filter_mode: None/"all" | "mine" | "free"
    # mine = linked to order + assigned_admin_id == current admin
    # free = linked to order + assigned_admin_id IS NULL
) -> list[AdminChatListItem]:
    """
    Список всех чатов.
    Сортировка: сначала с непрочитанными (у admin), затем по last_message_at DESC.
    filter_mode: all (default) | mine | free
    """
    from sqlalchemy.orm import selectinload as _sil

    svc = ChatService(db)
    chats = await svc.get_all_chats_with_orders()

    # Загружаем user-info одним запросом
    user_ids = [c.user_id for c in chats]
    users_result = await db.execute(
        select(User).where(User.telegram_id.in_(user_ids))
    )
    users_by_tid: dict[int, User] = {u.telegram_id: u for u in users_result.scalars().all()}

    # Применяем фильтр по режиму
    if filter_mode == "mine":
        chats = [c for c in chats if c.order_id is not None and
                 c.order is not None and c.order.assigned_admin_id == admin.id]
    elif filter_mode == "free":
        chats = [c for c in chats if c.order_id is not None and
                 c.order is not None and c.order.assigned_admin_id is None]

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
            order=_build_linked_order(chat.order),
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

    # Загружаем заказ если есть
    linked_order: "Order | None" = None
    if chat.order_id is not None:
        order_result = await db.execute(select(Order).where(Order.id == chat.order_id))
        linked_order = order_result.scalar_one_or_none()

    return AdminChatDetail(
        id=chat.id,
        user=_build_user_info(user, chat),
        created_at=chat.created_at,
        last_message_at=chat.last_message_at,
        messages=[ChatMessageOut.model_validate(m) for m in messages],
        order=_build_linked_order(linked_order),
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

    text = body.text.strip() if body.text else None
    if not text and not body.attachments:
        raise HTTPException(status_code=422, detail="Текст или вложение обязательны")

    msg = await svc.send_message(chat_id, "admin", text, body.attachments)
    log.info("admin.chat.send", chat_id=str(chat_id), admin_id=str(admin.id))
    return ChatMessageOut.model_validate(msg)


@router.post("/{chat_id}/upload")
async def upload_attachment(
    chat_id: uuid.UUID,
    file: UploadFile,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """Загрузка вложения для чата. Изображения и PDF, макс 10 МБ."""
    svc = ChatService(db)
    chat = await svc.get_chat_by_id(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")

    content_type = (file.content_type or "").lower()
    ext = ALLOWED_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Неподдерживаемый тип: {content_type}",
        )

    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл слишком большой. Максимум 10 МБ.",
        )

    CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    import uuid as _uuid
    filename = f"{_uuid.uuid4()}.{ext}"
    dest = CHAT_UPLOAD_DIR / filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(contents)

    return {"url": f"/static/uploads/chat/{filename}"}


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

    payload: dict = {
        "chat_id": chat.user_id,
        "text": f"<b>Сообщение от продавца</b>\n\n{notification_text}",
        "parse_mode": "HTML",
    }
    if settings.BOT_USERNAME:
        payload["reply_markup"] = {
            "inline_keyboard": [[
                {"text": "Открыть чат", "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=chat"}
            ]]
        }

    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
        data = resp.json()
        if not data.get("ok"):
            err = data.get("description", "Telegram error")
            log.error("admin.chat.notify.failed", chat_id=str(chat_id), error=err)
            raise HTTPException(status_code=500, detail=f"Не удалось отправить: {err}")
    except HTTPException:
        raise
    except Exception as exc:
        log.error("admin.chat.notify.failed", chat_id=str(chat_id), error=str(exc))
        raise HTTPException(status_code=500, detail="Не удалось отправить уведомление")
