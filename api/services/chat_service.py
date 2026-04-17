"""
api/services/chat_service.py
─────────────────────────────────────────────────────────────────────────────
Сервис чата покупателя с продавцом.
Один постоянный чат на пользователя (telegram_id).
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
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
        text: str,
    ) -> ChatMessage:
        """
        Добавляет сообщение в чат.
        sender_type: "user" | "admin" | "system"
        """
        msg = ChatMessage(
            chat_id=chat_id,
            sender_type=sender_type,
            text=text,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def add_system_message(self, telegram_id: int, text: str) -> ChatMessage:
        """
        Добавляет системное сообщение в чат пользователя.
        Если чат не существует — создаёт.
        """
        chat = await self.get_or_create_chat(telegram_id)
        return await self.send_message(chat.id, "system", text)
