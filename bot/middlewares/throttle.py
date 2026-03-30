"""
bot/middlewares/throttle.py — антиспам rate limiting через Redis
bot/middlewares/logging.py  — структурированное логирование событий
"""

import time
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery, TelegramObject
import redis.asyncio as aioredis

from shared.config import settings

log = structlog.get_logger()


# ── ThrottleMiddleware ────────────────────────────────────────────────────────

class ThrottleMiddleware(BaseMiddleware):
    """
    Rate limiting через Redis.
    Считает количество запросов за 60 секунд.
    При превышении — отправляет предупреждение (один раз в минуту).
    """

    def __init__(self, rate_limit: int = 30):
        self.rate_limit = rate_limit
        self.redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self.redis is None:
            self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self.redis

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        if user is None:
            return await handler(event, data)

        redis = await self._get_redis()
        key = f"throttle:{user.id}"
        warn_key = f"throttle_warn:{user.id}"

        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 60)

        if count > self.rate_limit:
            # Отправляем предупреждение только раз в минуту
            already_warned = await redis.get(warn_key)
            if not already_warned:
                await redis.setex(warn_key, 60, "1")
                if isinstance(event, Message):
                    await event.answer(
                        "⚠️ Слишком много запросов. Подожди минуту."
                    )
                elif isinstance(event, CallbackQuery):
                    await event.answer("⚠️ Слишком много запросов!", show_alert=True)
            return  # Блокируем обработку

        return await handler(event, data)


# ── LoggingMiddleware ─────────────────────────────────────────────────────────

class LoggingMiddleware(BaseMiddleware):
    """
    Структурированное логирование каждого события.
    Пишет: user_id, event_type, text/data, время обработки.
    """

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user = data.get("event_from_user")
        start = time.monotonic()

        event_type = type(event).__name__
        event_data: dict[str, Any] = {
            "event_type": event_type,
            "user_id": tg_user.id if tg_user else None,
            "username": tg_user.username if tg_user else None,
        }

        if isinstance(event, Message):
            event_data["text"] = (event.text or "")[:100]
        elif isinstance(event, CallbackQuery):
            event_data["callback_data"] = event.data

        try:
            result = await handler(event, data)
            elapsed = time.monotonic() - start
            log.info("bot.event", **event_data, elapsed_ms=round(elapsed * 1000))
            return result
        except Exception as exc:
            elapsed = time.monotonic() - start
            log.error(
                "bot.event.error",
                **event_data,
                elapsed_ms=round(elapsed * 1000),
                error=str(exc),
                exc_info=True,
            )
            raise
