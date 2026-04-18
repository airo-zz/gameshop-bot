"""Order assignment — assigned_admin, chat.order_id

Revision ID: 016_order_assignment
Revises: 015_remove_dispute_status
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "016_order_assignment"
down_revision = "015_remove_dispute_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── orders: assigned_admin_id, assigned_at ────────────────────────────────
    op.add_column(
        "orders",
        sa.Column(
            "assigned_admin_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("admin_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_orders_assigned_admin_id",
        "orders",
        ["assigned_admin_id"],
    )

    # ── chats: order_id ───────────────────────────────────────────────────────
    op.add_column(
        "chats",
        sa.Column(
            "order_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # Один чат на заказ (partial unique: только когда order_id IS NOT NULL)
    op.execute(
        "CREATE UNIQUE INDEX uq_chats_order_id ON chats (order_id) WHERE order_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_chats_order_id")
    op.drop_column("chats", "order_id")
    op.drop_index("ix_orders_assigned_admin_id", table_name="orders")
    op.drop_column("orders", "assigned_at")
    op.drop_column("orders", "assigned_admin_id")
