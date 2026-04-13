"""
api/bot_instance.py
───────────────────────────────────────────────────────────────────────────────
Синглтон aiogram Bot для отправки уведомлений из API-слоя.
Инициализируется лениво при первом вызове get_bot().
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aiogram import Bot

_bot: "Bot | None" = None


def get_bot() -> "Bot":
    global _bot
    if _bot is None:
        from aiogram import Bot
        from shared.config import settings
        _bot = Bot(token=settings.BOT_TOKEN)
    return _bot
