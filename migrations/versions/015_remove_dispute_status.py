"""Remove dispute from order_status_enum

Revision ID: 015_remove_dispute_status
Revises: 014_add_game_name_to_order_items
Create Date: 2026-04-18
"""

from alembic import op

revision = "015_remove_dispute_status"
down_revision = "014_add_game_name_to_order_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Переводим все заказы со статусом dispute в processing
    op.execute(
        "UPDATE orders SET status = 'processing' WHERE status = 'dispute'"
    )
    op.execute(
        "UPDATE order_status_history SET from_status = 'processing'"
        " WHERE from_status = 'dispute'"
    )
    op.execute(
        "UPDATE order_status_history SET to_status = 'processing'"
        " WHERE to_status = 'dispute'"
    )

    # Пересоздаём enum без dispute
    op.execute("ALTER TYPE order_status_enum RENAME TO order_status_enum_old")
    op.execute(
        "CREATE TYPE order_status_enum AS ENUM ("
        "'new', 'pending_payment', 'paid', 'processing',"
        "'clarification', 'completed', 'cancelled'"
        ")"
    )
    op.execute(
        "ALTER TABLE orders"
        " ALTER COLUMN status TYPE order_status_enum"
        " USING status::text::order_status_enum"
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
    op.execute("ALTER TYPE order_status_enum RENAME TO order_status_enum_old")
    op.execute(
        "CREATE TYPE order_status_enum AS ENUM ("
        "'new', 'pending_payment', 'paid', 'processing',"
        "'clarification', 'completed', 'cancelled', 'dispute'"
        ")"
    )
    op.execute(
        "ALTER TABLE orders"
        " ALTER COLUMN status TYPE order_status_enum"
        " USING status::text::order_status_enum"
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
