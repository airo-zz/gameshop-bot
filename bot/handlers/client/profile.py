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

from decimal import Decimal
from html import escape

from shared.config import settings
from shared.models import User, LoyaltyLevel
from shared.content import get_photo_url, get_text
from api.services.payment_service import PaymentService
from bot.utils.texts import texts, TOPUP_MIN, TOPUP_MAX
from bot.utils.helpers import safe_edit, render_screen

router = Router(name="client:profile")

_TOPUP_AMOUNTS = [100, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000]


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

    total_spent = float(user.total_spent)
    if next_level_name and next_level_need is not None and next_level_need > 0:
        progress_text = (
            f"\nПотрачено: <b>{total_spent:.0f} ₽</b> → "
            f"до {escape(next_level_name)} нужно ещё <b>{next_level_need:.0f} ₽</b>"
        )
    else:
        progress_text = f"\nПотрачено: <b>{total_spent:.0f} ₽</b>"

    return await get_text(
        db,
        "profile",
        first_name=escape(user.first_name),
        balance=f"{float(user.balance):.2f}",
        orders_count=user.orders_count,
        loyalty_emoji=loyalty_emoji,
        loyalty_name=escape(loyalty_name),
        progress=progress_text,
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
    text = await get_text(
        db,
        "balance_info",
        balance=f"{float(user.balance):.2f}",
        orders_count=user.orders_count,
        total_spent=f"{float(user.total_spent):.0f}",
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 Пополнить баланс", callback_data="balance:fill", style="success")],
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary")],
    ])
    photo_url = await get_photo_url(db, "balance")
    await render_screen(message, state, text, photo_url=photo_url, reply_markup=keyboard)


@router.message(Command("profile"))
@router.message(F.text == "👤 Профиль")
async def cmd_profile(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    text = await _build_profile_text(user, db)
    photo_url = await get_photo_url(db, "profile")
    await render_screen(message, state, text, photo_url=photo_url, reply_markup=_profile_keyboard())


@router.callback_query(F.data == "profile:view")
async def cb_profile_view(
    call: CallbackQuery, user: User, db: AsyncSession, state: FSMContext
) -> None:
    text = await _build_profile_text(user, db)
    photo_url = await get_photo_url(db, "profile")
    await render_screen(call, state, text, photo_url=photo_url, reply_markup=_profile_keyboard())


@router.message(Command("referral"))
async def cmd_referral(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    """Команда /referral — показать реферальную ссылку."""
    text, ref_link = await _build_referral_text(user, db)
    photo_url = await get_photo_url(db, "referral")
    await render_screen(message, state, text, photo_url=photo_url, reply_markup=_referral_keyboard(ref_link))


@router.callback_query(F.data == "balance:topup")
async def cb_balance_topup(
    call: CallbackQuery, user: User, db: AsyncSession, state: FSMContext
) -> None:
    """Управление балансом."""
    await state.clear()
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 Пополнить баланс", callback_data="balance:fill", style="success")],
        [InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:main", style="primary")],
    ])
    text = await get_text(db, "balance_topup_methods", balance=f"{float(user.balance):.2f}")
    photo_url = await get_photo_url(db, "balance")
    await render_screen(call, state, text, photo_url=photo_url, reply_markup=keyboard)


@router.callback_query(F.data == "balance:fill")
async def cb_balance_fill(call: CallbackQuery, state: FSMContext) -> None:
    """Экран выбора суммы пополнения."""
    await state.clear()
    await safe_edit(call.message, texts.topup_choose_amount, reply_markup=_topup_amounts_keyboard())
    await call.answer()


@router.callback_query(F.data.startswith("balance:amount:"))
async def cb_balance_amount(call: CallbackQuery, state: FSMContext) -> None:
    value = call.data.split(":")[2]

    if value == "custom":
        await state.set_state(TopupFSM.waiting_amount)
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отмена", callback_data="balance:fill", style="danger")]
        ])
        await safe_edit(call.message, texts.topup_enter_amount, reply_markup=keyboard)
        await call.answer()
        return

    try:
        amount = int(value)
    except ValueError:
        await call.answer("Ошибка", show_alert=True)
        return

    await safe_edit(call.message, texts.topup_choose_method(amount), reply_markup=_topup_methods_keyboard(amount))
    await call.answer()


@router.message(TopupFSM.waiting_amount)
async def fsm_topup_custom_amount(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(" ", "").replace(",", "").replace("₽", "")
    if not raw.isdigit() or not (TOPUP_MIN <= int(raw) <= TOPUP_MAX):
        await message.answer(texts.topup_bad_amount)
        return
    await state.clear()
    amount = int(raw)
    await message.answer(texts.topup_choose_method(amount), reply_markup=_topup_methods_keyboard(amount))


def _topup_methods_keyboard(amount: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🏦 СБП", callback_data=f"balance:pay:sbp:{amount}")],
        [InlineKeyboardButton(text="💳 Банковская карта", callback_data=f"balance:pay:card:{amount}")],
        [InlineKeyboardButton(text="🪙 Криптовалюта", callback_data=f"balance:pay:crypto:{amount}")],
        [
            InlineKeyboardButton(text="◀️ Сумма", callback_data="balance:fill"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
        ],
    ])


@router.callback_query(F.data.startswith("balance:pay:"))
async def cb_balance_pay(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    """Создаёт транзакцию Platega на пополнение. Зачисление — по webhook,
    пользователю придёт сообщение «Баланс пополнен»."""
    try:
        _, _, method, raw_amount = call.data.split(":")
        amount = int(raw_amount)
    except ValueError:
        await call.answer("Ошибка", show_alert=True)
        return
    if method not in ("sbp", "card", "crypto") or not (TOPUP_MIN <= amount <= TOPUP_MAX):
        await call.answer("Ошибка", show_alert=True)
        return

    try:
        result = await PaymentService(db).topup_platega(user, Decimal(amount), method, source="bot")
    except ValueError as exc:
        await call.answer(str(exc) or texts.topup_failed, show_alert=True)
        return

    redirect_url = result.get("redirect_url")
    if not redirect_url:
        await call.answer(texts.topup_failed, show_alert=True)
        return

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 Оплатить", url=redirect_url, style="success")],
        [
            InlineKeyboardButton(text="◀️ Другой способ", callback_data=f"balance:amount:{amount}"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
        ],
    ])
    await safe_edit(call.message, texts.topup_waiting(amount, method), reply_markup=keyboard)
    await call.answer()


@router.callback_query(F.data == "referral:show")
async def cb_referral_show(
    call: CallbackQuery, user: User, db: AsyncSession, state: FSMContext
) -> None:
    """Inline-кнопка реферальной программы."""
    text, ref_link = await _build_referral_text(user, db)
    photo_url = await get_photo_url(db, "referral")
    await render_screen(call, state, text, photo_url=photo_url, reply_markup=_referral_keyboard(ref_link))
