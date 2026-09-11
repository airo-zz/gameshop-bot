"""Поля покупателя на уровне категории (переопределение полей игры).

NULL/пусто = наследовать поля игры; непустой список = свои поля категории.

Revision ID: 025_category_input_fields
Revises: 024_game_input_fields
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "025_category_input_fields"
down_revision = "024_game_input_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("input_fields", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "input_fields")
