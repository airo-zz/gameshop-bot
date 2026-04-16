"""worker/tasks/notification_tasks.py — отправка уведомлений"""
import json
import logging
import httpx
from worker.main import celery_app
from shared.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="worker.tasks.notification_tasks.send_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_notification(self, telegram_id: int, text: str, reply_markup: dict | None = None):
    """
    Универсальная задача отправки сообщения пользователю.
    Используется из сервисов для асинхронных уведомлений.

    Пример:
        send_notification.delay(123456789, "✅ Ваш заказ выполнен!")
    """
    payload = {
        "chat_id": telegram_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
            if resp.status_code != 200:
                raise Exception(f"Telegram API error: {resp.text}")
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="worker.tasks.notification_tasks.broadcast")
def broadcast(user_ids: list[int], text: str):
    """
    Рассылка сообщения группе пользователей (акции, объявления).
    Отправляет через send_notification с задержкой во избежание flood.
    """
    import time
    for i, tg_id in enumerate(user_ids):
        send_notification.delay(tg_id, text)
        if i % 25 == 0:  # Каждые 25 сообщений — небольшая пауза
            time.sleep(1)


# ── Support notifications ────────────────────────────────────────────────


@celery_app.task(
    name="worker.tasks.notification_tasks.notify_support_user",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def notify_support_user(self, telegram_id: int, text: str, ticket_id: str | None = None):
    """
    Отправляет сообщение юзеру через бот поддержки.
    Используется когда оператор отвечает на тикет или закрывает его.
    При 403 от support bot (пользователь не писал в него) — fallback на основной бот.
    """
    if not telegram_id:
        return

    # Краткое уведомление с кнопкой перехода в чат
    preview = text[:120] + ("..." if len(text) > 120 else "")
    formatted = f"💬 <b>Новый ответ в поддержке</b>\n<i>{preview}</i>"

    reply_markup = None
    if ticket_id and settings.MINIAPP_URL:
        miniapp_url = settings.MINIAPP_URL.rstrip("/")
        reply_markup = {
            "inline_keyboard": [[{
                "text": "Открыть чат",
                "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=support_{ticket_id}",
            }]]
        }

    payload: dict = {"chat_id": telegram_id, "text": formatted, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup

    tokens_to_try = []
    support_token = settings.SUPPORT_BOT_TOKEN
    if support_token and support_token != settings.BOT_TOKEN:
        tokens_to_try.append(support_token)
    tokens_to_try.append(settings.BOT_TOKEN)

    try:
        with httpx.Client(timeout=10.0) as client:
            for token in tokens_to_try:
                resp = client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json=payload,
                )
                if resp.status_code == 200:
                    return
                if resp.status_code == 403:
                    continue
                raise Exception(f"Telegram API error: {resp.text}")
            raise Exception(f"All tokens failed for user {telegram_id}")
    except Exception as exc:
        raise self.retry(exc=exc)


def _send_group_message(text: str, ticket_id: str) -> None:
    """
    Отправляет сообщение в группу операторов.
    Пробует support bot, при 403/400 — fallback на основной бот.
    """
    chat_id = settings.SUPPORT_NOTIFY_CHAT_ID
    if not chat_id:
        return

    markup = json.dumps({
        "inline_keyboard": [[
            {
                "text": "Открыть в операторской панели",
                "url": f"{settings.FRONTEND_URL}/app/admin/support?ticket={ticket_id}",
            }
        ]]
    })
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "reply_markup": markup}

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
            logger.error(
                "Group notify failed token=%s... status=%s body=%s",
                token[:10], resp.status_code, resp.text,
            )
            if resp.status_code in (400, 403):
                continue
            raise Exception(f"Telegram API error: {resp.text}")
        raise Exception(f"All tokens failed for group chat {chat_id}")


@celery_app.task(
    name="worker.tasks.notification_tasks.notify_operators_new_ticket",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def notify_operators_new_ticket(self, ticket_id: str, subject: str, message_preview: str, user_name: str = "") -> None:
    """Уведомление в группу операторов о новом тикете."""
    if not settings.SUPPORT_NOTIFY_CHAT_ID:
        return

    text = (
        f"<b>Новое обращение</b>\n"
        f"От: {user_name}\n"
        f"{message_preview}"
    )

    try:
        _send_group_message(text, ticket_id)
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="worker.tasks.notification_tasks.notify_operators_new_message",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def notify_operators_new_message(self, ticket_id: str, user_name: str, message_preview: str) -> None:
    """Уведомление в группу операторов о новом сообщении в существующем тикете."""
    if not settings.SUPPORT_NOTIFY_CHAT_ID:
        return

    ticket_id_short = ticket_id[:8]
    text = (
        f"<b>Сообщение в обращении #{ticket_id_short}</b>\n"
        f"От: {user_name}\n"
        f"{message_preview}"
    )

    try:
        _send_group_message(text, ticket_id)
    except Exception as exc:
        raise self.retry(exc=exc)
