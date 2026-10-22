"""Рефералка — процент с каждого выполненного заказа друга.

Было: разовый бонус пригласившему, когда друг потратит порог (одна запись
referral_rewards на приглашённого, уникальный referred_id).
Стало: начисление с каждого заказа — referral_rewards.order_id, уникален
(повторное выполнение заказа не начисляет второй раз). Старые разовые
выплаты остаются в истории с order_id = NULL.

Revision ID: 034_referral_percent
Revises: 033_guest_users
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "034_referral_percent"
down_revision = "033_guest_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "referral_rewards",
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
    )
    op.drop_constraint("uq_referral_rewards_referred", "referral_rewards", type_="unique")
    op.create_index("ix_referral_rewards_referred", "referral_rewards", ["referred_id"])
    op.create_index(
        "uq_referral_rewards_order", "referral_rewards", ["order_id"],
        unique=True, postgresql_where=sa.text("order_id IS NOT NULL"),
    )
    op.execute("""
        INSERT INTO shop_settings (key, value, description) VALUES
          ('referral_percent', '3',
           '% пригласившему с каждого выполненного заказа друга'),
          ('referral_period_months', '12',
           'Сколько месяцев с регистрации друга начисляется процент (0 — бессрочно)')
        ON CONFLICT (key) DO NOTHING
    """)
    op.execute(
        "DELETE FROM shop_settings WHERE key IN ('referral_bonus_amount', 'referral_threshold_amount')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM shop_settings WHERE key IN ('referral_percent', 'referral_period_months')")
    op.drop_index("uq_referral_rewards_order", table_name="referral_rewards")
    op.drop_index("ix_referral_rewards_referred", table_name="referral_rewards")
    # Возврат уникальности: оставляем одну (раннюю) запись на приглашённого
    op.execute("""
        DELETE FROM referral_rewards r USING referral_rewards r2
        WHERE r.referred_id = r2.referred_id AND r.created_at > r2.created_at
    """)
    op.create_unique_constraint("uq_referral_rewards_referred", "referral_rewards", ["referred_id"])
    op.drop_column("referral_rewards", "order_id")
