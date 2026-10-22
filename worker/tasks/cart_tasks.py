"""worker/tasks/cart_tasks.py — брошенные корзины"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

from worker.main import celery_app
from shared.config import settings


@celery_app.task(
    name="worker.tasks.cart_tasks.check_abandoned_carts", bind=True, max_retries=3
)
def check_abandoned_carts(self):
    """
    Находит корзины с товарами, которые не оформлены за N часов.
    Отправляет напоминание раз, затем второе через 24ч.
    """
    asyncio.run(_check_abandoned_carts_async())


async def _check_abandoned_carts_async():
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from shared.database.session import get_worker_db_session
    from shared.models import Cart, CartItem, AbandonedCart

    threshold = datetime.now(timezone.utc) - timedelta(
        hours=settings.ABANDONED_CART_HOURS
    )

    async with get_worker_db_session() as db:
        # Корзины с товарами, не обновлявшиеся > N часов
        result = await db.execute(
            select(Cart)
            .options(selectinload(Cart.items), selectinload(Cart.user))
            .join(CartItem, CartItem.cart_id == Cart.id)
            .where(Cart.updated_at < threshold)
            .distinct()
        )
        carts = result.scalars().all()

        for cart in carts:
            if not cart.items or cart.user.is_blocked:
                continue

            # Ищем существующую запись об оставлении
            ab_result = await db.execute(
                select(AbandonedCart).where(AbandonedCart.user_id == cart.user_id)
            )
            abandoned = ab_result.scalar_one_or_none()

            if abandoned is None:
                # Первый раз — создаём запись и шлём первое напоминание
                snapshot = {
                    "items_count": cart.items_count,
                    "total": str(cart.total),
                }
                abandoned = AbandonedCart(
                    user_id=cart.user_id,
                    cart_snapshot=snapshot,
                )
                db.add(abandoned)
                await db.flush()

                # Отправляем напоминание
                send_abandoned_cart_reminder.delay(
                    str(cart.user_id),
                    cart.user.telegram_id,
                    cart.items_count,
                    float(cart.total),
                    reminder_num=1,
                )
                abandoned.reminder_sent = True
                abandoned.reminder_sent_at = datetime.now(timezone.utc)

            elif (
                not abandoned.second_reminder_sent
                and abandoned.reminder_sent_at
                and datetime.now(timezone.utc) - abandoned.reminder_sent_at
                > timedelta(hours=24)
            ):
                # Второе напоминание через 24ч
                send_abandoned_cart_reminder.delay(
                    str(cart.user_id),
                    cart.user.telegram_id,
                    cart.items_count,
                    float(cart.total),
                    reminder_num=2,
                )
                abandoned.second_reminder_sent = True


def _email_cart_reminder(user_id: str, text: str) -> None:
    """Напоминание о корзине письмом (реклама: согласие + ссылка «Отписаться»)."""
    from sqlalchemy import create_engine, text as sa_text
    from sqlalchemy.orm import Session
    from shared.mailer import promo_email, send_email_sync

    if not settings.EMAIL_NOTIFICATIONS_ENABLED:
        return  # на почту пока только коды входа
    engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", "+psycopg2"), pool_pre_ping=True)
    try:
        with Session(engine) as s:
            row = s.execute(
                sa_text("SELECT email, marketing_consent FROM users WHERE id = :id"), {"id": user_id}
            ).fetchone()
    finally:
        engine.dispose()
    if not row or not row[0] or not row[1]:
        return
    subject, html_body, plain = promo_email("Вы оставили товары в корзине", text, "/cart", "Открыть корзину", user_id)
    send_email_sync(row[0], subject, html_body, plain)


@celery_app.task(
    name="worker.tasks.cart_tasks.send_abandoned_cart_reminder",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_abandoned_cart_reminder(
    self,
    user_id: str,
    telegram_id: int,
    items_count: int,
    total: float,
    reminder_num: int = 1,
):
    """Отправляет напоминание о брошенной корзине через Telegram Bot API."""
    import httpx
    from shared.models import is_telegram_id

    from bot.utils.texts import texts

    text = texts.abandoned_cart_reminder(items_count, total)
    if reminder_num == 2:
        text = "⏰ Последнее напоминание!\n\n" + text

    # Пользователь сайта без Telegram: письмо — только с согласием на рассылку
    if not is_telegram_id(telegram_id):
        _email_cart_reminder(user_id, text)
        return

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": telegram_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "reply_markup": {
                        "inline_keyboard": [
                            [
                                {
                                    "text": "🛒 Открыть корзину",
                                    "callback_data": "cart:view",
                                }
                            ]
                        ]
                    },
                },
            )
            response.raise_for_status()
    except Exception as exc:
        logger.warning(
            "Не удалось отправить напоминание о корзине user_id=%s tg_id=%s: %s",
            user_id,
            telegram_id,
            exc,
        )
        raise self.retry(exc=exc)


"""worker/tasks/loyalty_tasks.py — пересчёт лояльности"""


@celery_app.task(name="worker.tasks.loyalty_tasks.recalculate_all_loyalty")
def recalculate_all_loyalty():
    """Пересчитывает уровни лояльности для всех активных пользователей."""
    asyncio.run(_recalculate_all_async())


async def _recalculate_all_async():
    from sqlalchemy import select
    from api.services.loyalty_service import LoyaltyService
    from shared.database.session import get_worker_db_session
    from shared.models import User

    # Уровень считается по тратам за месяц (модель Bybit) — экраны считают его
    # на лету, здесь только освежаем кэш users.loyalty_level_id (админка, аналитика),
    # в т.ч. понижение после смены месяца.
    async with get_worker_db_session() as db:
        svc = LoyaltyService(db)
        offset = 0
        while True:
            users_result = await db.execute(
                select(User).where(User.is_blocked == False)  # noqa: E712
                .order_by(User.id).offset(offset).limit(100)
            )
            users = users_result.scalars().all()
            if not users:
                break
            for user in users:
                await svc.get_status(user)
            offset += 100


"""worker/tasks/order_tasks.py — истечение заказов"""


@celery_app.task(name="worker.tasks.order_tasks.expire_pending_orders")
def expire_pending_orders():
    asyncio.run(_expire_orders_async())


async def _expire_orders_async():
    from sqlalchemy import select
    from datetime import timedelta
    from shared.database.session import get_worker_db_session
    from shared.models import Order, OrderStatus

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    async with get_worker_db_session() as db:
        result = await db.execute(
            select(Order).where(
                Order.status == OrderStatus.pending_payment,
                Order.created_at < cutoff,
            )
        )
        orders = result.scalars().all()

        from api.services.order_service import OrderService

        svc = OrderService(db)

        for order in orders:
            await svc.change_status(
                order,
                OrderStatus.cancelled,
                changed_by_type="system",
                reason="Автоотмена: время оплаты истекло (24ч)",
            )
