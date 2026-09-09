"""
bot/handlers/client/support.py
─────────────────────────────────────────────────────────────────────────────
Поддержка: ссылка на бот поддержки + чат в MiniApp + FAQ.
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
    WebAppInfo,
)
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import settings
from shared.content import get_photo_url
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, render_screen

router = Router(name="client:support")


def _support_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(
                text="💬 Написать в поддержку",
                url=f"https://t.me/{settings.SHOP_SUPPORT_USERNAME}",
            )
        ],
    ]
    if settings.MINIAPP_URL:
        buttons.append([
            InlineKeyboardButton(
                text="📱 Открыть чат поддержки",
                web_app=WebAppInfo(url=f"{settings.MINIAPP_URL}/support"),
            )
        ])
    buttons.extend([
        [
            InlineKeyboardButton(text="❓ FAQ", callback_data="faq:main"),
        ],
        [
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
        ],
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("support"))
@router.message(F.text == "🆘 Поддержка")
async def cmd_support(message: Message, db: AsyncSession, state: FSMContext) -> None:
    photo_url = await get_photo_url(db, "support")
    await render_screen(
        message, state, texts.support_header,
        photo_url=photo_url, reply_markup=_support_keyboard(),
    )


@router.callback_query(F.data == "support:main")
async def cb_support_main(call: CallbackQuery, db: AsyncSession, state: FSMContext) -> None:
    photo_url = await get_photo_url(db, "support")
    await render_screen(
        call, state, texts.support_header,
        photo_url=photo_url, reply_markup=_support_keyboard(),
    )


@router.callback_query(F.data == "faq:main")
async def cb_faq(call: CallbackQuery) -> None:
    await safe_edit(
        call.message,
        texts.faq(),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(text="◀️ Назад", callback_data="support:main"),
                    InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary"),
                ]
            ]
        ),
    )
    await call.answer()
