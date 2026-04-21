"""Add instruction snapshot to order_items.

Revision ID: 018_order_item_instruction
Revises: 017_flatten_catalog
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa

revision = "018_order_item_instruction"
down_revision = "017_flatten_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("instruction", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("order_items", "instruction")
