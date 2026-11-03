"""
support_bot/handlers/group.py
─────────────────────────────────────────────────────────────────────────────
Привязка группы операторов для служебных уведомлений.

  /bindgroup   — в группе: сохранить её chat_id (ShopSettings) как адресат
                 уведомлений о заказах/тикетах/сообщениях
  /unbindgroup — отвязать (уведомления пойдут админам в личку)
  /testnotify  — отправить тестовое уведомление по текущей настройке

Команды доступны только активным admin_users с ролью owner/admin.

Ответ клиенту: сотрудник отвечает (Reply) на уведомление о заказе/сообщении —
текст уходит покупателю в чат (сайт/мини-приложение/бот) как сообщение
оператора. Связь «уведомление → чат» хранит shared.staff_notify в Redis.
Работает и в группе, и в личке (резерв, когда группа не привязана) — поэтому
роутер подключён раньше клиентского chat-роутера.

Остальные сообщения в группах бот игнорирует (роутер start/chat — только private).
─────────────────────────────────────────────────────────────────────────────
"""

import html
import logging
import uuid

import redis.asyncio as aioredis
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message, ReactionTypeEmoji
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.chat_service import ChatService
from shared.config import settings
from shared.models import ShopSettings
from shared.models.support import AdminRole, AdminUser
from shared.staff_notify import NOTIFY_CHAT_KEY, reply_key, send_staff_async
from support_bot.utils.texts import texts

logger = logging.getLogger(__name__)
router = Router(name="support:group")

_redis: aioredis.Redis | None = None


def _r() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def _reply_target(message: Message) -> dict | bool:
    """Фильтр: сообщение — Reply на уведомление бота, к которому привязан чат клиента."""
    parent = message.reply_to_message
    if not parent or not parent.from_user or parent.from_user.id != message.bot.id:
        return False
    try:
        chat_id = await _r().get(reply_key(message.chat.id, parent.message_id))
    except Exception as exc:
        logger.warning("staff reply: redis: %s", exc)
        return False
    return {"target_chat_id": chat_id} if chat_id else False


async def _is_staff(db: AsyncSession, telegram_id: int) -> bool:
    row = await db.execute(
        select(AdminUser.id).where(AdminUser.telegram_id == telegram_id, AdminUser.is_active.is_(True))
    )
    return row.scalar_one_or_none() is not None


@router.message(_reply_target)
async def staff_reply_to_client(message: Message, db: AsyncSession, target_chat_id: str):
    if not message.from_user or not await _is_staff(db, message.from_user.id):
        await message.reply(texts.staff_reply_no_access)
        return
    text = (message.text or message.caption or "").strip()
    has_media = bool(message.photo or message.document or message.video)
    if not text:
        await message.reply(texts.staff_reply_photo if has_media else texts.staff_reply_empty)
        return

    svc = ChatService(db)
    chat = await svc.get_chat_by_id(uuid.UUID(target_chat_id))
    if chat is None:
        await message.reply(texts.staff_reply_chat_gone)
        return
    try:
        await svc.send_message(chat.id, "admin", text[:4000])
        await db.flush()
    except Exception as exc:
        logger.exception("staff reply: send failed chat=%s: %s", target_chat_id, exc)
        await message.reply(texts.staff_reply_failed)
        return

    if has_media:
        await message.reply(texts.staff_reply_photo)
    try:
        await message.react([ReactionTypeEmoji(emoji="👍")])
    except Exception:
        pass  # реакции могут быть запрещены в группе — сообщение клиенту уже ушло


async def _is_shop_admin(db: AsyncSession, telegram_id: int) -> bool:
    row = await db.execute(
        select(AdminUser.id).where(
            AdminUser.telegram_id == telegram_id,
            AdminUser.is_active.is_(True),
            AdminUser.role.in_([AdminRole.owner, AdminRole.admin]),
        )
    )
    return row.scalar_one_or_none() is not None


@router.message(Command("bindgroup"), F.chat.type.in_({"group", "supergroup"}))
async def cmd_bind_group(message: Message, db: AsyncSession):
    if not message.from_user or not await _is_shop_admin(db, message.from_user.id):
        await message.reply(texts.group_not_admin)
        return
    row = await db.get(ShopSettings, NOTIFY_CHAT_KEY)
    if row:
        row.value = str(message.chat.id)
    else:
        db.add(ShopSettings(
            key=NOTIFY_CHAT_KEY,
            value=str(message.chat.id),
            description="chat_id группы для уведомлений персонала (/bindgroup)",
        ))
    await db.flush()
    await message.reply(texts.group_bound(html.escape(message.chat.title or "")))


@router.message(Command("unbindgroup"))
async def cmd_unbind_group(message: Message, db: AsyncSession):
    if not message.from_user or not await _is_shop_admin(db, message.from_user.id):
        await message.reply(texts.group_not_admin)
        return
    row = await db.get(ShopSettings, NOTIFY_CHAT_KEY)
    if row:
        await db.delete(row)
        await db.flush()
    await message.reply(texts.group_unbound)


@router.message(Command("testnotify"))
async def cmd_test_notify(message: Message, db: AsyncSession):
    if not message.from_user or not await _is_shop_admin(db, message.from_user.id):
        await message.reply(texts.group_not_admin)
        return
    ok = await send_staff_async(db, texts.group_test)
    if not ok:
        await message.reply(texts.group_test_failed)


@router.message(F.chat.type != "private")
async def ignore_group_messages(message: Message):
    """Не реагируем на переписку операторов в группе."""
    return
