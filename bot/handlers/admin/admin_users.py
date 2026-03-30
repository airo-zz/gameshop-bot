"""
bot/handlers/admin/admin_users.py
─────────────────────────────────────────────────────────────────────────────
Управление пользователями в admin-боте:
  - Поиск по Telegram ID / username
  - Просмотр профиля: баланс, заказы, уровень лояльности
  - Пополнение / списание баланса
  - Блокировка / разблокировка
  - Ручная смена уровня лояльности
  - Просмотр заказов конкретного пользователя
  - Просмотр текущей корзины
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery, Message,
    InlineKeyboardMarkup, InlineKeyboardButton,
)
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import (
    AdminUser, BalanceTransaction, LoyaltyLevel,
    Order, User, Cart,
)
from bot.middlewares.admin_auth import require_permission
from bot.utils.admin_log import log_admin_action

router = Router(name="admin:users")


class UserSearchFSM(StatesGroup):
    waiting_query = State()


class BalanceAdjustFSM(StatesGroup):
    waiting_amount = State()
    waiting_reason = State()


class BlockUserFSM(StatesGroup):
    waiting_reason = State()


class LoyaltyOverrideFSM(StatesGroup):
    waiting_level = State()


def back_btn(data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text="◀️ Назад", callback_data=data)


def _fmt_user(user: User) -> str:
    name = user.display_name
    return (
        f"👤 <b>Пользователь</b>\n\n"
        f"ID:        <code>{user.telegram_id}</code>\n"
        f"Имя:       {user.first_name}\n"
        f"Username:  {('@' + user.username) if user.username else '—'}\n"
        f"Баланс:    <b>{float(user.balance):,.2f} ₽</b>\n"
        f"Заказов:   {user.orders_count}\n"
        f"Потрачено: {float(user.total_spent):,.0f} ₽\n"
        f"Статус:    {'🚫 Заблокирован' if user.is_blocked else '✅ Активен'}\n"
        f"Регистрация: {user.created_at.strftime('%d.%m.%Y')}\n"
        f"Был онлайн: {user.last_active_at.strftime('%d.%m.%Y %H:%M') if user.last_active_at else '—'}"
    )


def _user_keyboard(user: User) -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(
                text="💰 Пополнить",
                callback_data=f"admin:user:balance:add:{user.id}",
            ),
            InlineKeyboardButton(
                text="💸 Списать",
                callback_data=f"admin:user:balance:sub:{user.id}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🏅 Уровень лояльности",
                callback_data=f"admin:user:loyalty:{user.id}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="📋 Заказы",
                callback_data=f"admin:user:orders:{user.id}",
            ),
            InlineKeyboardButton(
                text="🛒 Корзина",
                callback_data=f"admin:user:cart:{user.id}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="✅ Разблокировать" if user.is_blocked else "🚫 Заблокировать",
                callback_data=f"admin:user:{'unblock' if user.is_blocked else 'block'}:{user.id}",
            ),
        ],
        [back_btn("admin:users:list")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# ── Поиск ─────────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:users:list")
@require_permission("users.view")
async def admin_users_list(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    # Показываем последних 5 пользователей + кнопку поиска
    result = await db.execute(
        select(User).order_by(desc(User.created_at)).limit(5)
    )
    recent = result.scalars().all()

    text = "👥 <b>Пользователи</b>\n\nПоследние регистрации:\n"
    for u in recent:
        text += f"  • {u.display_name} — {u.created_at.strftime('%d.%m %H:%M')}\n"

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔍 Поиск пользователя", callback_data="admin:users:search")],
        [back_btn("admin:main")],
    ])
    await call.message.edit_text(text, reply_markup=keyboard)
    await call.answer()


@router.callback_query(F.data == "admin:users:search")
async def admin_users_search_start(call: CallbackQuery, state: FSMContext) -> None:
    await call.message.edit_text(
        "🔍 <b>Поиск пользователя</b>\n\n"
        "Введи <b>Telegram ID</b> или <b>@username</b>:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="❌ Отмена", callback_data="admin:users:list")
        ]]),
    )
    await state.set_state(UserSearchFSM.waiting_query)
    await call.answer()


@router.message(StateFilter(UserSearchFSM.waiting_query))
@require_permission("users.view")
async def admin_users_search_exec(
    message: Message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    query = message.text.strip().lstrip("@")
    await state.clear()

    # Поиск по Telegram ID или username
    try:
        tg_id = int(query)
        result = await db.execute(select(User).where(User.telegram_id == tg_id))
    except ValueError:
        result = await db.execute(select(User).where(User.username.ilike(query)))

    user = result.scalar_one_or_none()

    if not user:
        await message.answer(
            f"😔 Пользователь <b>{query}</b> не найден.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="🔍 Поиск снова", callback_data="admin:users:search"),
            ]]),
        )
        return

    # Загружаем уровень лояльности
    await db.refresh(user, ["loyalty_level"])
    await message.answer(_fmt_user(user), reply_markup=_user_keyboard(user))


# ── Просмотр пользователя ─────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:user:view:"))
@require_permission("users.view")
async def admin_user_view(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    user_id = call.data.split(":")[3]
    user = await db.get(User, user_id)
    if not user:
        await call.answer("Пользователь не найден", show_alert=True)
        return
    await db.refresh(user, ["loyalty_level"])
    await call.message.edit_text(_fmt_user(user), reply_markup=_user_keyboard(user))
    await call.answer()


# ── Баланс ────────────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:user:balance:"))
@require_permission("users.edit")
async def admin_balance_start(call: CallbackQuery, state: FSMContext) -> None:
    parts = call.data.split(":")
    action  = parts[4]   # "add" или "sub"
    user_id = parts[5]

    await state.update_data(user_id=user_id, action=action)
    await call.message.edit_text(
        f"💰 {'Пополнение' if action == 'add' else 'Списание'} баланса\n\n"
        f"Введи <b>сумму в рублях</b>:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="❌ Отмена", callback_data=f"admin:user:view:{user_id}")
        ]]),
    )
    await state.set_state(BalanceAdjustFSM.waiting_amount)
    await call.answer()


@router.message(StateFilter(BalanceAdjustFSM.waiting_amount))
async def admin_balance_amount(message: Message, state: FSMContext) -> None:
    try:
        amount = float(message.text.replace(",", ".").replace(" ", ""))
        if amount <= 0:
            raise ValueError
    except ValueError:
        await message.answer("❌ Введи корректную сумму (например: 100 или 500.50)")
        return

    await state.update_data(amount=amount)
    await message.answer(
        f"Сумма: <b>{amount:,.2f} ₽</b>\n\nПричина (необязательно):",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="⏭ Пропустить", callback_data="admin:balance:skip_reason")
        ]]),
    )
    await state.set_state(BalanceAdjustFSM.waiting_reason)


@router.callback_query(
    F.data == "admin:balance:skip_reason",
    StateFilter(BalanceAdjustFSM.waiting_reason),
)
async def admin_balance_skip_reason(
    call: CallbackQuery, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    await state.update_data(reason="")
    await call.answer()
    await _execute_balance_adjust(call.message, state, db, admin)


@router.message(StateFilter(BalanceAdjustFSM.waiting_reason))
async def admin_balance_reason(
    message: Message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    await state.update_data(reason=message.text.strip())
    await _execute_balance_adjust(message, state, db, admin)


async def _execute_balance_adjust(
    message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    data = await state.get_data()
    await state.clear()

    user = await db.get(User, data["user_id"])
    if not user:
        await message.answer("❌ Пользователь не найден")
        return

    amount = float(data["amount"])
    action = data["action"]
    reason = data.get("reason", "")
    sign   = 1 if action == "add" else -1
    delta  = sign * amount

    if action == "sub" and user.balance < amount:
        await message.answer(
            f"❌ Недостаточно средств. Баланс: {float(user.balance):,.2f} ₽"
        )
        return

    balance_before = user.balance
    user.balance   = user.balance + delta

    db.add(BalanceTransaction(
        user_id=user.id,
        amount=delta,
        balance_before=balance_before,
        balance_after=user.balance,
        type="manual_credit" if action == "add" else "manual_debit",
        description=reason or f"Ручная операция администратором {admin.first_name}",
    ))

    await log_admin_action(
        db, admin,
        f"balance.{'credit' if action == 'add' else 'debit'}",
        "user", user.id,
        before_data={"balance": float(balance_before)},
        after_data={"balance": float(user.balance), "delta": delta, "reason": reason},
    )

    action_emoji = "✅" if action == "add" else "💸"
    await message.answer(
        f"{action_emoji} Баланс обновлён!\n\n"
        f"Пользователь: {user.display_name}\n"
        f"Было: {float(balance_before):,.2f} ₽\n"
        f"Стало: <b>{float(user.balance):,.2f} ₽</b>\n"
        f"Изменение: {'+' if delta > 0 else ''}{delta:,.2f} ₽\n"
        f"Причина: {reason or '—'}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="👤 К пользователю", callback_data=f"admin:user:view:{user.id}")
        ]]),
    )

    # Уведомляем пользователя
    try:
        import httpx
        from shared.config import settings
        msg = (
            f"{'💰 Пополнение' if action == 'add' else '💸 Списание'} баланса\n\n"
            f"{'Начислено' if action == 'add' else 'Списано'}: <b>{amount:,.2f} ₽</b>\n"
            f"Баланс: <b>{float(user.balance):,.2f} ₽</b>"
            + (f"\nПричина: {reason}" if reason else "")
        )
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json={"chat_id": user.telegram_id, "text": msg, "parse_mode": "HTML"},
                timeout=5.0,
            )
    except Exception:
        pass


# ── Блокировка ────────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:user:block:"))
@require_permission("users.edit")
async def admin_block_start(call: CallbackQuery, state: FSMContext) -> None:
    user_id = call.data.split(":")[3]
    await state.update_data(user_id=user_id)
    await call.message.edit_text(
        "🚫 <b>Блокировка пользователя</b>\n\nУкажи причину блокировки:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="❌ Отмена", callback_data=f"admin:user:view:{user_id}")
        ]]),
    )
    await state.set_state(BlockUserFSM.waiting_reason)
    await call.answer()


@router.message(StateFilter(BlockUserFSM.waiting_reason))
@require_permission("users.edit")
async def admin_block_execute(
    message: Message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    data = await state.get_data()
    await state.clear()

    user = await db.get(User, data["user_id"])
    if not user:
        await message.answer("Пользователь не найден")
        return

    from datetime import datetime, timezone
    user.is_blocked   = True
    user.blocked_reason = message.text.strip()
    user.blocked_at   = datetime.now(timezone.utc)

    await log_admin_action(
        db, admin, "user.block", "user", user.id,
        after_data={"reason": user.blocked_reason},
    )

    await message.answer(
        f"🚫 Пользователь {user.display_name} заблокирован.\nПричина: {user.blocked_reason}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="👤 К пользователю", callback_data=f"admin:user:view:{user.id}")
        ]]),
    )


@router.callback_query(F.data.startswith("admin:user:unblock:"))
@require_permission("users.edit")
async def admin_unblock(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    user_id = call.data.split(":")[3]
    user = await db.get(User, user_id)
    if not user:
        await call.answer("Не найден", show_alert=True)
        return

    user.is_blocked     = False
    user.blocked_reason = None
    user.blocked_at     = None

    await log_admin_action(db, admin, "user.unblock", "user", user.id)
    await call.answer("✅ Пользователь разблокирован")
    await db.refresh(user, ["loyalty_level"])
    await call.message.edit_text(_fmt_user(user), reply_markup=_user_keyboard(user))


# ── Лояльность ────────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:user:loyalty:"))
@require_permission("users.edit")
async def admin_loyalty_start(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    user_id = call.data.split(":")[3]
    result = await db.execute(
        select(LoyaltyLevel).where(LoyaltyLevel.is_active == True)
        .order_by(LoyaltyLevel.priority)
    )
    levels = result.scalars().all()

    buttons = []
    for level in levels:
        buttons.append([InlineKeyboardButton(
            text=f"{level.icon_emoji} {level.name} (скидка {level.discount_percent}%)",
            callback_data=f"admin:user:loyalty:set:{user_id}:{level.id}",
        )])
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data=f"admin:user:view:{user_id}")])

    await call.message.edit_text(
        "🏅 <b>Изменить уровень лояльности</b>\n\nВыбери новый уровень:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
    await call.answer()


@router.callback_query(F.data.startswith("admin:user:loyalty:set:"))
@require_permission("users.edit")
async def admin_loyalty_set(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    parts = call.data.split(":")
    user_id, level_id = parts[4], parts[5]

    user  = await db.get(User, user_id)
    level = await db.get(LoyaltyLevel, level_id)

    if not user or not level:
        await call.answer("Не найдено", show_alert=True)
        return

    old_level_id = user.loyalty_level_id
    user.loyalty_level_id = level.id

    await log_admin_action(
        db, admin, "user.loyalty_change", "user", user.id,
        before_data={"loyalty_level_id": str(old_level_id)},
        after_data={"loyalty_level_id": str(level.id), "level_name": level.name},
    )

    await call.answer(f"✅ Уровень изменён на {level.icon_emoji} {level.name}")
    await db.refresh(user, ["loyalty_level"])
    await call.message.edit_text(_fmt_user(user), reply_markup=_user_keyboard(user))


# ── Корзина пользователя ──────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:user:cart:"))
@require_permission("users.view")
async def admin_user_cart(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    user_id = call.data.split(":")[3]

    result = await db.execute(
        select(Cart).options(
            selectinload(Cart.items).selectinload(Cart.items)
        ).where(Cart.user_id == user_id)
    )
    cart = result.scalar_one_or_none()

    if not cart or not cart.items:
        await call.answer("Корзина пуста", show_alert=True)
        return

    lines = [f"🛒 <b>Корзина пользователя</b> ({len(cart.items)} поз.)\n"]
    for item in cart.items:
        lines.append(
            f"• <b>{item.quantity}×</b> {item.product_id}\n"
            f"  Цена: {float(item.price_snapshot):,.0f} ₽ · "
            f"Итого: {float(item.subtotal):,.0f} ₽"
        )
    lines.append(f"\n<b>Сумма: {float(cart.total):,.0f} ₽</b>")

    await call.message.edit_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="◀️ Назад", callback_data=f"admin:user:view:{user_id}")
        ]]),
    )
    await call.answer()


# ── Заказы пользователя ───────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin:user:orders:"))
@require_permission("orders.view")
async def admin_user_orders(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    user_id = call.data.split(":")[3]

    result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(desc(Order.created_at))
        .limit(10)
    )
    orders = result.scalars().all()

    if not orders:
        await call.answer("Заказов нет", show_alert=True)
        return

    STATUS_EMOJI = {
        "completed": "✅", "cancelled": "❌", "processing": "⚙️",
        "paid": "💚", "pending_payment": "⏳", "new": "🆕",
        "clarification": "❓", "dispute": "⚠️",
    }

    lines = [f"📋 <b>Заказы пользователя</b> (последние 10)\n"]
    for o in orders:
        emoji = STATUS_EMOJI.get(o.status.value, "📋")
        lines.append(
            f"{emoji} <b>{o.order_number}</b> · "
            f"{float(o.total_amount):,.0f} ₽ · "
            f"{o.created_at.strftime('%d.%m.%Y')}"
        )

    buttons = [[
        InlineKeyboardButton(text=f"#{o.order_number}", callback_data=f"admin:order:{o.id}")
        for o in orders[:5]
    ]]
    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data=f"admin:user:view:{user_id}")])

    await call.message.edit_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
    await call.answer()
