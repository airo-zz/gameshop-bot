"""
bot/handlers/client/start.py
─────────────────────────────────────────────────────────────────────────────
/start — точка входа клиента.
Главное меню с кнопками + кнопка открытия Mini App.
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
                KeyboardButton(text="🛍 Магазин"),
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


@router.message(CommandStart())
async def cmd_start(message: Message, user: User) -> None:
    """
    Обработчик /start.
    AuthMiddleware уже зарегистрировал/обновил пользователя
    и передал его в data["user"].
    """
    # Определяем — новый пользователь или вернулся (зарегистрирован менее 5 минут назад)
    is_new = (
        datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)
    ) < timedelta(minutes=5)

    if is_new:
        welcome_text = texts.greeting_new_user(user.first_name)
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
