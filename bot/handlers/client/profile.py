"""
bot/handlers/client/profile.py
─────────────────────────────────────────────────────────────────────────────
Профиль пользователя + реферальная программа.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
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


def _profile_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📋 Мои заказы", callback_data="orders:list")],
            [InlineKeyboardButton(text="❤️ Избранное", callback_data="favorites:list")],
            [InlineKeyboardButton(text="💰 Пополнить баланс", callback_data="balance:topup")],
            [InlineKeyboardButton(text="🎁 Реферальная программа", callback_data="referral:show")],
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
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
                InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
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
        referral_code=user.referral_code,
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
        [InlineKeyboardButton(text="💳 Пополнить баланс", callback_data="balance:topup")],
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
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
async def cb_balance_topup(
    call: CallbackQuery, user: User
) -> None:
    """Пополнение баланса — направляет в Mini App или сообщает способы."""
    from shared.config import settings as _settings

    if _settings.MINIAPP_URL:
        from aiogram.types import InlineKeyboardButton as IKB, InlineKeyboardMarkup as IKM, WebAppInfo
        keyboard = IKM(
            inline_keyboard=[
                [IKB(
                    text=f"💳 Открыть {_settings.SHOP_NAME}",
                    web_app=WebAppInfo(url=_settings.MINIAPP_URL),
                )],
                [
                    IKB(text="◀️ Профиль", callback_data="profile:view"),
                    IKB(text="🏠 Меню", callback_data="menu:main"),
                ],
            ]
        )
        await safe_edit(
            call.message,
            texts.balance_topup_miniapp(float(user.balance)),
            reply_markup=keyboard,
        )
    else:
        await safe_edit(
            call.message,
            texts.balance_topup_support(float(user.balance)),
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(text="◀️ Профиль", callback_data="profile:view"),
                        InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
                    ]
                ]
            ),
        )
    await call.answer()


@router.callback_query(F.data == "referral:show")
async def cb_referral_show(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    """Inline-кнопка реферальной программы."""
    text, ref_link = await _build_referral_text(user, db)
    await safe_edit(call.message, text, reply_markup=_referral_keyboard(ref_link))
    await call.answer()
