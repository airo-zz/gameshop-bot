"""Add attachments column to chat_messages

Revision ID: 011_chat_attachments
Revises: 010_add_chat
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "011_chat_attachments"
down_revision = "010_add_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column(
            "attachments",
            postgresql.ARRAY(sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "attachments")
