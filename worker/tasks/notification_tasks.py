"""worker/tasks/notification_tasks.py — отправка уведомлений"""
import httpx
from worker.main import celery_app
from shared.config import settings


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
    """
    if not telegram_id:
        return

    token = settings.effective_support_token
    formatted = f"💬 <b>Ответ поддержки</b>\n\n{text}"

    payload = {
        "chat_id": telegram_id,
        "text": formatted,
        "parse_mode": "HTML",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json=payload,
            )
            if resp.status_code != 200:
                raise Exception(f"Telegram API error: {resp.text}")
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="worker.tasks.notification_tasks.notify_operators_new_ticket",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def notify_operators_new_ticket(self, ticket_id: str, subject: str, message_preview: str):
    """
    Уведомляет группу операторов о новом тикете.
    Отправляет в Telegram группу (SUPPORT_NOTIFY_CHAT_ID).
    """
    chat_id = settings.SUPPORT_NOTIFY_CHAT_ID
    if not chat_id:
        return

    token = settings.effective_support_token
    text = (
        f"🆕 <b>Новый тикет</b>\n\n"
        f"<b>Тема:</b> {subject}\n"
        f"<b>Сообщение:</b> {message_preview}\n\n"
        f"Откройте панель поддержки для ответа."
    )

    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json=payload,
            )
            if resp.status_code != 200:
                raise Exception(f"Telegram API error: {resp.text}")
    except Exception as exc:
        raise self.retry(exc=exc)
