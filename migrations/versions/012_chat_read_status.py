"""Add read status fields to chats table

Revision ID: 012_chat_read_status
Revises: 011_chat_attachments
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op

revision = "012_chat_read_status"
down_revision = "011_chat_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chats",
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "chats",
        sa.Column("last_admin_read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "chats",
        sa.Column("last_user_read_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chats", "last_user_read_at")
    op.drop_column("chats", "last_admin_read_at")
    op.drop_column("chats", "last_message_at")
