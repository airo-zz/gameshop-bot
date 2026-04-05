"""
bot/handlers/client/favorites.py
─────────────────────────────────────────────────────────────────────────────
Избранные товары пользователя.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User, UserFavorite, Product
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, nav_edit

router = Router(name="client:favorites")


def _favorites_keyboard(products: list[Product]) -> InlineKeyboardMarkup:
    buttons = []
    for product in products:
        buttons.append(
            [
                InlineKeyboardButton(
                    text=product.name,
                    callback_data=f"catalog:product:{product.id}",
                )
            ]
        )
    buttons.append(
        [
            InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _favorites_empty_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
                InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
            ]
        ]
    )


async def _show_favorites(
    event: Message | CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext | None = None,
) -> None:
    result = await db.execute(
        select(UserFavorite)
        .options(selectinload(UserFavorite.product))
        .where(UserFavorite.user_id == user.id)
    )
    favorites = result.scalars().all()

    # Фильтруем активные товары
    products = [fav.product for fav in favorites if fav.product and fav.product.is_active]

    if not products:
        text = texts.favorites_empty
        keyboard = _favorites_empty_keyboard()
    else:
        lines = [texts.favorites_header(len(products))]
        text = lines[0]
        keyboard = _favorites_keyboard(products)

    if isinstance(event, CallbackQuery):
        await safe_edit(event.message, text, reply_markup=keyboard)
        await event.answer()
    else:
        if state is not None:
            await nav_edit(event, state, text, reply_markup=keyboard)
        else:
            await event.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.message(Command("favorites"))
async def cmd_favorites(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    await _show_favorites(message, user, db, state)


@router.callback_query(F.data == "favorites:list")
async def cb_favorites_list(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    await _show_favorites(call, user, db)


@router.callback_query(F.data.startswith("favorites:toggle:"))
async def cb_favorites_toggle(
    call: CallbackQuery, user: User, db: AsyncSession
) -> None:
    product_id_str = call.data[len("favorites:toggle:"):]
    try:
        product_id = uuid.UUID(product_id_str)
    except ValueError:
        await call.answer("Некорректный ID товара", show_alert=True)
        return

    product = await db.get(Product, product_id)
    if not product:
        await call.answer("Товар не найден", show_alert=True)
        return

    # Проверяем, есть ли уже в избранном
    result = await db.execute(
        select(UserFavorite).where(
            UserFavorite.user_id == user.id,
            UserFavorite.product_id == product_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        await call.answer(texts.favorite_removed(product.name), show_alert=False)
    else:
        fav = UserFavorite(user_id=user.id, product_id=product_id)
        db.add(fav)
        await db.commit()
        await call.answer(texts.favorite_added(product.name), show_alert=False)
