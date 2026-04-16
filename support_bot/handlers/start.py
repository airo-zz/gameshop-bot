"""
support_bot/handlers/start.py
─────────────────────────────────────────────────────────────────────────────
/start, главное меню, создание тикета, список тикетов, вход в чат.
Только InlineKeyboard — никакого ReplyKeyboard.
─────────────────────────────────────────────────────────────────────────────
"""

import asyncio
import uuid

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from shared.models.support import TicketStatus
from api.services.support_service import SupportService
from support_bot.utils.texts import texts

router = Router(name="support:start")


# ── FSM States ────────────────────────────────────────────────────────────────


class SupportStates(StatesGroup):
    writing_message = State()   # первое сообщение → создаёт тикет
    choosing_ticket = State()   # список тикетов открыт
    in_chat = State()           # live chat — сообщения идут в открытый тикет


# ── Keyboards ─────────────────────────────────────────────────────────────────


def _main_menu_kb(has_active: bool) -> InlineKeyboardMarkup:
    if has_active:
        buttons = [
            [
                InlineKeyboardButton(text="▶️ Продолжить", callback_data="support:continue"),
                InlineKeyboardButton(text="🆕 Новое обращение", callback_data="support:create"),
            ],
            [
                InlineKeyboardButton(text="📋 Все обращения", callback_data="support:tickets"),
            ],
        ]
    else:
        buttons = [
            [
                InlineKeyboardButton(text="💬 Написать в поддержку", callback_data="support:create"),
                InlineKeyboardButton(text="📋 Мои обращения", callback_data="support:tickets"),
            ],
        ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="❌ Отмена", callback_data="support:cancel")],
    ])


def _created_kb(ticket_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="❌ Закрыть обращение", callback_data=f"support:close:{ticket_id}")],
    ])


