"""
bot/handlers/client/support.py
─────────────────────────────────────────────────────────────────────────────
Поддержка: главный экран + ссылка на бот поддержки + FAQ.
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

from shared.config import settings
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit

router = Router(name="client:support")


def _support_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(
                text="💬 Написать в поддержку",
                url=f"https://t.me/{settings.SHOP_SUPPORT_USERNAME}",
            )
        ],
        [
            InlineKeyboardButton(text="❓ FAQ", callback_data="faq:main"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("support"))
@router.message(F.text == "🆘 Поддержка")
async def cmd_support(message: Message) -> None:
    await message.answer(
        texts.support_header,
        reply_markup=_support_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "support:main")
async def cb_support_main(call: CallbackQuery) -> None:
    await safe_edit(call.message, texts.support_header, reply_markup=_support_keyboard())
    await call.answer()


@router.callback_query(F.data == "faq:main")
async def cb_faq(call: CallbackQuery) -> None:
    await safe_edit(
        call.message,
        texts.faq(),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="◀️ Назад", callback_data="support:main")]]
        ),
    )
    await call.answer()
