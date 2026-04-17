"""
api/telegram_utils.py
─────────────────────
Утилиты для отправки Telegram-сообщений из API-слоя через httpx.
Используется вместо aiogram (который не установлен в API-контейнере).
"""
from __future__ import annotations

import logging

import httpx

from shared.config import settings

logger = logging.getLogger(__name__)


async def send_tg_message(
    telegram_id: int,
    text: str,
    reply_markup: dict | None = None,
) -> None:
    """Отправляет Telegram-сообщение через Bot API. Не бросает исключений."""
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
