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
    if not settings.SUPPORT_NOTIFY_CHAT_ID and not settings.BOT_TOKEN:
        return

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

            preview = ""
            if msg_result and msg_result[0]:
                preview = msg_result[0][:120]

            user_label = f"@{username}" if username else f"ID: {user_id}"
            if first_name:
                user_label = f"{first_name} ({user_label})"

            text = (
                f"<b>Новое сообщение от покупателя</b>\n"
                f"Пользователь: {user_label}\n"
                f"<i>{preview}</i>"
            )

            # Кнопка для перехода в admin-панель чата
            reply_markup = None
            if settings.MINIAPP_URL or settings.BOT_USERNAME:
                chat_url = (
                    f"{settings.MINIAPP_URL.rstrip('/')}/admin/chats/{chat_id}"
                    if settings.MINIAPP_URL
                    else f"https://t.me/{settings.BOT_USERNAME}/app"
                )
                reply_markup = {
                    "inline_keyboard": [[{
                        "text": "Открыть чат",
                        "url": chat_url,
                    }]]
                }

            # Отправляем в notify chat (группа операторов/admin)
            notify_chat_id = settings.SUPPORT_NOTIFY_CHAT_ID
            if not notify_chat_id:
                return

            import json
            payload: dict = {
                "chat_id": notify_chat_id,
                "text": text,
                "parse_mode": "HTML",
            }
            if reply_markup:
                payload["reply_markup"] = json.dumps(reply_markup)

            tokens = []
            if settings.SUPPORT_BOT_TOKEN and settings.SUPPORT_BOT_TOKEN != settings.BOT_TOKEN:
                tokens.append(settings.SUPPORT_BOT_TOKEN)
            tokens.append(settings.BOT_TOKEN)

            with httpx.Client(timeout=10.0) as client:
                for token in tokens:
                    resp = client.post(
                        f"https://api.telegram.org/bot{token}/sendMessage",
                        json=payload,
                    )
                    if resp.status_code == 200:
                        return
                    logger.warning("notify_seller failed token=%s... status=%s", token[:10], resp.status_code)
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
    Вызывается через 10 минут после сообщения admin'а.
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
                if resp.status_code not in (200, 403):
                    raise Exception(f"Telegram API error: {resp.text}")
        finally:
            session.close()
            engine.dispose()

    except Exception as exc:
        raise self.retry(exc=exc)
