"""
bot/middlewares/auth.py
─────────────────────────────────────────────────────────────────────────────
Middleware авторизации:
  1. При первом сообщении — создаёт пользователя в БД
  2. Обновляет last_active_at
  3. Блокирует заблокированных пользователей
  4. Пробрасывает объект User в handler через data["user"]
─────────────────────────────────────────────────────────────────────────────
"""

from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery, TelegramObject, User as TgUser
from sqlalchemy import select

from shared.database.session import async_session_factory
from shared.models import User, LoyaltyLevel
from bot.utils.texts import texts


class AuthMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        # Получаем Telegram пользователя из события
        tg_user: TgUser | None = data.get("event_from_user")
        if tg_user is None or tg_user.is_bot:
            return await handler(event, data)

        async with async_session_factory() as session:
            # Ищем пользователя в БД
            result = await session.execute(
                select(User).where(User.telegram_id == tg_user.id)
            )
            user = result.scalar_one_or_none()

            if user is None:
                # Новый пользователь — регистрируем
                user = await self._register_user(session, tg_user, data)
            else:
                # Обновляем данные профиля если изменились
                await self._update_user_info(session, user, tg_user)

            # Блокируем заблокированных
            if user.is_blocked:
                if isinstance(event, Message):
                    await event.answer(texts.error_blocked)
                elif isinstance(event, CallbackQuery):
                    await event.answer(texts.error_blocked, show_alert=True)
                return  # Прерываем обработку

            # Пробрасываем user в handler
            data["user"] = user
            data["db"] = session

            return await handler(event, data)

    async def _register_user(
        self, session, tg_user: TgUser, data: dict
    ) -> User:
        """Создать нового пользователя."""
        from datetime import datetime, timezone

        # Проверяем реферальный код из start payload
        referred_by_id = None
        start_payload = data.get("command", {})
        if hasattr(start_payload, "args") and start_payload.args:
            referral_code = start_payload.args
            ref_result = await session.execute(
                select(User).where(User.referral_code == referral_code)
            )
            referrer = ref_result.scalar_one_or_none()
            if referrer:
                referred_by_id = referrer.id

        # Получаем начальный уровень лояльности (Bronze)
        loyalty_result = await session.execute(
            select(LoyaltyLevel)
            .where(LoyaltyLevel.is_active == True)
            .order_by(LoyaltyLevel.priority.asc())
            .limit(1)
        )
        bronze = loyalty_result.scalar_one_or_none()

        user = User(
            telegram_id=tg_user.id,
            username=tg_user.username,
            first_name=tg_user.first_name or "",
            last_name=tg_user.last_name,
            language_code=tg_user.language_code or "ru",
            referred_by_id=referred_by_id,
            loyalty_level_id=bronze.id if bronze else None,
            last_active_at=datetime.now(timezone.utc),
        )
        session.add(user)
        await session.flush()  # Получаем user.id без commit
        return user

    async def _update_user_info(self, session, user: User, tg_user: TgUser) -> None:
        """Обновить изменившиеся данные профиля."""
        from datetime import datetime, timezone

        changed = False
        if user.username != tg_user.username:
            user.username = tg_user.username
            changed = True
        if user.first_name != (tg_user.first_name or ""):
            user.first_name = tg_user.first_name or ""
            changed = True

        user.last_active_at = datetime.now(timezone.utc)
        if changed:
            session.add(user)
