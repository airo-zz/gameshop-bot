"""
bot/middlewares/admin_auth.py
─────────────────────────────────────────────────────────────────────────────
Middleware и декоратор для проверки прав администратора.
─────────────────────────────────────────────────────────────────────────────
"""

import functools
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery, TelegramObject
from sqlalchemy import select

from shared.database.session import async_session_factory
from shared.models import AdminUser


class AdminAuthMiddleware(BaseMiddleware):
    """
    Проверяет что пользователь является администратором.
    Если нет — молча игнорирует (бот не реагирует на чужих).
    Если да — пробрасывает admin в data["admin"].
    """

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user = data.get("event_from_user")
        if tg_user is None:
            return

        async with async_session_factory() as session:
            result = await session.execute(
                select(AdminUser)
                .where(
                    AdminUser.telegram_id == tg_user.id,
                    AdminUser.is_active == True,
                )
            )
            admin = result.scalar_one_or_none()

            if admin is None:
                # Не администратор — игнорируем
                if isinstance(event, Message):
                    await event.answer("🚫 Доступ запрещён.")
                elif isinstance(event, CallbackQuery):
                    await event.answer("🚫 Доступ запрещён.", show_alert=True)
                return

            data["admin"] = admin
            data["db"] = session
            result = await handler(event, data)
            await session.commit()
            return result


def require_permission(permission: str):
    """
    Декоратор для проверки конкретного права.

    Пример:
        @require_permission("games.create")
        async def handler(call, db, admin):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # admin приходит из data (kwargs)
            admin: AdminUser | None = kwargs.get("admin")
            event = args[0] if args else None

            if admin is None or not admin.has_permission(permission):
                if isinstance(event, CallbackQuery):
                    await event.answer(
                        f"🚫 Нет прав: {permission}", show_alert=True
                    )
                elif isinstance(event, Message):
                    await event.answer(f"🚫 Нет прав: {permission}")
                return

            return await func(*args, **kwargs)
        return wrapper
    return decorator


"""
bot/utils/admin_log.py
─────────────────────────────────────────────────────────────────────────────
Утилита записи действий администратора в лог.
─────────────────────────────────────────────────────────────────────────────
"""
