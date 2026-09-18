"""Add Platega payment methods (sbp, card) to payment_method_enum.

Активная платёжка — Platega: СБП (paymentMethod=2), карта (11), крипта (13).
'crypto' уже есть (миграция 004) и переиспользуется под Platega.

Revision ID: 027_platega_payment_methods
Revises: 026_category_auto_engine
Create Date: 2026-09-18
"""

from alembic import op

revision = "027_platega_payment_methods"
down_revision = "026_category_auto_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'sbp'")
    op.execute("ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'card'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values
    pass
