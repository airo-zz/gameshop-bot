"""Движок автовыдачи на уровне подкатегории (T20).

NULL = нет автовыдачи через движок; telegram_stars | telegram_premium — Fragment.

Revision ID: 026_category_auto_engine
Revises: 025_category_input_fields
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa

revision = "026_category_auto_engine"
down_revision = "025_category_input_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("auto_engine", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "auto_engine")
