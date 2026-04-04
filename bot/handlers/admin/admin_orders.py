"""
bot/handlers/admin/admin_orders.py
─────────────────────────────────────────────────────────────────────────────
Управление заказами в admin-боте:
  - Список заказов с фильтрами по статусу
  - Детальный просмотр заказа
  - Смена статуса
  - Ручная выдача товара
  - Поиск по номеру
─────────────────────────────────────────────────────────────────────────────
"""

import uuid as _uuid

from aiogram import Bot, Router, F
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    Message, CallbackQuery,
    InlineKeyboardMarkup, InlineKeyboardButton,
)
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Order, OrderItem, OrderStatus, User, AdminUser
from shared.models.order import ALLOWED_STATUS_TRANSITIONS
from bot.middlewares.admin_auth import require_permission
from bot.utils.admin_log import log_admin_action

router = Router(name="admin:orders")

PAGE_SIZE = 10


class OrderSearchFSM(StatesGroup):
    waiting_query = State()


class ManualDeliveryFSM(StatesGroup):
    waiting_data = State()


STATUS_NAMES = {
    OrderStatus.new: "🆕 Новый",
    OrderStatus.pending_payment: "⏳ Ожидает оплаты",
    OrderStatus.paid: "💚 Оплачен",
    OrderStatus.processing: "⚙️ В обработке",
    OrderStatus.clarification: "❓ Уточнение",
    OrderStatus.completed: "✅ Выполнен",
    OrderStatus.cancelled: "❌ Отменён",
    OrderStatus.dispute: "⚠️ Спор",
}


# ── Orders List ───────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:orders:list")
@require_permission("orders.view")
async def admin_orders_list(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    await _show_orders_by_status(call, db, status_filter=None, page=0)
    await call.answer()


@router.callback_query(F.data.startswith("admin:orders:filter:"))
@require_permission("orders.view")
async def admin_orders_filter(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    parts = call.data.split(":")
    status_str = parts[3] if len(parts) > 3 else None
    page = int(parts[4]) if len(parts) > 4 else 0
    status = OrderStatus(status_str) if status_str and status_str != "all" else None
    await _show_orders_by_status(call, db, status_filter=status, page=page)
    await call.answer()


async def _show_orders_by_status(
    call: CallbackQuery,
    db: AsyncSession,
    status_filter: OrderStatus | None,
    page: int = 0,
) -> None:
    query = select(Order).order_by(desc(Order.created_at))
    if status_filter:
        query = query.where(Order.status == status_filter)

    query = query.offset(page * PAGE_SIZE).limit(PAGE_SIZE + 1)
    result = await db.execute(query)
    orders = result.scalars().all()

    has_next = len(orders) > PAGE_SIZE
    orders = orders[:PAGE_SIZE]

    # Фильтр-кнопки по статусам
    filter_buttons = [
        [
            InlineKeyboardButton(
                text="🔘 Все" if status_filter is None else "Все",
                callback_data="admin:orders:filter:all",
            ),
            InlineKeyboardButton(
                text="⏳ Ожидают",
                callback_data="admin:orders:filter:pending_payment",
            ),
            InlineKeyboardButton(
                text="⚙️ В работе",
                callback_data="admin:orders:filter:processing",
            ),
        ],
        [
            InlineKeyboardButton(
                text="❓ Уточнение",
                callback_data="admin:orders:filter:clarification",
            ),
            InlineKeyboardButton(
                text="⚠️ Споры",
                callback_data="admin:orders:filter:dispute",
            ),
        ],
    ]

    order_buttons = []
    for order in orders:
        status_emoji = STATUS_NAMES.get(order.status, "📋").split()[0]
        order_buttons.append([InlineKeyboardButton(
            text=f"{status_emoji} {order.order_number} — {order.total_amount:.0f}₽",
            callback_data=f"admin:order:{order.id}",
        )])

    nav_buttons = []
    if page > 0:
        nav_buttons.append(InlineKeyboardButton(
            text="◀️", callback_data=f"admin:orders:filter:{'all' if not status_filter else status_filter.value}:{page-1}"
        ))
    if has_next:
        nav_buttons.append(InlineKeyboardButton(
            text="▶️", callback_data=f"admin:orders:filter:{'all' if not status_filter else status_filter.value}:{page+1}"
        ))

    all_buttons = filter_buttons + order_buttons
    if nav_buttons:
        all_buttons.append(nav_buttons)
    all_buttons.append([InlineKeyboardButton(
        text="🔍 Поиск", callback_data="admin:orders:search"
    )])
    all_buttons.append([InlineKeyboardButton(
        text="◀️ Меню", callback_data="admin:main"
    )])

    status_label = STATUS_NAMES.get(status_filter, "Все") if status_filter else "Все"
    text = (
        f"📋 <b>Заказы</b> — {status_label}\n"
        f"Страница {page + 1}"
    )

    await call.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=all_buttons),
    )


