"""
support_bot/handlers/start.py
─────────────────────────────────────────────────────────────────────────────
/start, выбор категории, выбор заказа, создание тикета.
─────────────────────────────────────────────────────────────────────────────
"""

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
from api.services.support_service import SupportService
from support_bot.utils.texts import texts

router = Router(name="support:start")


class SupportFSM(StatesGroup):
    choosing_category = State()
    choosing_order = State()
    writing_message = State()


# ── /start ───────────────────────────────────────────────────────────────────


@router.message(CommandStart())
async def cmd_start(message: Message, user: User, db: AsyncSession, state: FSMContext):
    await state.clear()

    svc = SupportService(db)
    open_ticket = await svc.get_open_ticket_for_user(user.id)

    if open_ticket:
        await message.answer(
            texts.welcome_has_ticket,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text="Написать в текущее обращение",
                    callback_data="support:continue",
                )],
            ]),
        )
        return

    await message.answer(
        texts.welcome,
        reply_markup=_category_keyboard(),
    )
    await state.set_state(SupportFSM.choosing_category)


def _category_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Проблема с заказом", callback_data="cat:order")],
        [InlineKeyboardButton(text="Вопрос по оплате", callback_data="cat:payment")],
        [InlineKeyboardButton(text="Другое", callback_data="cat:other")],
    ])


# ── Category selection ───────────────────────────────────────────────────────


@router.callback_query(SupportFSM.choosing_category, F.data == "cat:order")
async def cb_cat_order(call: CallbackQuery, user: User, db: AsyncSession, state: FSMContext):
    svc = SupportService(db)
    orders = await svc.get_user_recent_orders(user.id, limit=5)

    if not orders:
        await call.message.edit_text(texts.no_orders)
        await state.update_data(subject="Проблема с заказом", order_id=None)
        await state.set_state(SupportFSM.writing_message)
        await call.answer()
        return

    buttons = []
    for order in orders:
        label = f"#{order.order_number}"
        if order.created_at:
            label += f" — {order.created_at.strftime('%d.%m')}"
        buttons.append([
            InlineKeyboardButton(
                text=label,
                callback_data=f"order:{order.id}",
            )
        ])
    buttons.append([
        InlineKeyboardButton(text="Без привязки к заказу", callback_data="order:none"),
    ])

    await call.message.edit_text(
        texts.choose_order,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
    await state.update_data(subject="Проблема с заказом")
    await state.set_state(SupportFSM.choosing_order)
    await call.answer()


@router.callback_query(SupportFSM.choosing_category, F.data == "cat:payment")
async def cb_cat_payment(call: CallbackQuery, state: FSMContext):
    await state.update_data(subject="Вопрос по оплате", order_id=None)
    await call.message.edit_text(texts.describe_problem)
    await state.set_state(SupportFSM.writing_message)
    await call.answer()


@router.callback_query(SupportFSM.choosing_category, F.data == "cat:other")
async def cb_cat_other(call: CallbackQuery, state: FSMContext):
    await state.update_data(subject="Другое", order_id=None)
    await call.message.edit_text(texts.describe_problem)
    await state.set_state(SupportFSM.writing_message)
    await call.answer()


# ── Order selection ──────────────────────────────────────────────────────────


@router.callback_query(SupportFSM.choosing_order, F.data.startswith("order:"))
async def cb_select_order(call: CallbackQuery, state: FSMContext):
    order_part = call.data.split(":", 1)[1]
    order_id = None if order_part == "none" else order_part

    await state.update_data(order_id=order_id)
    await call.message.edit_text(texts.describe_problem)
    await state.set_state(SupportFSM.writing_message)
    await call.answer()


# ── Writing message → create ticket ─────────────────────────────────────────


@router.message(SupportFSM.writing_message, F.text | F.photo | F.document)
async def on_first_message(message: Message, user: User, db: AsyncSession, state: FSMContext):
    data = await state.get_data()
    subject = data.get("subject", "Обращение")
    order_id_str = data.get("order_id")

    text, attachments = await _extract_content(message)
    if not text and not attachments:
        return

    import uuid
    order_id = uuid.UUID(order_id_str) if order_id_str else None

    svc = SupportService(db)
    await svc.create_ticket(
        user_id=user.id,
        subject=subject,
        message_text=text or "(вложение)",
        order_id=order_id,
        attachments=attachments,
        source="bot",
    )

    await state.clear()
    await message.answer(texts.ticket_created)


# ── Continue writing to existing ticket callback ─────────────────────────────


@router.callback_query(F.data == "support:continue")
async def cb_continue(call: CallbackQuery, state: FSMContext):
    await state.clear()
    await call.message.edit_text(
        "Просто напишите ваше сообщение — оно будет добавлено в текущее обращение."
    )
    await call.answer()


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _extract_content(message: Message) -> tuple[str | None, list[str]]:
    """Извлекает текст и вложения из сообщения."""
    text = message.text or message.caption
    attachments: list[str] = []

    if message.photo:
        # Берём самое большое фото
        photo = message.photo[-1]
        attachments.append(f"tg://photo/{photo.file_id}")

    if message.document:
        attachments.append(f"tg://doc/{message.document.file_id}")

    return text, attachments
