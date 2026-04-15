"""
support_bot/handlers/chat.py
─────────────────────────────────────────────────────────────────────────────
Live chat — все сообщения юзера идут в активный тикет (in_chat state).
Обрабатывает текст, фото, документы, команду /exit и кнопку "Выйти из чата".
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from api.services.support_service import SupportService
from support_bot.handlers.start import SupportStates, _show_main_menu
from support_bot.utils.texts import texts, BTN_EXIT_CHAT

router = Router(name="support:chat")


# ── Выход из чата ─────────────────────────────────────────────────────────────


async def _exit_chat(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    await state.clear()
    await message.answer(texts.chat_exited, parse_mode="HTML")
    await _show_main_menu(message, user, db)


@router.message(SupportStates.in_chat, F.text == BTN_EXIT_CHAT)
async def on_exit_button(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await _exit_chat(message, user, db, state)


@router.message(SupportStates.in_chat, Command("exit"))
async def on_exit_command(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await _exit_chat(message, user, db, state)


# ── Приём сообщений в чате ────────────────────────────────────────────────────


@router.message(SupportStates.in_chat, F.text | F.photo | F.document)
async def on_chat_message(message: Message, user: User, db: AsyncSession, state: FSMContext):
    data = await state.get_data()
    ticket_id_str = data.get("ticket_id")

    if not ticket_id_str:
        # FSM data повреждены — выходим в главное меню
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

    await message.answer(texts.message_sent, parse_mode="HTML")


# ── Helper ────────────────────────────────────────────────────────────────────


def _extract_content(message: Message) -> tuple[str | None, list[str]]:
    text = message.text or message.caption
    attachments: list[str] = []

    if message.photo:
        photo = message.photo[-1]
        attachments.append(f"tg://photo/{photo.file_id}")

    if message.document:
        attachments.append(f"tg://doc/{message.document.file_id}")

    return text, attachments
