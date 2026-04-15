"""
api/schemas/support.py
─────────────────────────────────────────────────────────────────────────────
Pydantic схемы для системы поддержки (клиент + админ).
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Client schemas ───────────────────────────────────────────────────────────


class CreateTicketRequest(BaseModel):
    subject: str = Field(max_length=256)
    message: str = Field(max_length=4000)
    order_id: str | None = None
    attachments: list[str] = Field(default_factory=list)


class ReplyTicketRequest(BaseModel):
    text: str = Field(max_length=4000)
    attachments: list[str] = Field(default_factory=list)


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    status: str
    created_at: datetime
    closed_at: datetime | None = None


class TicketMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sender_type: str
    sender_id: uuid.UUID
    text: str
    attachments: list[str] = Field(default_factory=list)
    is_template_response: bool = False
    created_at: datetime


# ── Admin schemas ────────────────────────────────────────────────────────────


class TicketUserInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_id: int
    username: str | None = None
    first_name: str = ""


class TicketAssigneeInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str | None = None
    first_name: str = ""


class AdminTicketListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    status: str
    order_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    created_at: datetime
    closed_at: datetime | None = None
    user: TicketUserInfo | None = None
    assigned_to: TicketAssigneeInfo | None = None


class AdminTicketDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    status: str
    order_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    created_at: datetime
    closed_at: datetime | None = None
    user: TicketUserInfo | None = None
    assigned_to: TicketAssigneeInfo | None = None
    messages: list[TicketMessageOut] = Field(default_factory=list)


class AdminReplyRequest(BaseModel):
    text: str = Field(max_length=4000)
    attachments: list[str] = Field(default_factory=list)
    is_template: bool = False


class StatusChangeRequest(BaseModel):
    status: str


class AssignRequest(BaseModel):
    admin_id: uuid.UUID | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    text: str
    category: str | None = None
