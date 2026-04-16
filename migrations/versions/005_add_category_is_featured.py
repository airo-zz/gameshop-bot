"""Add is_featured to categories

Revision ID: 005_add_category_is_featured
Revises: 004_add_crypto_payment_method
Create Date: 2026-04-16 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "005_add_category_is_featured"
down_revision = "004_add_crypto_payment_method"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("categories", "is_featured")
