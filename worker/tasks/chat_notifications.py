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
            from sqlalchemy import text as sa_text
            result = session.execute(
                sa_text("""
                    SELECT c.id, c.user_id, c.last_message_at, c.last_admin_read_at,
                           u.username, u.first_name
                    FROM chats c
                    LEFT JOIN users u ON u.telegram_id = c.user_id
                    WHERE c.id = :chat_id
                """),
                {"chat_id": chat_id},
            ).fetchone()

            if result is None:
                return

            chat_id_val, user_id, last_message_at, last_admin_read_at, username, first_name = result

            # Проверяем: непрочитано если last_admin_read_at IS NULL или < last_message_at
            if last_message_at is None:
                return
            if last_admin_read_at is not None and last_admin_read_at >= last_message_at:
                return

            # Берём preview последнего сообщения
            msg_result = session.execute(
                sa_text("""
                    SELECT text FROM chat_messages
                    WHERE chat_id = :chat_id AND sender_type = 'user'
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"chat_id": chat_id},
            ).fetchone()

            import html as _html
            preview = "[вложение]"
            if msg_result and msg_result[0]:
                preview = _html.escape(msg_result[0][:120])

            user_label = f"@{_html.escape(username)}" if username else f"ID: {user_id}"
            if first_name:
                user_label = f"{_html.escape(first_name)} ({user_label})"

            text = (
                f"<b>Новое сообщение от покупателя</b>\n"
                f"Пользователь: {user_label}\n"
                f"<i>{preview}</i>"
            )

            # Кнопка — сразу в админ-чат Mini App (url-кнопка t.me работает и в группах)
            reply_markup = {
                "inline_keyboard": [[{
                    "text": "Открыть чат",
                    "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=admin_chat_{chat_id_val}",
                }]]
            }

            from shared.staff_notify import send_staff_sync
            send_staff_sync(text, reply_markup)
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
