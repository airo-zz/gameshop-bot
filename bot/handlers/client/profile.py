"""
bot/handlers/client/profile.py
─────────────────────────────────────────────────────────────────────────────
Профиль пользователя + реферальная программа.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from shared.config import settings
from shared.models import User, LoyaltyLevel
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, nav_edit

router = Router(name="client:profile")

_TOPUP_AMOUNTS = [100, 200, 300, 500, 1000, 1500, 2000, 5000, 10000]


class TopupFSM(StatesGroup):
    waiting_amount = State()


def _topup_amounts_keyboard() -> InlineKeyboardMarkup:
    buttons = []
    row = []
    for i, amount in enumerate(_TOPUP_AMOUNTS):
        label = f"{amount:,} ₽".replace(",", " ")
        row.append(InlineKeyboardButton(text=label, callback_data=f"balance:amount:{amount}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text="✏️ Указать свою сумму", callback_data="balance:amount:custom")])
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data="balance:topup", style="danger")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _profile_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📋 Мои заказы", callback_data="orders:list")],
            [InlineKeyboardButton(text="💰 Баланс", callback_data="balance:topup")],
            [InlineKeyboardButton(text="🎁 Реферальная программа", callback_data="referral:show")],
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary")],
        ]
    )


def _referral_keyboard(ref_link: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📤 Поделиться ссылкой",
                    switch_inline_query=ref_link,
                )
            ],
            [
                InlineKeyboardButton(text="◀️ Профиль", callback_data="profile:view"),
                InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
            ],
        ]
    )


async def _build_profile_text(user: User, db: AsyncSession) -> str:
    loyalty_name = "Bronze"
    loyalty_emoji = "🥉"
    current_priority = 0
    current_min_spent = 0.0

    if user.loyalty_level_id:
        result = await db.execute(
            select(LoyaltyLevel).where(LoyaltyLevel.id == user.loyalty_level_id)
        )
        level = result.scalar_one_or_none()
        if level:
            loyalty_name = level.name
            loyalty_emoji = level.icon_emoji
            current_priority = level.priority
            current_min_spent = float(level.min_spent)

    # Ищем следующий уровень по priority
    next_level_name: str | None = None
    next_level_need: float | None = None

    result = await db.execute(
        select(LoyaltyLevel)
        .where(
            LoyaltyLevel.is_active == True,
            LoyaltyLevel.priority > current_priority,
        )
        .order_by(LoyaltyLevel.priority.asc())
        .limit(1)
    )
    next_level = result.scalar_one_or_none()
    if next_level:
        next_level_name = next_level.name
        need = float(next_level.min_spent) - float(user.total_spent)
        next_level_need = max(0.0, need)

    return texts.profile(
        first_name=user.first_name,
        balance=float(user.balance),
        orders_count=user.orders_count,
        total_spent=float(user.total_spent),
        loyalty_name=loyalty_name,
        loyalty_emoji=loyalty_emoji,
        referral_code=user.referral_code,
        next_level_name=next_level_name,
        next_level_need=next_level_need,
    )


async def _build_referral_text(user: User, db: AsyncSession) -> tuple[str, str]:
    """Возвращает (текст, реф-ссылка)."""
    result = await db.execute(
        select(func.count()).where(User.referred_by_id == user.id)
    )
    referrals_count = result.scalar_one() or 0

    ref_link = f"https://t.me/{settings.BOT_USERNAME}?start=REF_{user.telegram_id}"

    text = texts.referral_info(
        ref_link=ref_link,
        referrals_count=referrals_count,
    )
    return text, ref_link


@router.message(Command("balance"))
async def cmd_balance(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    """Показывает текущий баланс с кнопкой пополнения."""
    text = texts.balance_info(
        balance=float(user.balance),
        orders_count=user.orders_count,
        total_spent=float(user.total_spent),
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance:topup")],
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary")],
    ])
    await nav_edit(message, state, text, reply_markup=keyboard)


@router.message(Command("profile"))
@router.message(F.text == "👤 Профиль")
async def cmd_profile(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    text = await _build_profile_text(user, db)
    await nav_edit(message, state, text, reply_markup=_profile_keyboard())


@router.callback_query(F.data == "profile:view")
async def cb_profile_view(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    text = await _build_profile_text(user, db)
    await safe_edit(call.message, text, reply_markup=_profile_keyboard())
    await call.answer()


@router.message(Command("referral"))
async def cmd_referral(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    """Команда /referral — показать реферальную ссылку."""
    text, ref_link = await _build_referral_text(user, db)
    await nav_edit(message, state, text, reply_markup=_referral_keyboard(ref_link))


@router.callback_query(F.data == "balance:topup")
async def cb_balance_topup(call: CallbackQuery, user: User, state: FSMContext) -> None:
    """Управление балансом."""
    await state.clear()
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 Пополнить баланс", callback_data="balance:fill", style="success")],
        [InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main", style="primary")],
    ])
    await safe_edit(
        call.message,
        texts.balance_topup_methods(float(user.balance)),
        reply_markup=keyboard,
    )
    await call.answer()


@router.callback_query(F.data == "balance:fill")
async def cb_balance_fill(call: CallbackQuery) -> None:
    """Экран выбора суммы пополнения."""
    await safe_edit(
        call.message,
        "💳 <b>Пополнение баланса</b>\n\nВыбери сумму или укажи свою:",
        reply_markup=_topup_amounts_keyboard(),
    )
    await call.answer()


@router.callback_query(F.data.startswith("balance:amount:"))
async def cb_balance_amount(call: CallbackQuery, user: User, state: FSMContext) -> None:
    value = call.data.split(":")[2]

    if value == "custom":
        await state.set_state(TopupFSM.waiting_amount)
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отмена", callback_data="balance:fill", style="danger")]
        ])
        await safe_edit(call.message, "✏️ <b>Введи сумму пополнения</b> (в рублях):", reply_markup=keyboard)
        await call.answer()
        return

    try:
        amount = int(value)
    except ValueError:
        await call.answer("Ошибка", show_alert=True)
        return

    await _show_topup_contact(call, user, amount)


@router.message(TopupFSM.waiting_amount)
async def fsm_topup_custom_amount(message: Message, user: User, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(" ", "").replace(",", "")
    if not raw.isdigit() or int(raw) <= 0:
        await message.answer("❌ Введи целое число больше 0:", parse_mode="HTML")
        return
    await state.clear()
    amount = int(raw)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"💬 Написать в поддержку", url=f"https://t.me/{settings.SHOP_SUPPORT_USERNAME}")],
        [
            InlineKeyboardButton(text="◀️ Назад", callback_data="balance:fill"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
        ],
    ])
    await message.answer(
        _topup_contact_text(user, amount),
        reply_markup=keyboard,
        parse_mode="HTML",
    )


async def _show_topup_contact(call: CallbackQuery, user: User, amount: int) -> None:
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💬 Написать в поддержку", url=f"https://t.me/{settings.SHOP_SUPPORT_USERNAME}")],
        [
            InlineKeyboardButton(text="◀️ Назад", callback_data="balance:fill"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
        ],
    ])
    await safe_edit(call.message, _topup_contact_text(user, amount), reply_markup=keyboard)
    await call.answer()


def _topup_contact_text(user: User, amount: int) -> str:
    return (
        f"💳 <b>Пополнение баланса</b>\n\n"
        f"Сумма: <b>{amount:,} ₽</b>\n\n".replace(",", " ") +
        f"Обратись в поддержку @{settings.SHOP_SUPPORT_USERNAME} и укажи:\n"
        f"• Сумму: <b>{amount:,} ₽</b>\n".replace(",", " ") +
        f"• Твой Telegram ID: <code>{user.telegram_id}</code>"
    )


@router.callback_query(F.data == "referral:show")
async def cb_referral_show(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    """Inline-кнопка реферальной программы."""
    text, ref_link = await _build_referral_text(user, db)
    await safe_edit(call.message, text, reply_markup=_referral_keyboard(ref_link))
    await call.answer()
