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
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery, FSInputFile, Message, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, ReplyKeyboardMarkup, KeyboardButton,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from shared.config import settings
from shared.models import User
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, nav_edit

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
    Главная — открыть Mini App (если настроен) или каталог (fallback).
    БАГ 4 ИСПРАВЛЕН: кнопка строится явно через if/else, без передачи
    web_app=None и callback_data=None в один конструктор.
    """
    # Кнопка входа: Mini App или каталог
    if settings.MINIAPP_URL:
        entry_button = InlineKeyboardButton(
            text=f"🛍 Открыть {settings.SHOP_NAME}",
            web_app=WebAppInfo(url=settings.MINIAPP_URL),
        )
    else:
        entry_button = InlineKeyboardButton(
            text=f"🛍 Открыть {settings.SHOP_NAME}",
            callback_data="open_catalog",
        )

    buttons = [
        [entry_button],
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

    return InlineKeyboardMarkup(inline_keyboard=buttons)


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
async def cmd_start(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    """
    Обработчик /start.
    AuthMiddleware уже зарегистрировал/обновил пользователя
    и передал его в data["user"].
    Обрабатывает параметры:
      - REF_<telegram_id> — реферальная программа
      - product_<uuid>    — показ карточки товара
    """
    # Парсим start_param
    start_param = None
    if message.text and len(message.text.split()) > 1:
        start_param = message.text.split(maxsplit=1)[1].strip()

    # Показ карточки товара из inline-режима
    if start_param and start_param.startswith("product_"):
        await _show_product_from_start(message, start_param, db)
        return

    referral_bonus = 0.0

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
        sent = await message.answer_photo(
            photo=FSInputFile(assets_path),
            caption=welcome_text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    else:
        sent = await message.answer(welcome_text, reply_markup=keyboard, parse_mode="HTML")
    await state.update_data(nav_msg_id=sent.message_id)


async def _show_product_from_start(
    message: Message, start_param: str, db: AsyncSession
) -> None:
    """Показывает карточку товара при /start product_{uuid}."""
    import uuid as uuid_mod
    from sqlalchemy.orm import selectinload
    from shared.models import Product
    from bot.utils.texts import texts as _texts

    product_id_str = start_param[len("product_"):]
    try:
        product_id = uuid_mod.UUID(product_id_str)
    except ValueError:
        await message.answer("❌ Товар не найден.", parse_mode="HTML")
        return

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots))
        .where(Product.id == product_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        await message.answer("❌ Товар не найден или недоступен.", parse_mode="HTML")
        return

    active_lots = [lot for lot in product.lots if lot.is_active]
    prices = [float(lot.price) for lot in active_lots] if active_lots else [float(product.price)]

    card_text = _texts.product_card(
        name=product.name,
        description=product.description or "",
        price=float(product.price),
        stock=product.stock,
        delivery_type=product.delivery_type.value,
        min_price=min(prices),
        max_price=max(prices),
    )

    buttons = []
    if active_lots:
        for lot in active_lots:
            badge = f" [{lot.badge}]" if lot.badge else ""
            buttons.append(
                [
                    InlineKeyboardButton(
                        text=f"🛒 {lot.name} — {float(lot.price):.0f} ₽{badge}",
                        callback_data=f"cart:add:{product.id}:{lot.id}",
                    )
                ]
            )
    else:
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"🛒 В корзину — {float(product.price):.0f} ₽",
                    callback_data=f"cart:add:{product.id}",
                )
            ]
        )

    buttons.append(
        [
            InlineKeyboardButton(
                text="❤️ В избранное",
                callback_data=f"favorites:toggle:{product.id}",
            )
        ]
    )
    buttons.append(
        [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main")]
    )

    await message.answer(
        card_text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "menu:main")
async def cb_menu_main(call: CallbackQuery, user: User, state: FSMContext) -> None:
    text = texts.greeting(user.first_name)
    keyboard = get_start_inline_keyboard()
    await safe_edit(call.message, text, reply_markup=keyboard)
    await state.update_data(nav_msg_id=call.message.message_id)
    await call.answer()


@router.message(F.text == "❓ FAQ")
async def btn_faq(message: Message, state: FSMContext) -> None:
    await nav_edit(message, state, texts.faq())


@router.message(Command("help"))
async def cmd_help(message: Message, state: FSMContext) -> None:
    await nav_edit(message, state, texts.help_text())
