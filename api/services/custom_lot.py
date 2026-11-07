"""
api/services/custom_lot.py
─────────────────────────────────────────────────────────────────────────────
Индивидуальный (спец) лот покупателю чата — общий для админки (Чаты → «Спец. лот»)
и хаба UchetFP (задача redonate_custom_lot, см. hub_orders.apply_task).

Создаёт заказ без товара из каталога, кладёт в чат карточку с кнопкой «Оплатить»
(маркер __lot__ — его рисуют сайт, Mini App и хаб) и шлёт покупателю уведомление.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.chat_service import ChatService
from shared.models import Chat, Order, User


class CustomLotError(Exception):
    pass


async def create_custom_lot(
    db: AsyncSession, chat: Chat, title: str, price: float, description: str | None = None,
) -> Order:
    from api.services.order_service import OrderService
    from api.telegram_utils import send_tg_message
    from bot.utils.texts import texts as _texts

    title = (title or "").strip()
    if not title:
        raise CustomLotError("Укажите название лота")
    user = (await db.execute(select(User).where(User.telegram_id == chat.user_id))).scalar_one_or_none()
    if user is None:
        raise CustomLotError("Пользователь чата не найден")
    try:
        order = await OrderService(db).create_custom_order(user, title, price, description)
    except ValueError as e:
        raise CustomLotError(str(e)) from e
    await db.flush()

    # Карточка-лот в чат (маркер парсится сайтом/MiniApp → кнопка «Оплатить»)
    await ChatService(db).add_system_message(chat.user_id, f"__lot__|{order.id}|{int(round(price))}|{title}")

    # Системное сообщение само не уведомляет — шлём прямое уведомление. Кнопка
    # «Оплатить» — callback, который запускает оплату прямо в боте (cb_pay_custom_lot).
    await send_tg_message(
        chat.user_id,
        _texts.custom_lot_created(title, price),
        {"inline_keyboard": [[{"text": "💳 Оплатить", "callback_data": f"paylot:{order.id}"}]]},
        email_path="/chat", email_button="Открыть чат",
    )
    return order
