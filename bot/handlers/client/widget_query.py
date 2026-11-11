"""
bot/handlers/client/widget_query.py
─────────────────────────────────────────────────────────────────────────────
Запросы виджетов (Bot API 10.4, update.widget_query). aiogram 3.31 этот тип
обновления не знает и пропускает — поэтому перехватываем его внешним
middleware диспетчера до разбора, отвечаем answerWidgetQuery (до 15 с).

Запрос виджета раздела: «a:<id товара hex>:<кол-во>» — положить в корзину.
Ответ виджету — JSON: {"ok":1,"m":"…"} или {"ok":0,"e":"…"}.
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware, Bot, Dispatcher
from aiogram.types import TelegramObject, Update
from sqlalchemy import select

from api.services.cart_service import CartService
from bot.utils.texts import rub
from bot.utils.widgets import AnswerWidgetQuery
from shared.database.session import async_session_factory
from shared.models import Category, Product, User

log = logging.getLogger(__name__)


def _plural(n: int, one: str, few: str, many: str) -> str:
    if 11 <= n % 100 <= 19:
        return many
    return one if n % 10 == 1 else few if 2 <= n % 10 <= 4 else many


class WidgetQueryMiddleware(BaseMiddleware):
    """Внешний middleware dp.update: забирает widget_query, остальное — дальше как обычно."""

    def __init__(self, dispatcher: Dispatcher) -> None:
        self.dispatcher = dispatcher

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        query = (getattr(event, "model_extra", None) or {}).get("widget_query") if isinstance(event, Update) else None
        if not query:
            return await handler(event, data)
        bot: Bot = data["bot"]
        try:
            answer = await self._handle(bot, query)
        except Exception:
            log.exception("widget_query failed")
            answer = {"ok": 0, "e": "Ошибка — попробуйте ещё раз"}
        try:
            await bot(AnswerWidgetQuery(widget_query_id=query["id"],
                                        data=json.dumps(answer, ensure_ascii=False)))
        except Exception:
            log.exception("answerWidgetQuery failed")
        return None

    async def _handle(self, bot: Bot, query: dict) -> dict:
        parts = str(query.get("data") or "").split(":")
        if len(parts) != 3 or parts[0] != "a":
            return {"ok": 0, "e": "Неизвестный запрос"}
        try:
            product_id = uuid.UUID(hex=parts[1])
            units = int(parts[2])
        except ValueError:
            return {"ok": 0, "e": "Неверные данные"}
        if units < 1:
            return {"ok": 0, "e": "Неверное количество"}

        tg_id = (query.get("from") or {}).get("id")
        chat_id = (query.get("chat") or {}).get("id") or tg_id
        message_id = query.get("message_id")

        async with async_session_factory() as db:
            user = (await db.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
            if not user or user.is_blocked:
                return {"ok": 0, "e": "Нажмите /start и попробуйте снова"}
            product = (await db.execute(
                select(Product).where(Product.id == product_id, Product.is_active.is_(True))
            )).scalar_one_or_none()
            if not product or product.is_out_of_stock:
                return {"ok": 0, "e": "Товар недоступен"}

            # Данные от покупателя (логин, почта…) виджет спросить не может — их
            # спрашиваем в чате, как при обычном добавлении; количество запоминаем
            fields = [f for f in (product.input_fields or [])
                      if isinstance(f, dict) and f.get("type") != "quantity"]
            if fields:
                from bot.handlers.client.catalog import start_fields_from_widget

                state = self.dispatcher.fsm.get_context(bot=bot, chat_id=chat_id, user_id=tg_id)
                await start_fields_from_widget(bot, chat_id, state, product, fields, units)
                return {"ok": 1, "m": "Осталось указать данные — ответьте в чате"}

            cart_svc = CartService(db)
            cart = await cart_svc.get_or_create_cart(user)
            try:
                await cart_svc.add_item(cart, product.id, units, {})
                await db.commit()
            except ValueError as e:
                await db.rollback()
                return {"ok": 0, "e": str(e)}
            cart = await cart_svc.get_or_create_cart(user)
            count, total = len(cart.items), float(cart.total)
            category = await db.get(Category, product.category_id)

        # Кнопка корзины под виджетом — с новой суммой
        if message_id and category:
            from bot.handlers.client.catalog import widget_keyboard

            try:
                await bot.edit_message_reply_markup(
                    chat_id=chat_id, message_id=message_id,
                    reply_markup=widget_keyboard(category.id, category.game_id, total),
                )
            except Exception:
                pass
        return {"ok": 1, "m": f"В корзине {count} {_plural(count, 'позиция', 'позиции', 'позиций')} на {rub(total)}"}
