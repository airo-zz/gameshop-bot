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


