"""Add DB constraints: balance >= 0, promo usage unique

- users.balance CHECK >= 0  (DB-level guard against negative balance)
- promo_code_usages UNIQUE (promo_code_id, user_id, order_id)
  (prevents duplicate usage log rows under concurrent inserts)

Revision ID: 009_db_constraints
Revises: 008_order_soft_delete
Create Date: 2026-04-16
"""
import sqlalchemy as sa
from alembic import op

revision = '009_db_constraints'
down_revision = '008_order_soft_delete'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Balance must be non-negative at DB level
    op.create_check_constraint(
        'ck_users_balance_non_negative',
        'users',
        'balance >= 0',
    )

    # 2. Unique promo usage per order — prevents duplicate log entries
    op.create_unique_constraint(
        'uq_promo_usage_per_order',
        'promo_code_usages',
        ['promo_code_id', 'user_id', 'order_id'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_promo_usage_per_order', 'promo_code_usages', type_='unique')
    op.drop_constraint('ck_users_balance_non_negative', 'users', type_='check')
