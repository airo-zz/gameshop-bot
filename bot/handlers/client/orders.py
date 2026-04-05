"""
bot/handlers/client/orders.py
─────────────────────────────────────────────────────────────────────────────
История заказов пользователя.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid as _uuid

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Order, OrderItem, OrderStatus, User
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, nav_edit

router = Router(name="client:orders")

STATUS_EMOJI = {
    OrderStatus.new: "⏳",
    OrderStatus.pending_payment: "⏳",
    OrderStatus.paid: "💚",
    OrderStatus.processing: "💚",
    OrderStatus.clarification: "💚",
    OrderStatus.completed: "✅",
    OrderStatus.cancelled: "↩️",
    OrderStatus.dispute: "↩️",
}

STATUS_LABEL = {
    OrderStatus.new: "Ожидает оплаты",
    OrderStatus.pending_payment: "Ожидает оплаты",
    OrderStatus.paid: "Оплачен",
    OrderStatus.processing: "Оплачен",
    OrderStatus.clarification: "Оплачен",
    OrderStatus.completed: "Завершён",
    OrderStatus.cancelled: "Возврат",
    OrderStatus.dispute: "Возврат",
}

PAGE_SIZE = 10


async def _render_orders(
    orders: list[Order],
) -> tuple[str, InlineKeyboardMarkup]:
    if not orders:
        return texts.orders_empty, InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
                    InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
                ]
            ]
        )

    lines = [texts.orders_list_header(len(orders))]
    buttons = []
    for order in orders:
        emoji = STATUS_EMOJI.get(order.status, "📋")
        label = STATUS_LABEL.get(order.status, order.status.value)
        lines.append(
            f"{emoji} <b>{order.order_number}</b> — {order.total_amount:.0f} ₽ · {label}"
        )
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"{emoji} {order.order_number} — {order.total_amount:.0f} ₽ · {label}",
                    callback_data=f"order:detail:{order.id}",
                )
            ]
        )

    buttons.append(
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary")]
    )
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("orders"))
@router.message(F.text == "📋 Мои заказы")
async def cmd_orders(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    result = await db.execute(
        select(Order)
        .where(Order.user_id == user.id)
        .order_by(desc(Order.created_at))
        .limit(PAGE_SIZE)
    )
    orders = list(result.scalars().all())
    text, keyboard = await _render_orders(orders)
    await nav_edit(message, state, text, reply_markup=keyboard)


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
    await safe_edit(call.message, text, reply_markup=keyboard)
    await call.answer()


@router.callback_query(F.data.startswith("order:detail:"))
async def cb_order_detail(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    order_id_str = call.data.split(":")[2]
    try:
        order_uuid = _uuid.UUID(order_id_str)
    except (ValueError, IndexError):
        await call.answer("Некорректный ID заказа", show_alert=True)
        return

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_uuid, Order.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    emoji = STATUS_EMOJI.get(order.status, "📋")
    label = STATUS_LABEL.get(order.status, order.status.value)
    items_text = "\n".join(
        f"  • {item.product_name}"
        + (f" ({item.lot_name})" if item.lot_name else "")
        + f" × {item.quantity} — {float(item.total_price):.0f} ₽"
        for item in order.items
    )

    text = (
        f"{emoji} <b>Заказ {order.order_number}</b>\n\n"
        f"Статус: <b>{emoji} {label}</b>\n"
        f"Дата: {order.created_at.strftime('%d.%m.%Y %H:%M')}\n\n"
        f"<b>Состав:</b>\n{items_text}\n\n"
        f"<b>Итого: {float(order.total_amount):.0f} ₽</b>"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="◀️ К заказам", callback_data="orders:list"),
                InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
            ]
        ]
    )
    await safe_edit(call.message, text, reply_markup=keyboard)
    await call.answer()
