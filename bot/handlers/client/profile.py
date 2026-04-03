"""
bot/handlers/client/profile.py
─────────────────────────────────────────────────────────────────────────────
Профиль пользователя + реферальная программа.
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
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from shared.config import settings
from shared.models import User
from bot.utils.texts import texts

router = Router(name="client:profile")


def _profile_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📋 Мои заказы", callback_data="orders:list")],
            [InlineKeyboardButton(text="💰 Пополнить баланс", callback_data="balance:topup")],
            [InlineKeyboardButton(text="🎁 Реферальная программа", callback_data="referral:show")],
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
            [InlineKeyboardButton(text="◀️ Назад в профиль", callback_data="profile:view")],
        ]
    )


async def _build_profile_text(user: User, db: AsyncSession) -> str:
    # Подгружаем loyalty_level если не загружен
    loyalty_name = "Bronze"
    loyalty_emoji = "🥉"
    if user.loyalty_level_id:
        from sqlalchemy import select as sa_select
        from shared.models import LoyaltyLevel
        result = await db.execute(
            sa_select(LoyaltyLevel).where(LoyaltyLevel.id == user.loyalty_level_id)
        )
        level = result.scalar_one_or_none()
        if level:
            loyalty_name = level.name
            loyalty_emoji = level.icon_emoji

    return texts.profile(
        first_name=user.first_name,
        balance=float(user.balance),
        orders_count=user.orders_count,
        total_spent=float(user.total_spent),
        loyalty_name=loyalty_name,
        loyalty_emoji=loyalty_emoji,
        referral_code=user.referral_code,
    )


async def _build_referral_text(user: User, db: AsyncSession) -> tuple[str, str]:
    """Возвращает (текст, реф-ссылка)."""
    # Считаем количество рефералов
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


@router.message(Command("profile"))
@router.message(F.text == "👤 Профиль")
async def cmd_profile(message: Message, user: User, db: AsyncSession) -> None:
    text = await _build_profile_text(user, db)
    await message.answer(text, reply_markup=_profile_keyboard(), parse_mode="HTML")


@router.callback_query(F.data == "profile:view")
async def cb_profile_view(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    text = await _build_profile_text(user, db)
    await call.message.edit_text(
        text, reply_markup=_profile_keyboard(), parse_mode="HTML"
    )
    await call.answer()


@router.message(Command("referral"))
async def cmd_referral(message: Message, user: User, db: AsyncSession) -> None:
    """Команда /referral — показать реферальную ссылку."""
    text, ref_link = await _build_referral_text(user, db)
    await message.answer(
        text,
        reply_markup=_referral_keyboard(ref_link),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "referral:show")
async def cb_referral_show(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    """Inline-кнопка реферальной программы."""
    text, ref_link = await _build_referral_text(user, db)
    await call.message.edit_text(
        text,
        reply_markup=_referral_keyboard(ref_link),
        parse_mode="HTML",
    )
    await call.answer()