# ── Order Detail ──────────────────────────────────────────────────────────────

@router.callback_query(
    F.data.startswith("admin:order:")
    & ~F.data.startswith("admin:order:status:")
    & ~F.data.startswith("admin:order:deliver:")
    & ~F.data.startswith("admin:order:note:")
)
@require_permission("orders.view")
async def admin_order_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    order_id = call.data.split(":")[2]
    try:
        order_uuid = _uuid.UUID(order_id)
    except (ValueError, AttributeError):
        await call.answer("Некорректный ID заказа", show_alert=True)
        return
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.user),
        )
        .where(Order.id == order_uuid)
    )
    order = result.scalar_one_or_none()

    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    user: User = order.user
    items_text = "\n".join(
        f"  • {item.product_name} x{item.quantity} — {item.total_price:.0f}₽"
        for item in order.items
    )

    text = (
        f"📋 <b>Заказ {order.order_number}</b>\n\n"
        f"👤 Клиент: {user.display_name} (tg: {user.telegram_id})\n"
        f"📅 Создан: {order.created_at.strftime('%d.%m.%Y %H:%M')}\n"
        f"Статус: <b>{STATUS_NAMES.get(order.status, order.status)}</b>\n\n"
        f"<b>Состав:</b>\n{items_text}\n\n"
        f"💰 Итого: <b>{order.total_amount:.2f}₽</b>\n"
        f"{'💸 Скидка: ' + str(order.discount_amount) + '₽' if order.discount_amount else ''}"
    )

    # Кнопки смены статуса
    allowed_transitions = ALLOWED_STATUS_TRANSITIONS.get(order.status, set())
    status_buttons = []
    for new_status in allowed_transitions:
        status_buttons.append(InlineKeyboardButton(
            text=STATUS_NAMES.get(new_status, new_status.value),
            callback_data=f"admin:order:status:{order.id}:{new_status.value}",
        ))

    buttons = []
    if status_buttons:
        # По 2 в ряд
        for i in range(0, len(status_buttons), 2):
            buttons.append(status_buttons[i:i+2])

    # Ручная выдача (если в обработке)
    if order.status in (OrderStatus.paid, OrderStatus.processing):
        buttons.append([InlineKeyboardButton(
            text="📦 Выдать товар вручную",
            callback_data=f"admin:order:deliver:{order.id}",
        )])

    buttons.append([InlineKeyboardButton(
        text="📝 Добавить заметку", callback_data=f"admin:order:note:{order.id}"
    )])
    buttons.append([InlineKeyboardButton(text="◀️ К заказам", callback_data="admin:orders:list")])

    await call.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
    from aiogram.exceptions import TelegramBadRequest
    try:
        await call.answer()
    except TelegramBadRequest:
        pass  # уже отвечено вызывающим хендлером


# ── Change Status ─────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:order:status:"))
@require_permission("orders.update_status")
async def admin_order_change_status(
    call: CallbackQuery, bot: Bot, db: AsyncSession, admin: AdminUser
) -> None:
    parts = call.data.split(":")
    order_id, new_status_str = parts[3], parts[4]

    try:
        order_uuid = _uuid.UUID(order_id)
    except (ValueError, AttributeError):
        await call.answer("Некорректный ID заказа", show_alert=True)
        return

    result = await db.execute(
        select(Order).options(selectinload(Order.user)).where(Order.id == order_uuid)
    )
    order = result.scalar_one_or_none()
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    new_status = OrderStatus(new_status_str)
    if not order.can_transition_to(new_status):
        await call.answer(
            f"Нельзя перейти из {order.status.value} в {new_status.value}",
            show_alert=True,
        )
        return

    from shared.models import OrderStatusHistory
    from datetime import datetime, timezone

    old_status = order.status

    # Обновляем статус
    order.status = new_status
    now = datetime.now(timezone.utc)

    if new_status == OrderStatus.paid:
        order.paid_at = now
    elif new_status == OrderStatus.processing:
        order.processing_started_at = now
    elif new_status == OrderStatus.completed:
        order.completed_at = now
    elif new_status == OrderStatus.cancelled:
        order.cancelled_at = now

    # Пишем историю
    history = OrderStatusHistory(
        order_id=order.id,
        from_status=old_status,
        to_status=new_status,
        changed_by_id=admin.id,
        changed_by_type="admin",
    )
    db.add(history)

    await log_admin_action(
        db, admin, "order.status_change", "order", order.id,
        before_data={"status": old_status.value},
        after_data={"status": new_status.value},
    )

    await db.commit()

    # Уведомляем клиента
    try:
        from bot.utils.texts import texts
        await bot.send_message(
            order.user.telegram_id,
            texts.order_status_changed(order.order_number, new_status.value),
        )
    except Exception:
        pass  # Не критично если уведомление не дошло

    await call.answer(f"✅ Статус изменён на {STATUS_NAMES.get(new_status)}", show_alert=False)
    await admin_order_detail(call, db, admin)


