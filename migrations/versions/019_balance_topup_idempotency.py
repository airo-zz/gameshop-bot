"""Add idempotency fields to balance_transactions.

Revision ID: 019_balance_topup_idempotency
Revises: 018_order_item_instruction
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa

revision = "019_balance_topup_idempotency"
down_revision = "018_order_item_instruction"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "balance_transactions",
        sa.Column("provider", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "balance_transactions",
        sa.Column("external_payment_id", sa.String(length=128), nullable=True),
    )
    op.create_index(
        "uq_balance_transactions_external",
        "balance_transactions",
        ["provider", "external_payment_id"],
        unique=True,
        postgresql_where=sa.text("external_payment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_balance_transactions_external", table_name="balance_transactions")
    op.drop_column("balance_transactions", "external_payment_id")
    op.drop_column("balance_transactions", "provider")
