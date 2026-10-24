"""Админка на admin.redonate.gg: свои сессии и вход по почте без Telegram.

admin_users.email / password_hash / password_set_at — вход по почте и паролю
  с подтверждением кодом из письма (резерв на случай недоступности Telegram);
admin_sessions — сессии админки (cookie на admin.redonate.gg хранит случайный
  токен, в БД — только его SHA-256): кто, откуда, когда, способ входа, отзыв.

Revision ID: 038_admin_sessions
Revises: 037_reviews_sources
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "038_admin_sessions"
down_revision = "037_reviews_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("email", sa.String(254), nullable=True))
    op.add_column("admin_users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("admin_users", sa.Column("password_set_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("uq_admin_users_email", "admin_users", ["email"], unique=True,
                    postgresql_where=sa.text("email IS NOT NULL"))

    op.create_table(
        "admin_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("admin_id", UUID(as_uuid=True), sa.ForeignKey("admin_users.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("admin_sessions")
    op.drop_index("uq_admin_users_email", "admin_users")
    op.drop_column("admin_users", "password_set_at")
    op.drop_column("admin_users", "password_hash")
    op.drop_column("admin_users", "email")
