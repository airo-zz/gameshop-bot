"""Add 'refunded' value to order_status_enum

Revision ID: 020_order_refunded_status
Revises: 019_balance_topup_idempotency
Create Date: 2026-04-23
"""

from alembic import op

revision = "020_order_refunded_status"
down_revision = "019_balance_topup_idempotency"
branch_labels = None
depends_on = None


# Пересоздаём enum через RENAME + CREATE + USING cast (как в 015).
# `ALTER TYPE ... ADD VALUE` требует autocommit и не работает
# внутри транзакционной миграции Alembic.


def upgrade() -> None:
    op.execute("ALTER TYPE order_status_enum RENAME TO order_status_enum_old")
    op.execute(
        "CREATE TYPE order_status_enum AS ENUM ("
        "'new', 'pending_payment', 'paid', 'processing',"
        "'clarification', 'completed', 'cancelled', 'refunded'"
        ")"
    )
    op.execute("ALTER TABLE orders ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE orders"
        " ALTER COLUMN status TYPE order_status_enum"
        " USING status::text::order_status_enum"
    )
    op.execute(
        "ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'new'::order_status_enum"
    )
    op.execute(
        "ALTER TABLE order_status_history"
        " ALTER COLUMN from_status TYPE order_status_enum"
        " USING from_status::text::order_status_enum"
    )
    op.execute(
        "ALTER TABLE order_status_history"
        " ALTER COLUMN to_status TYPE order_status_enum"
        " USING to_status::text::order_status_enum"
    )
    op.execute("DROP TYPE order_status_enum_old")


def downgrade() -> None:
    # Переводим возвраты в cancelled, чтобы откатиться без потери записей
    op.execute("UPDATE orders SET status = 'cancelled' WHERE status = 'refunded'")
    op.execute(
        "UPDATE order_status_history SET from_status = 'cancelled'"
        " WHERE from_status = 'refunded'"
    )
    op.execute(
        "UPDATE order_status_history SET to_status = 'cancelled'"
        " WHERE to_status = 'refunded'"
    )

    op.execute("ALTER TYPE order_status_enum RENAME TO order_status_enum_old")
    op.execute(
        "CREATE TYPE order_status_enum AS ENUM ("
        "'new', 'pending_payment', 'paid', 'processing',"
        "'clarification', 'completed', 'cancelled'"
        ")"
    )
    op.execute("ALTER TABLE orders ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE orders"
        " ALTER COLUMN status TYPE order_status_enum"
        " USING status::text::order_status_enum"
    )
    op.execute(
        "ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'new'::order_status_enum"
    )
    op.execute(
        "ALTER TABLE order_status_history"
        " ALTER COLUMN from_status TYPE order_status_enum"
        " USING from_status::text::order_status_enum"
    )
    op.execute(
        "ALTER TABLE order_status_history"
        " ALTER COLUMN to_status TYPE order_status_enum"
        " USING to_status::text::order_status_enum"
    )
    op.execute("DROP TYPE order_status_enum_old")
