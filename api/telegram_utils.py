"""
api/telegram_utils.py
─────────────────────
Утилиты для отправки Telegram-сообщений из API-слоя через httpx.
Используется вместо aiogram (который не установлен в API-контейнере).

Пользователям, зарегистрированным на сайте по почте (служебный ID, см.
shared.models.is_telegram_id), вместо сообщения бота уходит письмо.
"""
from __future__ import annotations

import logging
import re

import httpx

from shared.config import settings
from shared.models import is_telegram_id

logger = logging.getLogger(__name__)


def _subject_from(text: str) -> str:
    """Тема письма — первая непустая строка сообщения без разметки и эмодзи."""
    import html as _html

    for line in text.splitlines():
        plain = _html.unescape(re.sub(r"<[^>]+>", "", line))
        plain = re.sub(r"[^\w\s.,:;!?()«»№#%+\-—–/₽$]", "", plain).strip()
        if plain:
            return plain[:120]
    return f"Уведомление {settings.SHOP_NAME}"


async def _email_user(telegram_id: int, text: str, path: str, button: str) -> None:
    from sqlalchemy import select

    from shared.database.session import get_db_session
    from shared.mailer import notice_email, send_email
    from shared.models import User

    async with get_db_session() as session:
        email = (
            await session.execute(select(User.email).where(User.telegram_id == telegram_id))
        ).scalar_one_or_none()
    if not email:
        logger.info("notify: у пользователя tg_id=%s нет ни Telegram, ни почты", telegram_id)
        return
    subject, html_body, plain = notice_email(_subject_from(text), text, path, button)
    await send_email(email, subject, html_body, plain)


async def send_tg_message(
    telegram_id: int,
    text: str,
    reply_markup: dict | None = None,
    *,
    email_path: str = "/",
    email_button: str = "Открыть сайт",
) -> None:
    """
    Отправляет Telegram-сообщение через Bot API. Не бросает исключений.
    Почтовому пользователю — письмо с кнопкой на страницу сайта email_path.
    """
    if not is_telegram_id(telegram_id):
        try:
            await _email_user(telegram_id, text, email_path, email_button)
        except Exception as exc:
            logger.warning("notify email error tg_id=%s: %s", telegram_id, exc)
        return

    payload: dict = {
        "chat_id": telegram_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
        data = resp.json()
        if not data.get("ok"):
            logger.warning("send_tg_message failed tg_id=%s: %s", telegram_id, data.get("description"))
    except Exception as exc:
        logger.warning("send_tg_message error tg_id=%s: %s", telegram_id, exc)
