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
from bot.utils.helpers import safe_edit

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
    await safe_edit(call.message, text, reply_markup=_profile_keyboard())
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
                [IKB(text="◀️ Профиль", callback_data="profile:view")],
            ]
        )
        await safe_edit(
            call.message,
            f"💰 <b>Пополнение баланса</b>\n\n"
            f"Текущий баланс: <b>{float(user.balance):.2f} ₽</b>\n\n"
            f"Пополни баланс через Mini App:",
            reply_markup=keyboard,
        )
    else:
        await safe_edit(
            call.message,
            f"💰 <b>Пополнение баланса</b>\n\n"
            f"Текущий баланс: <b>{float(user.balance):.2f} ₽</b>\n\n"
            f"Для пополнения обратись в поддержку: {_settings.support_link}",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text="◀️ Профиль", callback_data="profile:view")]
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
