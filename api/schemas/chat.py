"""
api/schemas/chat.py
─────────────────────────────────────────────────────────────────────────────
Pydantic схемы для чата.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class ChatOut(BaseModel):
    id: uuid.UUID
    user_id: int
    created_at: datetime
    unread_count: int = 0

    model_config = {"from_attributes": True}


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    chat_id: uuid.UUID
    sender_type: str
    text: str | None
    attachments: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    text: str | None = None
    attachments: list[str] = []


# ── Admin schemas ─────────────────────────────────────────────────────────────

class AdminChatUserInfo(BaseModel):
    telegram_id: int
    username: str | None = None
    first_name: str = ""


class AdminChatListItem(BaseModel):
    id: uuid.UUID
    user: AdminChatUserInfo
    last_message_preview: str | None = None
    last_message_at: datetime | None = None
    admin_unread_count: int = 0

    model_config = {"from_attributes": True}


class AdminChatDetail(BaseModel):
    id: uuid.UUID
    user: AdminChatUserInfo
    created_at: datetime
    last_message_at: datetime | None = None
    messages: list[ChatMessageOut] = []

    model_config = {"from_attributes": True}


class AdminSendMessageRequest(BaseModel):
    text: str | None = None
    attachments: list[str] = []


class AdminNotifyRequest(BaseModel):
    text: str | None = None
