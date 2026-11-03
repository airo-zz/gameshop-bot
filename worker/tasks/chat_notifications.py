"""worker/tasks/chat_notifications.py — уведомления чата продавец ↔ покупатель"""
import logging
import httpx
from worker.main import celery_app
from shared.config import settings

logger = logging.getLogger(__name__)


def _get_db_session():
    """Синхронная сессия для Celery-задач."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    return Session(engine), engine


_ORDER_STATUS_LABELS = {
    "new": "создан", "pending_payment": "ждёт оплаты", "paid": "оплачен",
    "processing": "в работе", "clarification": "уточнение", "completed": "выполнен",
    "cancelled": "отменён", "refunded": "возврат",
}


def _notice_mark(chat_id: str, last_message_at: str | None = None) -> str | None:
    """Отметка «об этой пачке сообщений персоналу уже писали».
    Без last_message_at — прочитать, с ним — поставить (после успешной отправки)."""
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            key = f"staff_chat_notified:{chat_id}"
            if last_message_at is None:
                return r.get(key)
            r.set(key, last_message_at, ex=7 * 24 * 3600)
        finally:
            r.close()
    except Exception:
        pass  # без Redis лучше дубль, чем пропуск
    return None


def _email_chat_notice(session, user_id: int) -> None:
    from sqlalchemy import text as sa_text
    from shared.mailer import notice_email, send_email_sync

    if not settings.EMAIL_NOTIFICATIONS_ENABLED:
        return  # на почту пока только коды входа

    email = session.execute(
        sa_text("SELECT email FROM users WHERE telegram_id = :tg"), {"tg": user_id}
    ).scalar()
    if not email:
        return
    subject, html_body, plain = notice_email(
        "Новое сообщение от оператора",
        "<b>Оператор ответил вам в чате.</b>\nОткройте чат на сайте, чтобы прочитать сообщение и ответить.",
        "/chat",
        "Открыть чат",
    )
    send_email_sync(email, subject, html_body, plain)


@celery_app.task(
    name="worker.tasks.chat_notifications.notify_seller_if_unread",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def notify_seller_if_unread(self, chat_id: str) -> None:
    """
    Вызывается через 30 секунд после сообщения пользователя.
    Если admin НЕ прочитал (last_admin_read_at < last_message_at или NULL) —
    отправляет уведомление продавцу.
    """
    try:
        session, engine = _get_db_session()
        try:
            import html as _html

            from sqlalchemy import text as sa_text

            from shared.models.user import staff_user_label
            result = session.execute(
                sa_text("""
                    SELECT c.id, c.user_id, c.last_message_at, c.last_admin_read_at,
                           u.username, u.first_name, u.email, coalesce(u.is_guest, false),
                           o.order_number, o.status
                    FROM chats c
                    LEFT JOIN users u ON u.telegram_id = c.user_id
                    LEFT JOIN orders o ON o.id = c.order_id
                    WHERE c.id = :chat_id
                """),
                {"chat_id": chat_id},
            ).fetchone()

            if result is None:
                return

            (chat_id_val, user_id, last_message_at, last_admin_read_at,
             username, first_name, email, is_guest, order_number, order_status) = result

            # Проверяем: непрочитано если last_admin_read_at IS NULL или < last_message_at
            if last_message_at is None:
                return
            if last_admin_read_at is not None and last_admin_read_at >= last_message_at:
                return

            # Покупатель пишет несколькими сообщениями подряд — каждое ставит задачу.
            # Одно уведомление на пачку: пропускаем, если об этом last_message_at уже писали.
            if _notice_mark(str(chat_id_val)) == last_message_at.isoformat():
                return

            # Все непрочитанные сообщения покупателя (последние 5), а не только последнее
            rows = session.execute(
                sa_text("""
                    SELECT text, coalesce(array_length(attachments, 1), 0) FROM chat_messages
                    WHERE chat_id = :chat_id AND sender_type = 'user'
                      AND (CAST(:read_at AS timestamptz) IS NULL OR created_at > :read_at)
                    ORDER BY created_at DESC
                    LIMIT 5
                """),
                {"chat_id": chat_id, "read_at": last_admin_read_at},
            ).fetchall()

            parts = []
            for msg_text, n_att in reversed(rows):
                line = _html.escape((msg_text or "").strip()[:700])
                if n_att:
                    line = (line + "\n" if line else "") + f"[фото: {n_att}]"
                if line:
                    parts.append(line)
            body = "\n\n".join(parts)[:2500] or "[вложение]"

            buyer = _html.escape(staff_user_label(user_id, username, first_name, email, is_guest))
            head = "<b>СООБЩЕНИЕ</b>"
            if order_number:
                head += f" · Заказ {_html.escape(str(order_number))}"
                status = _ORDER_STATUS_LABELS.get(str(order_status or ""), "")
                if status:
                    head += f" ({status})"

            text = (
                f"{head}\n"
                f"От: {buyer}\n\n"
                f"{body}\n\n"
                "<i>Ответьте на это сообщение (Reply), чтобы написать клиенту.</i>"
            )

            reply_markup = {
                "inline_keyboard": [[{
                    "text": "Открыть чат",
                    "url": f"{settings.ADMIN_ORIGIN}/admin/chats/{chat_id_val}",
                }]]
            }

            from shared.staff_notify import send_staff_sync
            send_staff_sync(text, reply_markup, reply_chat_id=str(chat_id_val))
            _notice_mark(str(chat_id_val), last_message_at.isoformat())
        finally:
            session.close()
            engine.dispose()

    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="worker.tasks.chat_notifications.notify_user_if_unread",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
)
def notify_user_if_unread(self, chat_id: str) -> None:
    """
    Вызывается через ~15 секунд после сообщения admin'а.
    Если пользователь НЕ прочитал (last_user_read_at < last_message_at или NULL) —
    отправляет уведомление в Telegram.
    """
    if not settings.BOT_TOKEN:
        return

    try:
        session, engine = _get_db_session()
        try:
            from sqlalchemy import text as sa_text
            result = session.execute(
                sa_text("""
                    SELECT user_id, last_message_at, last_user_read_at
                    FROM chats
                    WHERE id = :chat_id
                """),
                {"chat_id": chat_id},
            ).fetchone()

            if result is None:
                return

            user_id, last_message_at, last_user_read_at = result

            if last_message_at is None:
                return
            if last_user_read_at is not None and last_user_read_at >= last_message_at:
                return

            from shared.models import is_telegram_id

            if not is_telegram_id(user_id):
                # Пользователь сайта, вошедший по почте — уведомляем письмом
                _email_chat_notice(session, user_id)
                return

            text = (
                "<b>У вас новое сообщение от продавца</b>\n\n"
                "Откройте чат для ответа."
            )

            reply_markup = None
            if settings.BOT_USERNAME:
                reply_markup = {
                    "inline_keyboard": [[{
                        "text": "Открыть чат",
                        "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=chat",
                    }]]
                }

            import json
            payload: dict = {
                "chat_id": user_id,
                "text": text,
                "parse_mode": "HTML",
            }
            if reply_markup:
                payload["reply_markup"] = json.dumps(reply_markup)

            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                    json=payload,
                )
                if resp.status_code == 403:
                    # Клиент заблокировал бота или ни разу его не запускал —
                    # ретраи бессмысленны, но фиксируем, чтобы было видно в логах
                    logger.warning(
                        "chat notify: бот не может написать user %s (chat %s): %s",
                        user_id, chat_id, resp.text,
                    )
                elif resp.status_code != 200:
                    raise Exception(f"Telegram API error: {resp.text}")
        finally:
            session.close()
            engine.dispose()

    except Exception as exc:
        raise self.retry(exc=exc)
