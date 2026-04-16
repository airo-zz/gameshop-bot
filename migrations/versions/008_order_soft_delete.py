"""order soft delete fields

- orders.deleted_at: TIMESTAMPTZ nullable (soft delete marker)
- orders.delete_reason: VARCHAR(255) nullable (reason for deletion)
- index on deleted_at for cleanup queries

Revision ID: 008_order_soft_delete
Revises: 007_loyalty_discount_and_shop_settings
Create Date: 2026-04-16
"""
import sqlalchemy as sa
from alembic import op

revision = '008_order_soft_delete'
down_revision = '007_loyalty_shop_settings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'orders',
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'orders',
        sa.Column('delete_reason', sa.String(255), nullable=True),
    )
    op.create_index(
        'ix_orders_deleted_at',
        'orders',
        ['deleted_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_orders_deleted_at', table_name='orders')
    op.drop_column('orders', 'delete_reason')
    op.drop_column('orders', 'deleted_at')
