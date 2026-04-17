"""
bot/handlers/admin/chat_reply.py
─────────────────────────────────────────────────────────────────────────────
Команда /reply для ответа admin'а пользователю через Telegram бот.

Использование:
  /reply <telegram_id> <текст сообщения>

Создаёт ChatMessage с sender_type="admin" через сервис + отправляет
сообщение пользователю.
─────────────────────────────────────────────────────────────────────────────
"""

import structlog
from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from bot.middlewares.admin_auth import require_permission
from bot.utils.texts import texts
from shared.models import AdminUser

router = Router(name="admin:chat_reply")
log = structlog.get_logger()


@router.message(Command("reply"))
@require_permission("orders.view")
async def cmd_reply(message: Message, db: AsyncSession, admin: AdminUser, bot: Bot) -> None:
    """
    /reply <telegram_id> <текст>

    Отправляет сообщение пользователю в чат (через ChatService) и уведомление в Telegram.
    """
    if not message.text:
        return

    parts = message.text.split(maxsplit=2)
    if len(parts) < 3:
        await message.reply(texts.chat_reply_usage)
        return

    try:
        target_telegram_id = int(parts[1])
    except ValueError:
        await message.reply(texts.chat_reply_invalid_id)
        return

    text = parts[2].strip()
    if not text:
        await message.reply(texts.chat_reply_empty_text)
        return

    # Создаём сообщение в чате через сервис
    try:
        from api.services.chat_service import ChatService
        svc = ChatService(db)
        chat = await svc.get_or_create_chat(target_telegram_id)
        await svc.send_message(chat.id, "admin", text)
        await db.commit()
    except Exception as exc:
        log.error("admin.chat_reply.db_error", error=str(exc), target_id=target_telegram_id)
        await message.reply(texts.error_general)
        return

    # Отправляем уведомление пользователю в Telegram
    try:
        from shared.config import settings
        reply_markup = None
        if settings.BOT_USERNAME:
            from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
            reply_markup = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="Открыть чат",
                    url=f"https://t.me/{settings.BOT_USERNAME}?startapp=chat",
                )
            ]])

        await bot.send_message(
            chat_id=target_telegram_id,
            text=texts.chat_new_admin_message(text),
            parse_mode="HTML",
            reply_markup=reply_markup,
        )
    except Exception as exc:
        log.warning(
            "admin.chat_reply.tg_send_failed",
            error=str(exc),
            target_id=target_telegram_id,
        )
        # Сообщение в БД уже создано — просто предупреждаем
        await message.reply(texts.chat_reply_sent_db_only(target_telegram_id))
        return

    await message.reply(texts.chat_reply_sent(target_telegram_id))
    log.info(
        "admin.chat_reply.sent",
        admin_id=str(admin.id),
        target_telegram_id=target_telegram_id,
    )
