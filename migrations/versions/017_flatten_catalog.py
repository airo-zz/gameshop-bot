"""Flatten catalog: merge ProductLot into Product, drop product_lots table.

- Adds original_price, quantity, badge, is_out_of_stock to products
- Drops lot_id from cart_items, order_items, product_keys
- Drops product_lots table

Revision ID: 017_flatten_catalog
Revises: 016_order_assignment
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "017_flatten_catalog"
down_revision = "016_order_assignment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add new columns to products ───────────────────────────────────────
    op.add_column(
        "products",
        sa.Column("original_price", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "products",
        sa.Column("badge", sa.String(32), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column(
            "is_out_of_stock", sa.Boolean(), nullable=False, server_default="false"
        ),
    )

    # ── 2. Drop lot_id FK from product_keys (lot-aware routing removed) ───────
    # First drop the FK constraint, then the column
    op.drop_constraint(
        "product_keys_lot_id_fkey",
        "product_keys",
        type_="foreignkey",
    )
    op.drop_column("product_keys", "lot_id")

    # ── 3. Drop lot_id from cart_items ────────────────────────────────────────
    op.drop_constraint(
        "cart_items_lot_id_fkey",
        "cart_items",
        type_="foreignkey",
    )
    op.drop_column("cart_items", "lot_id")

    # ── 4. Drop lot_id from order_items ──────────────────────────────────────
    op.drop_constraint(
        "order_items_lot_id_fkey",
        "order_items",
        type_="foreignkey",
    )
    op.drop_column("order_items", "lot_id")

    # ── 5. Drop lot_name snapshot column from order_items ─────────────────────
    op.drop_column("order_items", "lot_name")

    # ── 6. Drop product_lots table entirely ──────────────────────────────────
    # All FKs referencing product_lots have been removed above.
    op.drop_table("product_lots")

    # ── 7. Remove stale columns from products table ───────────────────────────
    # tags column: only Game model actually uses it meaningfully; Product.tags
    # was rarely populated. Keep column — it doesn't hurt and removing it would
    # be an extra step with no gain. Leave as-is.
    pass


def downgrade() -> None:
    # Recreate product_lots table
    op.create_table(
        "product_lots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("original_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("badge", sa.String(32), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    # Restore lot_id in order_items
    op.add_column(
        "order_items",
        sa.Column(
            "lot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("product_lots.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "order_items",
        sa.Column("lot_name", sa.String(128), nullable=True),
    )

    # Restore lot_id in cart_items
    op.add_column(
        "cart_items",
        sa.Column(
            "lot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("product_lots.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Restore lot_id in product_keys
    op.add_column(
        "product_keys",
        sa.Column(
            "lot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("product_lots.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Remove new product columns
    op.drop_column("products", "is_out_of_stock")
    op.drop_column("products", "badge")
    op.drop_column("products", "quantity")
    op.drop_column("products", "original_price")
