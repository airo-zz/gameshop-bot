"""
bot/handlers/client/start.py
─────────────────────────────────────────────────────────────────────────────
/start — точка входа клиента.
Главное меню с кнопками + кнопка открытия Mini App.
Обрабатывает реферальный параметр: /start REF_<telegram_id>
─────────────────────────────────────────────────────────────────────────────
"""

import os
from datetime import datetime, timezone, timedelta

from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    FSInputFile, Message, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, ReplyKeyboardMarkup, KeyboardButton,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from shared.config import settings
from shared.models import User
from bot.utils.texts import texts

router = Router(name="client:start")


def get_main_keyboard() -> ReplyKeyboardMarkup:
    """
    Постоянная клавиатура (ReplyKeyboard) под полем ввода.
    Быстрый доступ к основным разделам.
    """
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🛍 reDonate"),
                KeyboardButton(text="🛒 Корзина"),
            ],
            [
                KeyboardButton(text="📋 Мои заказы"),
                KeyboardButton(text="👤 Профиль"),
            ],
            [
                KeyboardButton(text="🆘 Поддержка"),
                KeyboardButton(text="❓ FAQ"),
            ],
        ],
        resize_keyboard=True,
        input_field_placeholder=f"Выбери раздел {settings.SHOP_NAME}...",
    )


def get_start_inline_keyboard() -> InlineKeyboardMarkup:
    """
    Inline-кнопки под приветственным сообщением.
    Главная — открыть Mini App.
    """
    buttons = [
        [
            InlineKeyboardButton(
                text=f"🛍 Открыть {settings.SHOP_NAME}",
                web_app=WebAppInfo(url=settings.MINIAPP_URL)
                if settings.MINIAPP_URL
                else None,
                # Fallback если Mini App не настроен
                callback_data="open_catalog" if not settings.MINIAPP_URL else None,
            )
        ],
        [
            InlineKeyboardButton(text="🎮 Каталог игр", callback_data="catalog:main"),
            InlineKeyboardButton(text="🛒 Корзина", callback_data="cart:view"),
        ],
        [
            InlineKeyboardButton(text="📋 Заказы", callback_data="orders:list"),
            InlineKeyboardButton(text="👤 Профиль", callback_data="profile:view"),
        ],
        [
            InlineKeyboardButton(text="💰 Пополнить баланс", callback_data="balance:topup"),
            InlineKeyboardButton(text="🆘 Поддержка", callback_data="support:main"),
        ],
        [
            InlineKeyboardButton(text="🎁 Реферальная программа", callback_data="referral:show"),
        ],
    ]

    # Убираем None значения из кнопок
    cleaned = []
    for row in buttons:
        cleaned_row = []
        for btn in row:
            if btn.web_app is None and btn.callback_data is None:
                continue
            cleaned_row.append(btn)
        if cleaned_row:
            cleaned.append(cleaned_row)

    return InlineKeyboardMarkup(inline_keyboard=cleaned)


async def _apply_referral(user: User, start_param: str, db: AsyncSession) -> float:
    """
    Применяет реферальный код при первом входе.
    Формат: REF_<telegram_id>
    Возвращает бонус реферала (0 если не применён).
    """
    if not start_param or not start_param.startswith("REF_"):
        return 0.0

    # Уже есть реферер — не меняем
    if user.referred_by_id is not None:
        return 0.0

    try:
        referrer_tg_id = int(start_param[4:])
    except (ValueError, IndexError):
        return 0.0

    # Нельзя быть своим же рефералом
    if referrer_tg_id == user.telegram_id:
        return 0.0

    result = await db.execute(
        select(User).where(User.telegram_id == referrer_tg_id)
    )
    referrer = result.scalar_one_or_none()
    if not referrer:
        return 0.0

    user.referred_by_id = referrer.id
    await db.commit()
    return 0.0  # Бонус будет начислен при первой покупке


@router.message(CommandStart())
async def cmd_start(message: Message, user: User, db: AsyncSession) -> None:
    """
    Обработчик /start.
    AuthMiddleware уже зарегистрировал/обновил пользователя
    и передал его в data["user"].
    Обрабатывает реферальный параметр REF_<telegram_id>.
    """
    # Парсим start_param для реферальной программы
    referral_bonus = 0.0
    start_param = None
    if message.text and len(message.text.split()) > 1:
        start_param = message.text.split(maxsplit=1)[1].strip()

    # Определяем — новый пользователь или вернулся (зарегистрирован менее 5 минут назад)
    is_new = (
        datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)
    ) < timedelta(minutes=5)

    if is_new and start_param:
        referral_bonus = await _apply_referral(user, start_param, db)

    if is_new:
        welcome_text = texts.greeting_new_user(user.first_name, referral_bonus)
    else:
        welcome_text = texts.greeting(user.first_name)

    keyboard = get_start_inline_keyboard()

    assets_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "assets", "welcome.jpg"
    )
    if os.path.exists(assets_path):
        await message.answer_photo(
            photo=FSInputFile(assets_path),
            caption=welcome_text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    else:
        await message.answer(welcome_text, reply_markup=keyboard, parse_mode="HTML")


@router.message(F.text == "❓ FAQ")
async def btn_faq(message: Message) -> None:
    await message.answer(texts.faq())


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(texts.help_text())
