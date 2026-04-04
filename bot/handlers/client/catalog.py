"""
bot/handlers/client/catalog.py
─────────────────────────────────────────────────────────────────────────────
Каталог игр и товаров.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Game
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
