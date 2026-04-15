"""
support_bot/middlewares/auth.py
─────────────────────────────────────────────────────────────────────────────
Middleware авторизации для бота поддержки.
НЕ создаёт новых пользователей — только ищет существующих.
─────────────────────────────────────────────────────────────────────────────
"""

from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery, TelegramObject, User as TgUser
from sqlalchemy import select

from shared.database.session import async_session_factory
from shared.models import User
from support_bot.utils.texts import texts


class SupportAuthMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user: TgUser | None = data.get("event_from_user")
        if tg_user is None or tg_user.is_bot:
            return await handler(event, data)

        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.telegram_id == tg_user.id)
            )
            user = result.scalar_one_or_none()

            if user is None:
                # Незарегистрированный юзер
                if isinstance(event, Message):
                    await event.answer(texts.no_account)
                elif isinstance(event, CallbackQuery):
                    await event.answer(texts.no_account, show_alert=True)
                return

            if user.is_blocked:
                if isinstance(event, Message):
                    await event.answer(texts.error_blocked)
                elif isinstance(event, CallbackQuery):
                    await event.answer(texts.error_blocked, show_alert=True)
                return

            data["user"] = user
            data["db"] = session

            result = await handler(event, data)
            await session.commit()
            return result
