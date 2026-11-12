"""
bot/handlers/client/widget_query.py
─────────────────────────────────────────────────────────────────────────────
Запросы виджетов (Bot API 10.4, update.widget_query). aiogram 3.31 этот тип
обновления не знает и пропускает — поэтому перехватываем его внешним
middleware диспетчера до разбора, отвечаем answerWidgetQuery (до 15 с).

Запрос виджета раздела: «b:<раздел>:<число товаров>:<номер.кол-во,…>» — положить
выбранное в корзину (номера — в порядке catalog.category_products, число товаров
сверяем: раздел мог измениться). Старый формат «a:<id товара hex>:<кол-во>» —
для уже отправленных виджетов.
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
from bot.utils.widgets import AnswerWidgetQuery, category_from_key
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
        if len(parts) == 4 and parts[0] == "b":
            return await self._handle_batch(bot, query, parts)
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

    async def _handle_batch(self, bot: Bot, query: dict, parts: list[str]) -> dict:
        """Всё выбранное в виджете раздела — в корзину одним запросом."""
        from bot.handlers.client.catalog import category_products, start_fields_from_widget, widget_keyboard

        try:
            category_id = category_from_key(parts[1])
            expected = int(parts[2], 36)
            picks: list[tuple[int, int]] = []
            for chunk in parts[3].split(","):
                idx, qty = chunk.split(".")
                picks.append((int(idx, 36), int(qty)))
        except (ValueError, TypeError):
            return {"ok": 0, "e": "Неверные данные"}
        if not picks or len(picks) > 6 or any(q < 1 for _, q in picks):
            return {"ok": 0, "e": "Неверное количество"}

        tg_id = (query.get("from") or {}).get("id")
        chat_id = (query.get("chat") or {}).get("id") or tg_id
        message_id = query.get("message_id")

        async with async_session_factory() as db:
            user = (await db.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
            if not user or user.is_blocked:
                return {"ok": 0, "e": "Нажмите /start и попробуйте снова"}
            category = await db.get(Category, category_id)
            products = await category_products(db, category_id)
            if not category or len(products) != expected or any(i >= len(products) for i, _ in picks):
                return {"ok": 0, "e": "Раздел обновился — откройте его заново"}

            cart_svc = CartService(db)
            cart = await cart_svc.get_or_create_cart(user)
            added = 0
            need_fields: tuple | None = None
            skipped: list[str] = []
            for idx, qty in picks:
                product = products[idx]
                if product.is_out_of_stock:
                    skipped.append(product.name)
                    continue
                fields = [f for f in (product.input_fields or [])
                          if isinstance(f, dict) and f.get("type") != "quantity"]
                if fields:
                    # данные покупателя спросим в чате — для первого такого товара
                    if need_fields is None:
                        need_fields = (product, fields, qty)
                    else:
                        skipped.append(product.name)
                    continue
                try:
                    await cart_svc.add_item(cart, product.id, qty, {})
                    added += 1
                except ValueError as e:
                    await db.rollback()
                    return {"ok": 0, "e": str(e)}
            await db.commit()
            cart = await cart_svc.get_or_create_cart(user)
            count, total = len(cart.items), float(cart.total)

        if need_fields:
            state = self.dispatcher.fsm.get_context(bot=bot, chat_id=chat_id, user_id=tg_id)
            await start_fields_from_widget(bot, chat_id, state, *need_fields)

        if message_id and added:
            try:
                await bot.edit_message_reply_markup(
                    chat_id=chat_id, message_id=message_id,
                    reply_markup=widget_keyboard(category.id, category.game_id, total),
                )
            except Exception:
                log.warning("widget keyboard refresh failed", exc_info=True)

        text = (f"В корзине {count} {_plural(count, 'позиция', 'позиции', 'позиций')} на {rub(total)}"
                if added else "")
        if need_fields:
            text = (text + ". " if text else "") + "Для «" + need_fields[0].name[:30] + "» ответьте в чате"
        if skipped:
            text = (text + ". " if text else "") + "Не добавлено: " + ", ".join(n[:20] for n in skipped)[:120]
        return {"ok": 1 if (added or need_fields) else 0, "m": text, "e": text or "Нечего добавлять"}
