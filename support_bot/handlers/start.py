"""
support_bot/handlers/start.py
─────────────────────────────────────────────────────────────────────────────
/start, главное меню, создание тикета, список тикетов, вход в чат.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from shared.models.support import TicketStatus
from api.services.support_service import SupportService
from support_bot.utils.texts import (
    texts,
    BTN_CREATE,
    BTN_MY_TICKETS,
    BTN_CONTINUE,
    BTN_NEW,
    BTN_EXIT_CHAT,
    BTN_NO_ORDER,
    BTN_BACK,
)

router = Router(name="support:start")


# ── FSM States ────────────────────────────────────────────────────────────────


class SupportStates(StatesGroup):
    choosing_order = State()    # выбор заказа при создании
    writing_message = State()   # первое сообщение
    choosing_ticket = State()   # выбор тикета из списка
    in_chat = State()           # live chat — всё идёт в открытый тикет


# ── Keyboards ─────────────────────────────────────────────────────────────────


def _main_menu_keyboard(has_active: bool) -> ReplyKeyboardMarkup:
    if has_active:
        rows = [
            [KeyboardButton(text=BTN_CONTINUE)],
            [KeyboardButton(text=BTN_MY_TICKETS), KeyboardButton(text=BTN_NEW)],
        ]
    else:
        rows = [
            [KeyboardButton(text=BTN_CREATE)],
            [KeyboardButton(text=BTN_MY_TICKETS)],
        ]
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


def _order_keyboard(order_buttons: list[str]) -> ReplyKeyboardMarkup:
    rows = [[KeyboardButton(text=label)] for label in order_buttons]
    rows.append([KeyboardButton(text=BTN_NO_ORDER)])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True, one_time_keyboard=True)


def _tickets_keyboard(ticket_buttons: list[str]) -> ReplyKeyboardMarkup:
    rows = [[KeyboardButton(text=label)] for label in ticket_buttons]
    rows.append([KeyboardButton(text=BTN_BACK)])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True, one_time_keyboard=True)


def _chat_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=BTN_EXIT_CHAT)]],
        resize_keyboard=True,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _order_button_label(order) -> str:
    """Метка кнопки заказа: '#001 — Fortnite — 15 апр'."""
    label = f"{order.order_number}"
    if order.items:
        first_item = order.items[0]
        game_title = getattr(first_item, "product_title", None) or getattr(first_item, "title", None)
        if game_title:
            label += f" — {game_title[:20]}"
    if order.created_at:
        months = ["янв", "фев", "мар", "апр", "май", "июн",
                  "июл", "авг", "сен", "окт", "ноя", "дек"]
        label += f" — {order.created_at.day} {months[order.created_at.month - 1]}"
    return label


def _ticket_button_label(ticket) -> str:
    """Метка кнопки тикета: '#abcd1234 · открыт · 15 апр'."""
    short_id = str(ticket.id)[:8]
    status_map = {
        TicketStatus.open: "открыт",
        TicketStatus.in_progress: "в работе",
        TicketStatus.waiting_user: "ждёт ответа",
        TicketStatus.resolved: "решён",
        TicketStatus.closed: "закрыт",
    }
    status_label = status_map.get(ticket.status, ticket.status)
    label = f"#{short_id} · {status_label}"
    if ticket.created_at:
        months = ["янв", "фев", "мар", "апр", "май", "июн",
                  "июл", "авг", "сен", "окт", "ноя", "дек"]
        label += f" · {ticket.created_at.day} {months[ticket.created_at.month - 1]}"
    return label


def _format_messages_preview(messages) -> str:
    """Последние 3 сообщения для контекста при входе в тикет."""
    lines = []
    for msg in messages[-3:]:
        who = "Вы" if msg.sender_type == "user" else "Оператор"
        text = (msg.text or "(вложение)")[:120]
        lines.append(f"<b>{who}:</b> {text}")
    return "\n\n".join(lines)


async def _show_main_menu(message: Message, user: User, db: AsyncSession) -> None:
    """Показать главное меню с учётом активного тикета."""
    svc = SupportService(db)
    active = await svc.get_open_ticket_for_user(user.id)

    if active:
        short_id = str(active.id)[:8]
        text = texts.welcome_active(short_id)
    else:
        text = texts.welcome

    await message.answer(
        text,
        reply_markup=_main_menu_keyboard(has_active=bool(active)),
        parse_mode="HTML",
    )


# ── /start ────────────────────────────────────────────────────────────────────


@router.message(CommandStart())
async def cmd_start(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await _show_main_menu(message, user, db)


# ── "Создать обращение" / "Новое обращение" ───────────────────────────────────


@router.message(F.text == BTN_CREATE)
@router.message(F.text == BTN_NEW)
async def on_create_ticket(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()

    svc = SupportService(db)
    orders = await svc.get_user_recent_orders(user.id, limit=5)

    if not orders:
        await message.answer(
            texts.no_orders,
            reply_markup=ReplyKeyboardMarkup(
                keyboard=[[KeyboardButton(text=BTN_NO_ORDER)]],
                resize_keyboard=True,
                one_time_keyboard=True,
            ),
            parse_mode="HTML",
        )
        await state.set_state(SupportStates.choosing_order)
        await state.update_data(order_map={})
        return

    order_map = {_order_button_label(o): str(o.id) for o in orders}
    await state.update_data(order_map=order_map)

    await message.answer(
        texts.choose_order,
        reply_markup=_order_keyboard(list(order_map.keys())),
        parse_mode="HTML",
    )
    await state.set_state(SupportStates.choosing_order)


# ── choosing_order state ──────────────────────────────────────────────────────


@router.message(SupportStates.choosing_order, F.text == BTN_NO_ORDER)
async def on_no_order(message: Message, state: FSMContext):
    await state.update_data(order_id=None)
    await message.answer(
        texts.describe_problem,
        reply_markup=ReplyKeyboardRemove(),
        parse_mode="HTML",
    )
    await state.set_state(SupportStates.writing_message)


@router.message(SupportStates.choosing_order, F.text)
async def on_order_selected(message: Message, state: FSMContext):
    data = await state.get_data()
    order_map: dict[str, str] = data.get("order_map", {})
    order_id_str = order_map.get(message.text)

    if order_id_str is None:
        # Нераспознанная кнопка — просим выбрать снова
        await message.answer(texts.unknown_command, parse_mode="HTML")
        return

    await state.update_data(order_id=order_id_str)
    await message.answer(
        texts.describe_problem,
        reply_markup=ReplyKeyboardRemove(),
        parse_mode="HTML",
    )
    await state.set_state(SupportStates.writing_message)


# ── writing_message state ─────────────────────────────────────────────────────


@router.message(SupportStates.writing_message, F.text | F.photo | F.document)
async def on_first_message(message: Message, user: User, db: AsyncSession, state: FSMContext):
    text, attachments = _extract_content(message)
    if not text and not attachments:
        return

    data = await state.get_data()
    order_id_str = data.get("order_id")
    order_id = uuid.UUID(order_id_str) if order_id_str else None

    subject = (text[:50] + "...") if text and len(text) > 50 else (text or "Обращение")

    svc = SupportService(db)
    ticket = await svc.create_ticket(
        user_id=user.id,
        subject=subject,
        message_text=text or "(вложение)",
        order_id=order_id,
        attachments=attachments,
        source="bot",
    )

    await state.update_data(ticket_id=str(ticket.id))
    await state.set_state(SupportStates.in_chat)

    await message.answer(
        texts.ticket_created,
        reply_markup=_chat_keyboard(),
        parse_mode="HTML",
    )


# ── "Мои обращения" ───────────────────────────────────────────────────────────


@router.message(F.text == BTN_MY_TICKETS)
async def on_my_tickets(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()

    svc = SupportService(db)
    tickets = await svc.list_user_tickets(user.id, limit=5)

    if not tickets:
        await message.answer(
            texts.no_tickets,
            reply_markup=_main_menu_keyboard(has_active=False),
            parse_mode="HTML",
        )
        return

    ticket_map = {_ticket_button_label(tk): str(tk.id) for tk in tickets}
    await state.update_data(ticket_map=ticket_map)

    await message.answer(
        texts.my_tickets_header,
        reply_markup=_tickets_keyboard(list(ticket_map.keys())),
        parse_mode="HTML",
    )
    await state.set_state(SupportStates.choosing_ticket)


# ── choosing_ticket state ─────────────────────────────────────────────────────


@router.message(SupportStates.choosing_ticket, F.text == BTN_BACK)
async def on_tickets_back(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()
    await _show_main_menu(message, user, db)


@router.message(SupportStates.choosing_ticket, F.text)
async def on_ticket_selected(message: Message, user: User, db: AsyncSession, state: FSMContext):
    data = await state.get_data()
    ticket_map: dict[str, str] = data.get("ticket_map", {})
    ticket_id_str = ticket_map.get(message.text)

    if not ticket_id_str:
        await message.answer(texts.unknown_command, parse_mode="HTML")
        return

    ticket_id = uuid.UUID(ticket_id_str)
    svc = SupportService(db)
    ticket = await svc.get_ticket_with_messages(ticket_id, user_id=user.id)

    if not ticket:
        await message.answer(texts.ticket_not_found, parse_mode="HTML")
        return

    short_id = str(ticket.id)[:8]

    if ticket.messages:
        preview = _format_messages_preview(ticket.messages)
        context_text = texts.ticket_context(short_id, preview)
    else:
        context_text = texts.ticket_context_empty(short_id)

    await state.update_data(ticket_id=ticket_id_str)
    await state.set_state(SupportStates.in_chat)

    await message.answer(
        context_text,
        reply_markup=_chat_keyboard(),
        parse_mode="HTML",
    )


# ── "Продолжить обращение" ────────────────────────────────────────────────────


@router.message(F.text == BTN_CONTINUE)
async def on_continue_ticket(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()

    svc = SupportService(db)
    active = await svc.get_open_ticket_for_user(user.id)

    if not active:
        # Активный тикет исчез — показываем главное меню
        await message.answer(texts.welcome, reply_markup=_main_menu_keyboard(has_active=False), parse_mode="HTML")
        return

    ticket = await svc.get_ticket_with_messages(active.id)
    short_id = str(active.id)[:8]

    if ticket and ticket.messages:
        preview = _format_messages_preview(ticket.messages)
        context_text = texts.ticket_context(short_id, preview)
    else:
        context_text = texts.ticket_context_empty(short_id)

    await state.update_data(ticket_id=str(active.id))
    await state.set_state(SupportStates.in_chat)

    await message.answer(
        context_text,
        reply_markup=_chat_keyboard(),
        parse_mode="HTML",
    )


# ── Helper: извлечение контента из сообщения ──────────────────────────────────


def _extract_content(message: Message) -> tuple[str | None, list[str]]:
    text = message.text or message.caption
    attachments: list[str] = []

    if message.photo:
        photo = message.photo[-1]
        attachments.append(f"tg://photo/{photo.file_id}")

    if message.document:
        attachments.append(f"tg://doc/{message.document.file_id}")

    return text, attachments


# ── Fallback — неизвестное состояние или нераспознанная команда ───────────────


@router.message()
async def on_unknown(message: Message, user: User, db: AsyncSession, state: FSMContext):
    """Сбрасывает любое устаревшее FSM-состояние и возвращает в главное меню."""
    await state.clear()
    await _show_main_menu(message, user, db)
