"""loyalty discount direct + shop_settings table

- order_discount_log.discount_rule_id: NOT NULL RESTRICT -> NULL SET NULL
  (allows logging loyalty-level direct discounts without a DiscountRule record)
- create shop_settings key-value table for configurable shop parameters
  (e.g. referral_bonus_amount)

Revision ID: 007_loyalty_discount_and_shop_settings
Revises: 006_order_item_product_set_null
Create Date: 2026-04-16
"""
import sqlalchemy as sa
from alembic import op

revision = '007_loyalty_discount_and_shop_settings'
down_revision = '006_order_item_product_set_null'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. order_discount_log: nullable discount_rule_id ─────────────────────
    op.drop_constraint(
        'order_discount_log_discount_rule_id_fkey',
        'order_discount_log',
        type_='foreignkey',
    )
    op.alter_column('order_discount_log', 'discount_rule_id', nullable=True)
    op.create_foreign_key(
        'order_discount_log_discount_rule_id_fkey',
        'order_discount_log', 'discount_rules',
        ['discount_rule_id'], ['id'],
        ondelete='SET NULL',
    )

    # ── 2. shop_settings table ────────────────────────────────────────────────
    op.create_table(
        'shop_settings',
        sa.Column('key', sa.String(64), primary_key=True, nullable=False),
        sa.Column('value', sa.Text, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )

    # Seed default referral bonus
    op.execute(
        "INSERT INTO shop_settings (key, value, description) "
        "VALUES ('referral_bonus_amount', '100', "
        "'Сумма в ₽, начисляемая рефереру при первой оплате реферала')"
    )


def downgrade() -> None:
    # ── 2. drop shop_settings ─────────────────────────────────────────────────
    op.drop_table('shop_settings')

    # ── 1. restore NOT NULL RESTRICT ─────────────────────────────────────────
    # Note: rows with NULL discount_rule_id must be removed first in practice.
    op.drop_constraint(
        'order_discount_log_discount_rule_id_fkey',
        'order_discount_log',
        type_='foreignkey',
    )
    op.alter_column('order_discount_log', 'discount_rule_id', nullable=False)
    op.create_foreign_key(
        'order_discount_log_discount_rule_id_fkey',
        'order_discount_log', 'discount_rules',
        ['discount_rule_id'], ['id'],
        ondelete='RESTRICT',
    )
