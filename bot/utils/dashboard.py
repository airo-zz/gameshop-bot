"""
bot/utils/dashboard.py
─────────────────────────────────────────────────────────────────────────────
Панель главного меню (виджет над меню): баланс, уровень и прогресс,
корзина, последний заказ. Данные — из тех же сервисов, что у сайта
(LoyaltyService, CartService); здесь только сборка JSON для виджета
(до 1024 байт — лимит chat_data и ответа на запрос виджета).
─────────────────────────────────────────────────────────────────────────────
"""

import json

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.cart_service import CartService
from api.services.loyalty_service import LoyaltyService
from bot.utils.texts import rub
from bot.utils.widgets import DASHBOARD_HTML, SendWidget
from shared.models import Order, User

_STATUS = {
    "new": "ожидает оплаты", "pending_payment": "ожидает оплаты", "paid": "оплачен",
    "processing": "в работе", "clarification": "нужно уточнение", "completed": "выполнен",
    "cancelled": "отменён", "refunded": "возврат",
}


def _plural(n: int, one: str, few: str, many: str) -> str:
    if 11 <= n % 100 <= 19:
        return many
    return one if n % 10 == 1 else few if 2 <= n % 10 <= 4 else many


async def dashboard_data(db: AsyncSession, user: User) -> dict:
    st = await LoyaltyService(db).get_status(user)
    lv = st.level
    spent = float(st.month_spent)
    if st.next_level:
        base = float(lv.min_spent) if lv and not st.held_from_prev_month else 0.0
        target = float(st.next_level.min_spent)
        progress = max(0.0, min(1.0, (spent - base) / (target - base))) if target > base else 0.0
        caption = f"До {st.next_level.name} — ещё {rub(max(0.0, target - spent))} в этом месяце"
    else:
        progress, caption = 1.0, "Максимальный уровень"

    cart = await CartService(db).get_or_create_cart(user)
    n = len(cart.items)
    cart_line = f"{n} {_plural(n, 'позиция', 'позиции', 'позиций')} · {rub(cart.total)}" if n else None

    order = (await db.execute(
        select(Order).where(Order.user_id == user.id).order_by(desc(Order.created_at)).limit(1)
    )).scalar_one_or_none()
    order_line = None
    if order:
        status = order.status.value if hasattr(order.status, "value") else str(order.status)
        order_line = f"{order.order_number} · {_STATUS.get(status, status)}"

    cap = float(lv.monthly_cashback_cap) if lv and lv.monthly_cashback_cap else None
    month_cb = rub(st.month_cashback) + (f" из {rub(cap)}" if cap else "")
    return {
        "b": rub(user.balance),
        "lv": lv.name if lv else "—",
        "ic": lv.icon_emoji if lv else "",
        "col": lv.color_hex if lv else "#8A94A6",
        "cb": f"{float(lv.cashback_percent):g}%" if lv else "0%",
        "p": round(progress, 3),
        "pt": caption,
        "mc": month_cb,
        "ct": cart_line,
        "od": order_line,
    }


def dashboard_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


async def send_dashboard(bot: Bot, chat_id: int, db: AsyncSession, user: User, state: FSMContext) -> None:
    """Панель над меню; прежнюю убираем, чтобы в чате не копились."""
    data = await state.get_data()
    old = data.get("dash_msg_id")
    if old:
        try:
            await bot.delete_message(chat_id, old)
        except TelegramBadRequest:
            pass
    info = await dashboard_data(db, user)
    try:
        sent = await bot(SendWidget(
            chat_id=chat_id, html=DASHBOARD_HTML, chat_data=dashboard_json(info),
            caption="👤 <b>Личный кабинет</b>", parse_mode="HTML",
            show_caption_above_media=True, allow_queries=True,
        ))
    except TelegramBadRequest:
        return
    await state.update_data(dash_msg_id=sent.message_id)
