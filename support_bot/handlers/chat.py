"""
support_bot/handlers/chat.py
─────────────────────────────────────────────────────────────────────────────
Live chat — все сообщения юзера идут в активный тикет.
Обрабатывает текст, фото, документы.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from api.services.support_service import SupportService
from support_bot.utils.texts import texts

router = Router(name="support:chat")


@router.message(F.text | F.photo | F.document)
async def on_message(message: Message, user: User, db: AsyncSession):
    """
    Catch-all для сообщений вне FSM.
    Если у юзера есть открытый тикет — добавляет туда.
    Если нет — создаёт новый тикет автоматически.
    """
    text, attachments = _extract_content(message)
    if not text and not attachments:
        return

    svc = SupportService(db)
    open_ticket = await svc.get_open_ticket_for_user(user.id)

    if open_ticket:
        await svc.add_message(
            ticket_id=open_ticket.id,
            sender_type="user",
            sender_id=user.id,
            text=text or "(вложение)",
            attachments=attachments,
        )
        await message.answer(texts.message_added)
    else:
        # Нет открытого тикета — создаём новый
        subject = (text[:80] + "...") if text and len(text) > 80 else (text or "Обращение")
        await svc.create_ticket(
            user_id=user.id,
            subject=subject,
            message_text=text or "(вложение)",
            attachments=attachments,
            source="bot",
        )
        await message.answer(texts.ticket_created)


def _extract_content(message: Message) -> tuple[str | None, list[str]]:
    """Извлекает текст и вложения из сообщения."""
    text = message.text or message.caption
    attachments: list[str] = []

    if message.photo:
        photo = message.photo[-1]
        attachments.append(f"tg://photo/{photo.file_id}")

    if message.document:
        attachments.append(f"tg://doc/{message.document.file_id}")

    return text, attachments
