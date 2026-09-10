"""Add price_usd to products (цена в USD — источник истины при USD-ценообразовании).

Revision ID: 023_product_price_usd
Revises: 022_seed_admin_340516761
Create Date: 2026-09-10
"""

from alembic import op
import sqlalchemy as sa

revision = "023_product_price_usd"
down_revision = "022_seed_admin_340516761"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("price_usd", sa.Numeric(12, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "price_usd")
