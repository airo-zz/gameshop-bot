"""worker/tasks/notification_tasks.py — отправка уведомлений"""
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
    from shared.models import is_telegram_id

    if not is_telegram_id(telegram_id):
        return  # пользователь сайта без Telegram

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
    from shared.models import is_telegram_id

    if not is_telegram_id(telegram_id):
        return

    # Краткое уведомление с кнопкой перехода в чат
    import html as _html
    preview = _html.escape(text[:120]) + ("..." if len(text) > 120 else "")
    formatted = f"💬 <b>Новый ответ в поддержке</b>\n<i>{preview}</i>"

    reply_markup = None
    if ticket_id:
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
                if resp.status_code in (400, 403):
                    # 400 chat not found / 403 blocked — юзер не открывал этот
                    # бот; пробуем следующий. Ретрай тут не поможет.
                    continue
                raise Exception(f"Telegram API error: {resp.text}")
        logger.info("notify_support_user: user %s недоступен ни в одном боте", telegram_id)
    except Exception as exc:
        raise self.retry(exc=exc)


def _send_group_message(text: str, ticket_id: str) -> None:
    """Уведомление персоналу о тикете (группа или личка админов, см. shared.staff_notify)."""
    from shared.staff_notify import send_staff_sync

    markup = {
        "inline_keyboard": [[{
            "text": "Открыть обращение",
            "url": f"https://t.me/{settings.BOT_USERNAME}?startapp=admin_ticket_{ticket_id}",
        }]]
    }
    send_staff_sync(text, markup)


@celery_app.task(
    name="worker.tasks.notification_tasks.notify_operators_new_ticket",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def notify_operators_new_ticket(self, ticket_id: str, subject: str, message_preview: str, user_name: str = "") -> None:
    """Уведомление персоналу о новом тикете."""
    import html as _html

    text = (
        f"🆘 <b>Новое обращение</b>\n"
        f"От: {_html.escape(user_name or '—')}\n"
        f"<i>{_html.escape(message_preview or '')}</i>"
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
    """Уведомление персоналу о новом сообщении в существующем тикете."""

    import html as _html

    ticket_id_short = ticket_id[:8]
    text = (
        f"<b>Сообщение в обращении #{ticket_id_short}</b>\n"
        f"От: {_html.escape(user_name or '—')}\n"
        f"<i>{_html.escape(message_preview or '')}</i>"
    )

    try:
        _send_group_message(text, ticket_id)
    except Exception as exc:
        raise self.retry(exc=exc)
