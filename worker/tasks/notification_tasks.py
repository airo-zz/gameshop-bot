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
