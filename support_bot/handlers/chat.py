"""
support_bot/handlers/chat.py
─────────────────────────────────────────────────────────────────────────────
Live chat — все сообщения юзера идут в активный тикет (in_chat state).
Принимает текст, фото, документы без подтверждений.
Закрытие тикета обрабатывается через inline callback support:close:{id}
в start.py — здесь только приём сообщений.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from api.services.support_service import SupportService
from support_bot.handlers.start import SupportStates, _show_main_menu

router = Router(name="support:chat")


# ── Приём сообщений в чате ────────────────────────────────────────────────────


@router.message(SupportStates.in_chat, F.text | F.photo | F.document)
async def on_chat_message(message: Message, user: User, db: AsyncSession, state: FSMContext):
    data = await state.get_data()
    ticket_id_str = data.get("ticket_id")

    if not ticket_id_str:
        await state.clear()
        await _show_main_menu(message, user, db)
        return

    text, attachments = _extract_content(message)
    if not text and not attachments:
        return

    ticket_id = uuid.UUID(ticket_id_str)
    svc = SupportService(db)
    await svc.add_message(
        ticket_id=ticket_id,
        sender_type="user",
        sender_id=user.id,
        text=text or "(вложение)",
        attachments=attachments,
    )
    # Молча принимаем — без подтверждения "Отправлено."


# ── Helper ────────────────────────────────────────────────────────────────────


def _extract_content(message: Message) -> tuple[str | None, list[str]]:
    text = message.text or message.caption
    attachments: list[str] = []
    if message.photo:
        attachments.append(f"tg://photo/{message.photo[-1].file_id}")
    if message.document:
        attachments.append(f"tg://doc/{message.document.file_id}")
    return text, attachments
