"""
bot/handlers/client/search.py
─────────────────────────────────────────────────────────────────────────────
Поиск по свободному тексту: покупатель просто пишет боту «геншин» или «pubg» —
бот показывает подходящие игры и сервисы (catalog.show_search_results).

Роутер подключается ПОСЛЕДНИМ (bot/main.py): кнопки reply-клавиатуры и все
сценарии с вводом (поля заказа, промокод, сумма пополнения) обрабатываются
раньше; сюда доходит только текст вне сценариев.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from bot.handlers.client.catalog import SearchFSM, show_search_results

router = Router(name="client:search")


@router.message(StateFilter(None, SearchFSM.query), F.chat.type == "private", F.text, ~F.text.startswith("/"))
async def msg_free_text_search(message: Message, db: AsyncSession, state: FSMContext) -> None:
    await show_search_results(message, db, state, message.text.strip())
