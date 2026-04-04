"""
bot/handlers/client/catalog.py
─────────────────────────────────────────────────────────────────────────────
Каталог игр и товаров.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from aiogram import Router, F
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Game, Category, Product, ProductLot
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit

router = Router(name="client:catalog")


def _games_keyboard(games: list[Game]) -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(
                text=game.name,
                callback_data=f"catalog:game:{game.id}",
            )
        ]
        for game in games
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def show_games_list(event: Message | CallbackQuery, db: AsyncSession) -> None:
    result = await db.execute(
        select(Game)
        .where(Game.is_active == True)
        .order_by(Game.sort_order.asc(), Game.name.asc())
    )
    games = list(result.scalars().all())

    if not games:
        text = texts.catalog_empty
        keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    else:
        text = texts.catalog_header
        keyboard = _games_keyboard(games)

    if isinstance(event, CallbackQuery):
        await safe_edit(event.message, text, reply_markup=keyboard)
        await event.answer()
    else:
        await event.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.callback_query(F.data == "catalog:main")
@router.callback_query(F.data == "open_catalog")
async def cb_catalog_main(
    call: CallbackQuery, db: AsyncSession
) -> None:
    await show_games_list(call, db)


@router.callback_query(F.data.startswith("catalog:game:"))
async def cb_catalog_game(call: CallbackQuery, db: AsyncSession) -> None:
    game_id_str = call.data.split(":")[2]
    try:
        game_id = uuid.UUID(game_id_str)
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return

    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    result = await db.execute(
        select(Category)
        .where(
            Category.game_id == game_id,
            Category.is_active == True,
            Category.parent_id == None,
        )
        .order_by(Category.sort_order.asc(), Category.name.asc())
    )
    categories = list(result.scalars().all())

    if not categories:
        await call.answer("Нет доступных категорий", show_alert=True)
        return

    buttons = [
        [InlineKeyboardButton(text=cat.name, callback_data=f"catalog:cat:{cat.id}")]
        for cat in categories
    ]
    buttons.append(
        [InlineKeyboardButton(text="◀️ Назад", callback_data="catalog:main")]
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await safe_edit(call.message, texts.game_header(game.name), reply_markup=keyboard)
    await call.answer()


@router.callback_query(F.data.startswith("catalog:cat:"))
async def cb_catalog_category(call: CallbackQuery, db: AsyncSession) -> None:
    category_id_str = call.data.split(":")[2]
    try:
        category_id = uuid.UUID(category_id_str)
    except ValueError:
        await call.answer("Некорректный ID категории", show_alert=True)
        return

    category = await db.get(Category, category_id)
    if not category:
        await call.answer("Категория не найдена", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .where(Product.category_id == category_id, Product.is_active == True)
        .order_by(Product.sort_order.asc(), Product.name.asc())
    )
    products = list(result.scalars().all())

    if not products:
        await call.answer("Нет доступных товаров", show_alert=True)
        return

    buttons = [
        [InlineKeyboardButton(text=p.name, callback_data=f"catalog:product:{p.id}")]
        for p in products
    ]
    buttons.append(
        [
            InlineKeyboardButton(
                text="◀️ Назад", callback_data=f"catalog:game:{category.game_id}"
            )
        ]
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    game = await db.get(Game, category.game_id)
    game_name = game.name if game else "Игра"

    await safe_edit(
        call.message,
        texts.category_header(game_name, category.name),
        reply_markup=keyboard,
    )
    await call.answer()


@router.callback_query(F.data.startswith("catalog:product:"))
async def cb_catalog_product(call: CallbackQuery, db: AsyncSession) -> None:
    product_id_str = call.data.split(":")[2]
    try:
        product_id = uuid.UUID(product_id_str)
    except ValueError:
        await call.answer("Некорректный ID товара", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots))
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        await call.answer("Товар не найден", show_alert=True)
        return

    active_lots = [lot for lot in product.lots if lot.is_active]
    prices = [float(lot.price) for lot in active_lots] if active_lots else [float(product.price)]

    text = texts.product_card(
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
                text="◀️ Назад", callback_data=f"catalog:cat:{product.category_id}"
            )
        ]
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await safe_edit(call.message, text, reply_markup=keyboard)
    await call.answer()


@router.message(F.text == "🛍 reDonate")
async def btn_shop(message: Message, db: AsyncSession) -> None:
    from shared.config import settings
    from aiogram.types import WebAppInfo

    if settings.MINIAPP_URL:
        await message.answer(
            texts.open_shop,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=f"🛍 Открыть {settings.SHOP_NAME}",
                            web_app=WebAppInfo(url=settings.MINIAPP_URL),
                        )
                    ]
                ]
            ),
        )
    else:
        await show_games_list(message, db)
