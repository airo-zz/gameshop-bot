"""
api/services/chat_service.py
─────────────────────────────────────────────────────────────────────────────
Сервис чата покупателя с продавцом.
Один постоянный чат на пользователя (telegram_id).
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.chat import Chat, ChatMessage


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_chat(self, telegram_id: int) -> Chat:
        """
        Возвращает чат пользователя. Создаёт если не существует.
        Идентификатор — telegram_id (BigInteger).
        """
        result = await self.db.execute(
            select(Chat).where(Chat.user_id == telegram_id)
        )
        chat = result.scalar_one_or_none()
        if chat is None:
            chat = Chat(user_id=telegram_id)
            self.db.add(chat)
            await self.db.flush()
        return chat

    async def get_chat_by_id(self, chat_id: uuid.UUID) -> Chat | None:
        """Возвращает чат по ID."""
        result = await self.db.execute(
            select(Chat).where(Chat.id == chat_id)
        )
        return result.scalar_one_or_none()

    async def get_all_chats(self) -> list[Chat]:
        """
        Возвращает все чаты, отсортированные:
        сначала с непрочитанными admin'ом (last_message_at > last_admin_read_at),
        затем по last_message_at DESC.
        """
        result = await self.db.execute(
            select(Chat).order_by(Chat.last_message_at.desc().nullslast())
        )
        return list(result.scalars().all())

    async def get_messages(
        self,
        chat_id: uuid.UUID,
        limit: int = 50,
        after_id: uuid.UUID | None = None,
    ) -> list[ChatMessage]:
        """
        Возвращает сообщения чата.
        after_id — если передан, возвращает только сообщения новее этого ID
        (по created_at).
        """
        query = select(ChatMessage).where(ChatMessage.chat_id == chat_id)

        if after_id is not None:
            # Получаем created_at опорного сообщения
            pivot_result = await self.db.execute(
                select(ChatMessage.created_at).where(ChatMessage.id == after_id)
            )
            pivot_ts = pivot_result.scalar_one_or_none()
            if pivot_ts is not None:
                query = query.where(ChatMessage.created_at > pivot_ts)

        query = query.order_by(ChatMessage.created_at.asc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def send_message(
        self,
        chat_id: uuid.UUID,
        sender_type: str,
        text: str | None,
        attachments: list[str] | None = None,
    ) -> ChatMessage:
        """
        Добавляет сообщение в чат.
        sender_type: "user" | "admin" | "system"
        Обновляет last_message_at чата.
        Запускает Celery-задачи уведомлений.
        """
        now = datetime.now(timezone.utc)

        msg = ChatMessage(
            chat_id=chat_id,
            sender_type=sender_type,
            text=text,
            attachments=attachments or [],
        )
        self.db.add(msg)

        # Обновляем last_message_at чата
        chat_result = await self.db.execute(select(Chat).where(Chat.id == chat_id))
        chat = chat_result.scalar_one_or_none()
        if chat is not None:
            chat.last_message_at = now
            # Если admin пишет — сбрасываем его unread (он только что написал, значит читал)
            if sender_type == "admin":
                chat.last_admin_read_at = now

        await self.db.flush()

        # Celery уведомления запускаем после flush (чтобы данные были в БД)
        self._schedule_notification(str(chat_id), sender_type)

        return msg

    def _schedule_notification(self, chat_id: str, sender_type: str) -> None:
        """Запускает Celery-задачу уведомления в зависимости от типа отправителя."""
        try:
            from worker.tasks.chat_notifications import (
                notify_seller_if_unread,
                notify_user_if_unread,
            )
            if sender_type == "user":
                notify_seller_if_unread.apply_async(args=[chat_id], countdown=30)
            elif sender_type == "admin":
                notify_user_if_unread.apply_async(args=[chat_id], countdown=600)
        except Exception:
            # Celery может быть недоступен — не блокируем основной флоу
            pass

    async def mark_read_by_admin(self, chat_id: uuid.UUID) -> None:
        """Обновляет last_admin_read_at = now()."""
        chat_result = await self.db.execute(select(Chat).where(Chat.id == chat_id))
        chat = chat_result.scalar_one_or_none()
        if chat is not None:
            chat.last_admin_read_at = datetime.now(timezone.utc)
            await self.db.flush()

    async def mark_read_by_user(self, chat_id: uuid.UUID) -> None:
        """Обновляет last_user_read_at = now()."""
        chat_result = await self.db.execute(select(Chat).where(Chat.id == chat_id))
        chat = chat_result.scalar_one_or_none()
        if chat is not None:
            chat.last_user_read_at = datetime.now(timezone.utc)
            await self.db.flush()

    async def get_user_unread_count(self, chat_id: uuid.UUID) -> int:
        """
        Количество непрочитанных пользователем сообщений
        (sender_type=admin или system, created_at > last_user_read_at).
        """
        chat_result = await self.db.execute(select(Chat).where(Chat.id == chat_id))
        chat = chat_result.scalar_one_or_none()
        if chat is None:
            return 0

        query = select(func.count()).select_from(ChatMessage).where(
            ChatMessage.chat_id == chat_id,
            ChatMessage.sender_type.in_(["admin", "system"]),
        )
        if chat.last_user_read_at is not None:
            query = query.where(ChatMessage.created_at > chat.last_user_read_at)

        result = await self.db.execute(query)
        return result.scalar_one() or 0

    async def get_admin_unread_count(self, chat_id: uuid.UUID) -> int:
        """
        Количество непрочитанных admin'ом сообщений
        (sender_type=user, created_at > last_admin_read_at).
        """
        chat_result = await self.db.execute(select(Chat).where(Chat.id == chat_id))
        chat = chat_result.scalar_one_or_none()
        if chat is None:
            return 0

        query = select(func.count()).select_from(ChatMessage).where(
            ChatMessage.chat_id == chat_id,
            ChatMessage.sender_type == "user",
        )
        if chat.last_admin_read_at is not None:
            query = query.where(ChatMessage.created_at > chat.last_admin_read_at)

        result = await self.db.execute(query)
        return result.scalar_one() or 0

    async def add_system_message(self, telegram_id: int, text: str) -> ChatMessage:
        """
        Добавляет системное сообщение в чат пользователя.
        Если чат не существует — создаёт.
        """
        chat = await self.get_or_create_chat(telegram_id)
        return await self.send_message(chat.id, "system", text)
