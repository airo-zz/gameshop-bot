"""
bot/handlers/client/start.py
─────────────────────────────────────────────────────────────────────────────
/start — точка входа клиента.
Главное меню с кнопками + кнопка открытия Mini App.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton,
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
    # Определяем — новый пользователь или вернулся
    is_new = user.orders_count == 0 and user.total_spent == 0

    if is_new:
        text = texts.greeting_new_user(user.first_name)
    else:
        text = texts.greeting(user.first_name)

    await message.answer(
        text,
        reply_markup=get_main_keyboard(),
    )
    await message.answer(
        f"👇 Выбери действие:",
        reply_markup=get_start_inline_keyboard(),
    )


@router.message(F.text == "🛍 Магазин")
async def btn_shop(message: Message) -> None:
    """Кнопка 'Магазин' из ReplyKeyboard."""
    if settings.MINIAPP_URL:
        await message.answer(
            f"🎮 Открой <b>{settings.SHOP_NAME}</b>:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text=f"🛍 Открыть {settings.SHOP_NAME}",
                    web_app=WebAppInfo(url=settings.MINIAPP_URL),
                )
            ]])
        )
    else:
        # Fallback — текстовый каталог прямо в боте
        from bot.handlers.client.catalog import show_games_list
        await show_games_list(message)


@router.message(F.text == "❓ FAQ")
async def btn_faq(message: Message) -> None:
    faq_text = (
        f"❓ <b>FAQ — {settings.SHOP_NAME}</b>\n\n"
        f"<b>Как быстро выдаётся товар?</b>\n"
        f"Автоматические товары — мгновенно после оплаты.\n"
        f"Ручные — в течение 1–24 часов.\n\n"
        f"<b>Какие способы оплаты?</b>\n"
        f"Баланс бота, банковская карта, USDT, TON.\n\n"
        f"<b>Что делать если товар не пришёл?</b>\n"
        f"Открой тикет в разделе «Поддержка».\n\n"
        f"<b>Есть ли скидки?</b>\n"
        f"Да! Программа лояльности Bronze → Silver → Gold → VIP.\n"
        f"Чем больше покупаешь — тем больше скидка.\n\n"
        f"<b>Как работает реферальная программа?</b>\n"
        f"Поделись своим кодом из профиля — получи бонус за каждого друга."
    )
    await message.answer(faq_text)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    help_text = (
        f"🤖 <b>Команды {settings.SHOP_NAME}</b>\n\n"
        f"/start — главное меню\n"
        f"/orders — мои заказы\n"
        f"/balance — мой баланс\n"
        f"/support — поддержка\n"
        f"/help — эта справка"
    )
    await message.answer(help_text)
