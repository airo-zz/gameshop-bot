"""Add game_name snapshot column to order_items

Revision ID: 014_add_game_name_to_order_items
Revises: 013_random_order_number
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op

revision = "014_add_game_name_to_order_items"
down_revision = "013_random_order_number"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("game_name", sa.String(256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("order_items", "game_name")
