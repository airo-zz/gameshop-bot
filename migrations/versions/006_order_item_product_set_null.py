"""order_item product_id: RESTRICT -> SET NULL

Revision ID: 006_order_item_product_set_null
Revises: 005_add_category_is_featured
Create Date: 2026-04-16
"""
from alembic import op

revision = '006_order_item_product_set_null'
down_revision = '005_add_category_is_featured'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('order_items_product_id_fkey', 'order_items', type_='foreignkey')
    op.alter_column('order_items', 'product_id', nullable=True)
    op.create_foreign_key(
        'order_items_product_id_fkey',
        'order_items', 'products',
        ['product_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('order_items_product_id_fkey', 'order_items', type_='foreignkey')
    op.alter_column('order_items', 'product_id', nullable=False)
    op.create_foreign_key(
        'order_items_product_id_fkey',
        'order_items', 'products',
        ['product_id'], ['id'],
        ondelete='RESTRICT',
    )