# ── Manual Delivery ───────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:order:deliver:"))
@require_permission("orders.update_status")
async def admin_order_deliver(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    await call.answer(
        "📦 Ручная выдача: введи данные в поле заметки и смени статус на «Выполнен».",
        show_alert=True,
    )


# ── Order Note ────────────────────────────────────────────────────────────────

class OrderNoteFSM(StatesGroup):
    waiting_text = State()


@router.callback_query(F.data.startswith("admin:order:note:"))
@require_permission("orders.add_notes")
async def admin_order_note_start(
    call: CallbackQuery, state: FSMContext, admin: AdminUser
) -> None:
    order_id = call.data.split(":")[3]
    await state.update_data(order_id=order_id)
    await call.message.edit_text(
        "📝 <b>Добавить заметку к заказу</b>\n\nВведи текст заметки:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="❌ Отмена", callback_data=f"admin:order:{order_id}")
        ]]),
    )
    await state.set_state(OrderNoteFSM.waiting_text)
    await call.answer()


@router.message(StateFilter(OrderNoteFSM.waiting_text))
@require_permission("orders.add_notes")
async def admin_order_note_save(
    message: Message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    data = await state.get_data()
    await state.clear()

    try:
        order_uuid = _uuid.UUID(data["order_id"])
    except (KeyError, ValueError):
        await message.answer("❌ Ошибка: ID заказа не найден")
        return

    result = await db.execute(select(Order).where(Order.id == order_uuid))
    order = result.scalar_one_or_none()
    if not order:
        await message.answer("❌ Заказ не найден")
        return

    order.notes = (
        f"{order.notes}\n[{admin.first_name}]: {message.text.strip()}"
        if order.notes
        else f"[{admin.first_name}]: {message.text.strip()}"
    )

    await log_admin_action(
        db, admin, "order.add_note", "order", order.id,
        after_data={"note": message.text.strip()},
    )

    await message.answer(
        f"✅ Заметка добавлена к заказу {order.order_number}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="📋 К заказу", callback_data=f"admin:order:{order.id}")
        ]]),
    )


# ── Search Orders ─────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:orders:search")
async def admin_orders_search_start(
    call: CallbackQuery, state: FSMContext
) -> None:
    await call.message.edit_text(
        "🔍 <b>Поиск заказа</b>\n\n"
        "Введи <b>номер заказа</b> (#001234) или <b>Telegram ID</b> пользователя:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="◀️ Отмена", callback_data="admin:orders:list")
        ]]),
    )
    await state.set_state(OrderSearchFSM.waiting_query)
    await call.answer()


@router.message(StateFilter(OrderSearchFSM.waiting_query))
@require_permission("orders.view")
async def admin_orders_search_execute(
    message: Message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    query_str = message.text.strip()
    await state.clear()

    # Поиск по номеру
    if query_str.startswith("#"):
        result = await db.execute(
            select(Order).where(Order.order_number == query_str)
        )
        orders = result.scalars().all()
    else:
        # Поиск по Telegram ID
        try:
            tg_id = int(query_str)
            user_result = await db.execute(
                select(User).where(User.telegram_id == tg_id)
            )
            user = user_result.scalar_one_or_none()
            if user:
                result = await db.execute(
                    select(Order)
                    .where(Order.user_id == user.id)
                    .order_by(desc(Order.created_at))
                    .limit(10)
                )
                orders = result.scalars().all()
            else:
                orders = []
        except ValueError:
            orders = []

    if not orders:
        await message.answer(
            f"😔 Заказы по запросу <b>{query_str}</b> не найдены.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="🔍 Поиск снова", callback_data="admin:orders:search"),
                InlineKeyboardButton(text="◀️ К заказам", callback_data="admin:orders:list"),
            ]]),
        )
        return

    buttons = []
    for order in orders:
        status_emoji = STATUS_NAMES.get(order.status, "📋").split()[0]
        buttons.append([InlineKeyboardButton(
            text=f"{status_emoji} {order.order_number} — {order.total_amount:.0f}₽",
            callback_data=f"admin:order:{order.id}",
        )])
    buttons.append([InlineKeyboardButton(text="◀️ К заказам", callback_data="admin:orders:list")])

    await message.answer(
        f"🔍 Найдено: <b>{len(orders)}</b> заказ(ов)",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
