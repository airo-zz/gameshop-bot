"""Add photo_url to users table

Revision ID: 002_add_user_photo_url
Revises: 001_initial
Create Date: 2026-04-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "002_add_user_photo_url"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_url", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_url")
