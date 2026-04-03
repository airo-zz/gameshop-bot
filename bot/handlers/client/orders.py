"""
bot/handlers/client/orders.py
─────────────────────────────────────────────────────────────────────────────
История заказов пользователя.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Order, OrderStatus, User
from bot.utils.texts import texts

router = Router(name="client:orders")

STATUS_EMOJI = {
    OrderStatus.new: "🆕",
    OrderStatus.pending_payment: "⏳",
    OrderStatus.paid: "💚",
    OrderStatus.processing: "⚙️",
    OrderStatus.clarification: "❓",
    OrderStatus.completed: "✅",
    OrderStatus.cancelled: "❌",
    OrderStatus.dispute: "⚠️",
}

PAGE_SIZE = 10


async def _render_orders(
    orders: list[Order],
) -> tuple[str, InlineKeyboardMarkup]:
    if not orders:
        return texts.orders_empty, InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main")]
            ]
        )

    lines = [texts.orders_list_header(len(orders))]
    buttons = []
    for order in orders:
        emoji = STATUS_EMOJI.get(order.status, "📋")
        lines.append(
            f"{emoji} <b>{order.order_number}</b> — {order.total_amount:.0f} ₽"
        )
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"{emoji} {order.order_number} — {order.total_amount:.0f} ₽",
                    callback_data=f"order:detail:{order.id}",
                )
            ]
        )

    buttons.append(
        [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main")]
    )
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("orders"))
@router.message(F.text == "📋 Мои заказы")
async def cmd_orders(message: Message, user: User, db: AsyncSession) -> None:
    result = await db.execute(
        select(Order)
        .where(Order.user_id == user.id)
        .order_by(desc(Order.created_at))
        .limit(PAGE_SIZE)
    )
    orders = list(result.scalars().all())
    text, keyboard = await _render_orders(orders)
    await message.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.callback_query(F.data == "orders:list")
async def cb_orders_list(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    result = await db.execute(
        select(Order)
        .where(Order.user_id == user.id)
        .order_by(desc(Order.created_at))
        .limit(PAGE_SIZE)
    )
    orders = list(result.scalars().all())
    text, keyboard = await _render_orders(orders)
    await call.message.edit_text(text, reply_markup=keyboard, parse_mode="HTML")
    await call.answer()
