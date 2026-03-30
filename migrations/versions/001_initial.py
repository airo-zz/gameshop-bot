"""Initial migration — create all tables

Revision ID: 001_initial
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Включаем расширение для gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── loyalty_levels ────────────────────────────────────────────────────────
    op.create_table(
        "loyalty_levels",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("min_spent", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("min_orders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("cashback_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color_hex", sa.String(7), nullable=False, server_default="'#CD7F32'"),
        sa.Column("icon_emoji", sa.String(8), nullable=False, server_default="'🥉'"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("first_name", sa.String(128), nullable=False, server_default="''"),
        sa.Column("last_name", sa.String(128), nullable=True),
        sa.Column("language_code", sa.String(8), nullable=False, server_default="'ru'"),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("referral_code", sa.String(16), nullable=False,
                  server_default=sa.text("substr(md5(random()::text), 1, 8)")),
        sa.Column("referred_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("loyalty_level_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("total_spent", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("orders_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_blocked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("blocked_reason", sa.Text(), nullable=True),
        sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["loyalty_level_id"], ["loyalty_levels.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["referred_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("telegram_id"),
        sa.UniqueConstraint("referral_code"),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"])

    # ── balance_transactions ──────────────────────────────────────────────────
    op.create_table(
        "balance_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_before", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_balance_transactions_user_id", "balance_transactions", ["user_id"])

    # ── referral_rewards ──────────────────────────────────────────────────────
    op.create_table(
        "referral_rewards",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("referrer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("referred_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reward_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["referrer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["referred_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── games ─────────────────────────────────────────────────────────────────
    op.create_table(
        "games",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("banner_url", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="'{}'"),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_games_slug", "games", ["slug"])

    # ── categories ────────────────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_categories_game_id", "categories", ["game_id"])
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])

    # ── products ──────────────────────────────────────────────────────────────
    # Enum types
    op.execute("CREATE TYPE delivery_type_enum AS ENUM ('auto', 'manual', 'mixed')")

    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("short_description", sa.String(512), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="'RUB'"),
        sa.Column("stock", sa.Integer(), nullable=True),
        sa.Column("delivery_type", sa.Enum("auto", "manual", "mixed", name="delivery_type_enum"), nullable=False, server_default="'manual'"),
        sa.Column("input_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'[]'"),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.Column("images", postgresql.ARRAY(sa.String()), nullable=False, server_default="'{}'"),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="'{}'"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_is_active", "products", ["is_active"])

    # ── product_lots ──────────────────────────────────────────────────────────
    op.create_table(
        "product_lots",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("original_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("badge", sa.String(32), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_lots_product_id", "product_lots", ["product_id"])

    # ── product_keys ──────────────────────────────────────────────────────────
    op.create_table(
        "product_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key_value", sa.Text(), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("order_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["product_lots.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_keys_available", "product_keys", ["product_id", "is_used"])

    # ── user_favorites ────────────────────────────────────────────────────────
    op.create_table(
        "user_favorites",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "product_id"),
        sa.UniqueConstraint("user_id", "product_id", name="uq_user_favorites"),
    )

    # ── user_viewed_products ──────────────────────────────────────────────────
    op.create_table(
        "user_viewed_products",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("viewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "product_id"),
        sa.UniqueConstraint("user_id", "product_id", name="uq_user_viewed"),
    )

    # ── reviews ───────────────────────────────────────────────────────────────
    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "product_id", name="uq_one_review_per_product"),
    )
    op.create_index("ix_reviews_product_id", "reviews", ["product_id"])

    # ── discount_rules ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TYPE discount_type_enum AS ENUM
        ('product', 'category', 'loyalty', 'promo', 'time_based', 'manual')
    """)
    op.execute("""
        CREATE TYPE discount_value_type_enum AS ENUM ('percent', 'fixed')
    """)

    op.create_table(
        "discount_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", sa.Enum("product", "category", "loyalty", "promo", "time_based", "manual", name="discount_type_enum"), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("discount_value_type", sa.Enum("percent", "fixed", name="discount_value_type_enum"), nullable=False, server_default="'percent'"),
        sa.Column("discount_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("min_order_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("max_discount_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("stackable", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("usage_limit", sa.Integer(), nullable=True),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── promo_codes ───────────────────────────────────────────────────────────
    op.create_table(
        "promo_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("discount_rule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("per_user_limit", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["discount_rule_id"], ["discount_rules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"])

    # ── promo_code_usages ─────────────────────────────────────────────────────
    op.create_table(
        "promo_code_usages",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["promo_code_id"], ["promo_codes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_promo_code_usages_promo_code_id", "promo_code_usages", ["promo_code_id"])
    op.create_index("ix_promo_code_usages_user_id", "promo_code_usages", ["user_id"])

    # ── carts ─────────────────────────────────────────────────────────────────
    op.create_table(
        "carts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["promo_code_id"], ["promo_codes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_carts_user_id", "carts", ["user_id"])

    # ── cart_items ────────────────────────────────────────────────────────────
    op.create_table(
        "cart_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("cart_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("input_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["cart_id"], ["carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["product_lots.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])

    # ── abandoned_carts ───────────────────────────────────────────────────────
    op.create_table(
        "abandoned_carts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cart_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("reminder_sent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("second_reminder_sent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("recovered", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── orders ────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TYPE order_status_enum AS ENUM
        ('new','pending_payment','paid','processing','clarification','completed','cancelled','dispute')
    """)
    op.execute("""
        CREATE TYPE payment_method_enum AS ENUM
        ('balance','card_yukassa','usdt','ton','manual')
    """)
    op.execute("""
        CREATE TYPE payment_status_enum AS ENUM
        ('pending','succeeded','failed','refunded','cancelled')
    """)

    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_number", sa.String(16), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Enum("new","pending_payment","paid","processing","clarification","completed","cancelled","dispute", name="order_status_enum"), nullable=False, server_default="'new'"),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.Enum("balance","card_yukassa","usdt","ton","manual", name="payment_method_enum"), nullable=True),
        sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["promo_code_id"], ["promo_codes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_number"),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_order_number", "orders", ["order_number"])

    # Триггер для генерации order_number
    op.execute("""
        CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

        CREATE OR REPLACE FUNCTION generate_order_number()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.order_number := '#' || LPAD(nextval('order_number_seq')::TEXT, 6, '0');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_generate_order_number
        BEFORE INSERT ON orders
        FOR EACH ROW
        WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
        EXECUTE FUNCTION generate_order_number();
    """)

    # ── order_items ───────────────────────────────────────────────────────────
    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("product_name", sa.String(256), nullable=False),
        sa.Column("lot_name", sa.String(128), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("input_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("delivery_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["lot_id"], ["product_lots.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])

    # FK от product_keys к order_items (добавляем после создания обеих таблиц)
    op.create_foreign_key(
        "fk_product_keys_order_item",
        "product_keys", "order_items",
        ["order_item_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── order_status_history ──────────────────────────────────────────────────
    op.create_table(
        "order_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_status", sa.Enum("new","pending_payment","paid","processing","clarification","completed","cancelled","dispute", name="order_status_enum"), nullable=True),
        sa.Column("to_status", sa.Enum("new","pending_payment","paid","processing","clarification","completed","cancelled","dispute", name="order_status_enum"), nullable=False),
        sa.Column("changed_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("changed_by_type", sa.String(16), nullable=False, server_default="'system'"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_status_history_order_id", "order_status_history", ["order_id"])

    # ── order_discount_log ────────────────────────────────────────────────────
    op.create_table(
        "order_discount_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("discount_rule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("applied_value", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discount_rule_id"], ["discount_rules.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_discount_log_order_id", "order_discount_log", ["order_id"])

    # ── payments ──────────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("method", sa.Enum("balance","card_yukassa","usdt","ton","manual", name="payment_method_enum"), nullable=False),
        sa.Column("status", sa.Enum("pending","succeeded","failed","refunded","cancelled", name="payment_status_enum"), nullable=False, server_default="'pending'"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="'RUB'"),
        sa.Column("external_id", sa.String(128), nullable=True),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refund_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_payments_order_id", "payments", ["order_id"])
    op.create_index("ix_payments_external_id", "payments", ["external_id"])

    # ── admin_users ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TYPE admin_role_enum AS ENUM
        ('owner','admin','manager','operator','content')
    """)

    op.create_table(
        "admin_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("first_name", sa.String(128), nullable=False, server_default="''"),
        sa.Column("role", sa.Enum("owner","admin","manager","operator","content", name="admin_role_enum"), nullable=False, server_default="'operator'"),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'[]'"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("added_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["added_by_id"], ["admin_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("telegram_id"),
    )
    op.create_index("ix_admin_users_telegram_id", "admin_users", ["telegram_id"])

    # ── admin_action_log ──────────────────────────────────────────────────────
    op.create_table(
        "admin_action_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("before_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["admin_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_action_log_admin_id", "admin_action_log", ["admin_id"])
    op.create_index("ix_admin_action_log_created_at", "admin_action_log", ["created_at"])

    # ── support_tickets ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TYPE ticket_status_enum AS ENUM
        ('open','in_progress','waiting_user','resolved','closed')
    """)

    op.create_table(
        "support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("subject", sa.String(256), nullable=False),
        sa.Column("status", sa.Enum("open","in_progress","waiting_user","resolved","closed", name="ticket_status_enum"), nullable=False, server_default="'open'"),
        sa.Column("assigned_to_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["admin_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])

    # ── ticket_messages ───────────────────────────────────────────────────────
    op.create_table(
        "ticket_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_type", sa.String(8), nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("attachments", postgresql.ARRAY(sa.String()), nullable=False, server_default="'{}'"),
        sa.Column("is_template_response", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ticket_messages_ticket_id", "ticket_messages", ["ticket_id"])

    # ── support_templates ─────────────────────────────────────────────────────
    op.create_table(
        "support_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── Seed: Уровни лояльности по умолчанию ─────────────────────────────────
    op.execute("""
        INSERT INTO loyalty_levels (name, min_spent, min_orders, discount_percent, cashback_percent, priority, color_hex, icon_emoji, description) VALUES
        ('Bronze', 0,     0,  0,  0, 10, '#CD7F32', '🥉', 'Начальный уровень'),
        ('Silver', 3000,  5,  3,  1, 20, '#C0C0C0', '🥈', 'Скидка 3%% + кэшбек 1%%'),
        ('Gold',   10000, 15, 7,  2, 30, '#FFD700', '🥇', 'Скидка 7%% + кэшбек 2%%'),
        ('VIP',    30000, 30, 12, 3, 40, '#9B59B6', '💎', 'Скидка 12%% + кэшбек 3%% + приоритетная поддержка')
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    # Удаляем в обратном порядке
    op.drop_table("support_templates")
    op.drop_table("ticket_messages")
    op.drop_table("support_tickets")
    op.drop_table("admin_action_log")
    op.drop_table("admin_users")
    op.drop_table("payments")
    op.drop_table("order_discount_log")
    op.drop_table("order_status_history")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("abandoned_carts")
    op.drop_table("cart_items")
    op.drop_table("carts")
    op.drop_table("promo_code_usages")
    op.drop_table("promo_codes")
    op.drop_table("discount_rules")
    op.drop_table("reviews")
    op.drop_table("user_viewed_products")
    op.drop_table("user_favorites")
    op.drop_table("product_keys")
    op.drop_table("product_lots")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("games")
    op.drop_table("referral_rewards")
    op.drop_table("balance_transactions")
    op.drop_table("users")
    op.drop_table("loyalty_levels")

    op.execute("DROP TYPE IF EXISTS ticket_status_enum")
    op.execute("DROP TYPE IF EXISTS admin_role_enum")
    op.execute("DROP TYPE IF EXISTS payment_status_enum")
    op.execute("DROP TYPE IF EXISTS payment_method_enum")
    op.execute("DROP TYPE IF EXISTS order_status_enum")
    op.execute("DROP TYPE IF EXISTS discount_value_type_enum")
    op.execute("DROP TYPE IF EXISTS discount_type_enum")
    op.execute("DROP TYPE IF EXISTS delivery_type_enum")
    op.execute("DROP SEQUENCE IF EXISTS order_number_seq")
    op.execute("DROP FUNCTION IF EXISTS generate_order_number()")
