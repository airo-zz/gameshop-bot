"""Вход на сайте по почте: users.email + последовательность для служебных ID.

Пользователь, зарегистрированный по почте, не имеет Telegram ID. Чтобы не
переделывать всё, что завязано на users.telegram_id (JWT, чат, заказы), ему
выдаётся служебный отрицательный ID вне диапазона Telegram:
-(7·10^18 + nextval(email_user_id_seq)) — см. shared/models/user.py.

Revision ID: 032_user_email_login
Revises: 031_loyalty_level_names_en
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision = "032_user_email_login"
down_revision = "031_loyalty_level_names_en"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(254), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.execute("CREATE SEQUENCE IF NOT EXISTS email_user_id_seq START 1")


def downgrade() -> None:
    op.execute("DROP SEQUENCE IF EXISTS email_user_id_seq")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "email")