def _ticket_detail_kb(ticket_id: str, is_active: bool) -> InlineKeyboardMarkup:
    rows = []
    if is_active:
        rows.append([InlineKeyboardButton(text="▶️ Продолжить переписку", callback_data=f"support:enter:{ticket_id}")])
        rows.append([
            InlineKeyboardButton(text="❌ Закрыть", callback_data=f"support:close:{ticket_id}"),
            InlineKeyboardButton(text="⬅️ Назад", callback_data="support:tickets"),
        ])
    else:
        rows.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="support:tickets")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _tickets_list_kb(tickets: list) -> InlineKeyboardMarkup:
    months = ["янв", "фев", "мар", "апр", "май", "июн",
              "июл", "авг", "сен", "окт", "ноя", "дек"]
    status_map = {
        TicketStatus.open: "открыт",
        TicketStatus.in_progress: "в работе",
        TicketStatus.waiting_user: "ждёт ответа",
        TicketStatus.resolved: "решён",
        TicketStatus.closed: "закрыт",
    }
    buttons = []
    for ticket in tickets:
        short_id = str(ticket.id)[:8]
        status_label = status_map.get(ticket.status, str(ticket.status))
        date_label = ""
        if ticket.created_at:
            date_label = f" · {ticket.created_at.day} {months[ticket.created_at.month - 1]}"
        label = f"#{short_id} · {status_label}{date_label}"
        buttons.append([
            InlineKeyboardButton(
                text=label,
                callback_data=f"support:ticket:{ticket.id}",
            )
        ])
    buttons.append([
        InlineKeyboardButton(text="⬅️ Назад", callback_data="support:back"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _format_messages_preview(messages) -> str:
    lines = []
    for msg in messages[-3:]:
        who = "Вы" if msg.sender_type == "user" else "Оператор"
        body = (msg.text or "(вложение)")[:120]
        lines.append(f"{who}: {body}")
    return "\n".join(lines)


def _status_label(status: TicketStatus) -> str:
    return {
        TicketStatus.open: "открыто",
        TicketStatus.in_progress: "в работе",
        TicketStatus.waiting_user: "ждёт ответа",
        TicketStatus.resolved: "решено",
        TicketStatus.closed: "закрыто",
    }.get(status, str(status))


def _is_active(status: TicketStatus) -> bool:
    return status not in (TicketStatus.closed, TicketStatus.resolved)


def _extract_content(message: Message) -> tuple[str | None, list[str]]:
    text = message.text or message.caption
    attachments: list[str] = []
    if message.photo:
        attachments.append(f"tg://photo/{message.photo[-1].file_id}")
    if message.document:
        attachments.append(f"tg://doc/{message.document.file_id}")
    return text, attachments


async def _show_main_menu(
    target: Message | CallbackQuery,
    user: User,
    db: AsyncSession,
) -> None:
    """Отправить (или отредактировать) главное меню."""
    svc = SupportService(db)
    active = await svc.get_open_ticket_for_user(user.id)

    if active:
        ticket = await svc.get_ticket_with_messages(active.id)
        short_id = str(active.id)[:8]
        preview = _format_messages_preview(ticket.messages) if (ticket and ticket.messages) else ""
        text = texts.welcome_active(short_id, preview) if preview else texts.welcome
    else:
        text = texts.welcome

    kb = _main_menu_kb(has_active=bool(active))

    if isinstance(target, CallbackQuery):
        try:
            await target.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
        except Exception:
            await target.message.answer(text, reply_markup=kb, parse_mode="HTML")
    else:
        await target.answer(text, reply_markup=kb, parse_mode="HTML")


# ── /start ────────────────────────────────────────────────────────────────────


@router.message(CommandStart())
async def cmd_start(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await _show_main_menu(message, user, db)


# ── support:create ────────────────────────────────────────────────────────────


@router.callback_query(F.data == "support:create")
async def cb_create(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await state.set_state(SupportStates.writing_message)
    await callback.answer()
    try:
        await callback.message.edit_text(
            texts.describe_problem,
            reply_markup=_cancel_kb(),
            parse_mode="HTML",
        )
    except Exception:
        await callback.message.answer(
            texts.describe_problem,
            reply_markup=_cancel_kb(),
            parse_mode="HTML",
        )


# ── support:cancel ────────────────────────────────────────────────────────────


@router.callback_query(F.data == "support:cancel")
async def cb_cancel(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await callback.answer()
    await _show_main_menu(callback, user, db)


# ── support:back ─────────────────────────────────────────────────────────────


@router.callback_query(F.data == "support:back")
async def cb_back(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await callback.answer()
    await _show_main_menu(callback, user, db)


# ── writing_message state — первое сообщение ─────────────────────────────────


@router.message(SupportStates.writing_message, F.text | F.photo | F.document)
async def on_first_message(message: Message, user: User, db: AsyncSession, state: FSMContext):
    text, attachments = _extract_content(message)
    if not text and not attachments:
        return

    subject = (text[:50] + "...") if text and len(text) > 50 else (text or "Обращение")

    svc = SupportService(db)
    ticket = await svc.create_ticket(
        user_id=user.id,
        subject=subject,
        message_text=text or "(вложение)",
        order_id=None,
        attachments=attachments,
        source="bot",
    )

    short_id = str(ticket.id)[:8]
    ticket_id_str = str(ticket.id)

    await state.update_data(ticket_id=ticket_id_str)
    await state.set_state(SupportStates.in_chat)

    await message.answer(
        texts.ticket_created(short_id),
        reply_markup=_created_kb(ticket_id_str),
        parse_mode="HTML",
    )


# ── support:continue ──────────────────────────────────────────────────────────


@router.callback_query(F.data == "support:continue")
async def cb_continue(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await callback.answer()

    svc = SupportService(db)
    active = await svc.get_open_ticket_for_user(user.id)

    if not active:
        await _show_main_menu(callback, user, db)
        return

    ticket = await svc.get_ticket_with_messages(active.id)
    short_id = str(active.id)[:8]
    ticket_id_str = str(active.id)

    if ticket and ticket.messages:
        preview = _format_messages_preview(ticket.messages)
        text = texts.ticket_preview(short_id, _status_label(active.status), preview)
    else:
        text = texts.ticket_preview_empty(short_id, _status_label(active.status))

    await state.update_data(ticket_id=ticket_id_str)
    await state.set_state(SupportStates.in_chat)

    try:
        await callback.message.edit_text(
            text,
            reply_markup=_created_kb(ticket_id_str),
            parse_mode="HTML",
        )
    except Exception:
        await callback.message.answer(
            text,
            reply_markup=_created_kb(ticket_id_str),
            parse_mode="HTML",
        )


# ── support:enter:{ticket_id} — вход в чат из просмотра тикета ───────────────


@router.callback_query(F.data.startswith("support:enter:"))
async def cb_enter_ticket(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    ticket_id_str = callback.data.removeprefix("support:enter:")
    await callback.answer()

    try:
        ticket_id = uuid.UUID(ticket_id_str)
    except ValueError:
        await callback.message.answer(texts.ticket_not_found, parse_mode="HTML")
        return

    svc = SupportService(db)
    ticket = await svc.get_ticket_with_messages(ticket_id, user_id=user.id)

    if not ticket:
        await callback.message.answer(texts.ticket_not_found, parse_mode="HTML")
        return

    short_id = str(ticket.id)[:8]

    if ticket.messages:
        preview = _format_messages_preview(ticket.messages)
        text = texts.ticket_preview(short_id, _status_label(ticket.status), preview)
    else:
        text = texts.ticket_preview_empty(short_id, _status_label(ticket.status))

    await state.update_data(ticket_id=ticket_id_str)
    await state.set_state(SupportStates.in_chat)

    try:
        await callback.message.edit_text(
            text,
            reply_markup=_created_kb(ticket_id_str),
            parse_mode="HTML",
        )
    except Exception:
        await callback.message.answer(
            text,
            reply_markup=_created_kb(ticket_id_str),
            parse_mode="HTML",
        )


# ── support:tickets — список обращений ───────────────────────────────────────


@router.callback_query(F.data == "support:tickets")
async def cb_tickets(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await callback.answer()

    svc = SupportService(db)
    tickets = await svc.list_user_tickets(user.id, limit=10)

    if not tickets:
        try:
            await callback.message.edit_text(
                texts.no_tickets,
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="⬅️ Назад", callback_data="support:back")],
                ]),
                parse_mode="HTML",
            )
        except Exception:
            await callback.message.answer(texts.no_tickets, parse_mode="HTML")
        return

    await state.set_state(SupportStates.choosing_ticket)

    try:
        await callback.message.edit_text(
            texts.my_tickets_header,
            reply_markup=_tickets_list_kb(tickets),
            parse_mode="HTML",
        )
    except Exception:
        await callback.message.answer(
            texts.my_tickets_header,
            reply_markup=_tickets_list_kb(tickets),
            parse_mode="HTML",
        )


# ── support:ticket:{id} — просмотр тикета ────────────────────────────────────


@router.callback_query(F.data.startswith("support:ticket:"))
async def cb_ticket_detail(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    ticket_id_str = callback.data.removeprefix("support:ticket:")
    await callback.answer()

    try:
        ticket_id = uuid.UUID(ticket_id_str)
    except ValueError:
        await callback.message.answer(texts.ticket_not_found, parse_mode="HTML")
        return

    svc = SupportService(db)
    ticket = await svc.get_ticket_with_messages(ticket_id, user_id=user.id)

    if not ticket:
        await callback.message.answer(texts.ticket_not_found, parse_mode="HTML")
        return

    short_id = str(ticket.id)[:8]
    active = _is_active(ticket.status)

    if ticket.messages:
        preview = _format_messages_preview(ticket.messages)
        text = texts.ticket_preview(short_id, _status_label(ticket.status), preview)
    else:
        text = texts.ticket_preview_empty(short_id, _status_label(ticket.status))

    try:
        await callback.message.edit_text(
            text,
            reply_markup=_ticket_detail_kb(ticket_id_str, is_active=active),
            parse_mode="HTML",
        )
    except Exception:
        await callback.message.answer(
            text,
            reply_markup=_ticket_detail_kb(ticket_id_str, is_active=active),
            parse_mode="HTML",
        )


# ── support:close:{id} — закрыть тикет ───────────────────────────────────────


@router.callback_query(F.data.startswith("support:close:"))
async def cb_close_ticket(callback: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    ticket_id_str = callback.data.removeprefix("support:close:")
    await callback.answer()

    try:
        ticket_id = uuid.UUID(ticket_id_str)
    except ValueError:
        await callback.message.answer(texts.ticket_not_found, parse_mode="HTML")
        return

    svc = SupportService(db)
    ticket = await svc.get_ticket(ticket_id, user_id=user.id)

    short_id = str(ticket_id)[:8]

    if ticket and _is_active(ticket.status):
        await svc.change_status(ticket_id, TicketStatus.closed)

    await state.clear()

    try:
        await callback.message.edit_text(
            texts.ticket_closed(short_id),
            reply_markup=None,
            parse_mode="HTML",
        )
    except Exception:
        await callback.message.answer(
            texts.ticket_closed(short_id),
            parse_mode="HTML",
        )

    # Отправить главное меню новым сообщением (не редактировать "закрыто")
    await asyncio.sleep(0.5)
    svc2 = SupportService(db)
    active = await svc2.get_open_ticket_for_user(user.id)
    if active:
        ticket2 = await svc2.get_ticket_with_messages(active.id)
        short_id2 = str(active.id)[:8]
        preview2 = _format_messages_preview(ticket2.messages) if (ticket2 and ticket2.messages) else ""
        menu_text = texts.welcome_active(short_id2, preview2) if preview2 else texts.welcome
    else:
        menu_text = texts.welcome
    await callback.message.answer(menu_text, reply_markup=_main_menu_kb(has_active=bool(active)), parse_mode="HTML")


# ── Fallback ──────────────────────────────────────────────────────────────────


@router.message()
async def on_unknown(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await _show_main_menu(message, user, db)
