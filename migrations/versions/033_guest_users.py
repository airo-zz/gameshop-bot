"""Гостевой чат на сайте: users.is_guest.

Гость пишет в чат без входа — для него заводится анонимный пользователь со
служебным telegram_id (та же email_user_id_seq). При входе гость
объединяется с аккаунтом (api/services/account_service.py).

Revision ID: 033_guest_users
Revises: 032_user_email_login
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision = "033_guest_users"
down_revision = "032_user_email_login"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_guest", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "is_guest")
