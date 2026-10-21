"""
support_bot/handlers/group.py
─────────────────────────────────────────────────────────────────────────────
Привязка группы операторов для служебных уведомлений.

  /bindgroup   — в группе: сохранить её chat_id (ShopSettings) как адресат
                 уведомлений о заказах/тикетах/сообщениях
  /unbindgroup — отвязать (уведомления пойдут админам в личку)
  /testnotify  — отправить тестовое уведомление по текущей настройке

Команды доступны только активным admin_users с ролью owner/admin.
Остальные сообщения в группах бот игнорирует (роутер start/chat — только private).
─────────────────────────────────────────────────────────────────────────────
"""

import html

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import ShopSettings
from shared.models.support import AdminRole, AdminUser
from shared.staff_notify import NOTIFY_CHAT_KEY, send_staff_async
from support_bot.utils.texts import texts

router = Router(name="support:group")


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
