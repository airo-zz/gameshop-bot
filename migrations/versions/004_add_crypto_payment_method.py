"""Add crypto to payment_method_enum

Revision ID: 004_add_crypto_payment_method
Revises: 003_add_type_to_games
Create Date: 2026-04-14 00:00:00.000000
"""

from alembic import op

revision = "004_add_crypto_payment_method"
down_revision = "003_add_type_to_games"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'crypto'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values
    pass
