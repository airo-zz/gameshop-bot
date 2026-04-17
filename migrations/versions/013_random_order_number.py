"""Replace sequential order numbers with random alphanumeric format (#J8Y67MMV)

Revision ID: 013_random_order_number
Revises: 012_chat_read_status
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op

revision = "013_random_order_number"
down_revision = "012_chat_read_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old sequential trigger and function
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_generate_order_number ON orders"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS generate_order_number()"))
    op.execute(sa.text("DROP SEQUENCE IF EXISTS order_number_seq"))

    # New function: random 8-char alphanumeric, no ambiguous chars (0 O I 1 L)
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION generate_order_number()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE
            chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            result TEXT;
            attempt INT := 0;
            i INT;
        BEGIN
            LOOP
                result := '';
                FOR i IN 1..8 LOOP
                    result := result || substr(chars, floor(random() * 32 + 1)::int, 1);
                END LOOP;
                result := '#' || result;
                IF NOT EXISTS (SELECT 1 FROM orders WHERE order_number = result) THEN
                    NEW.order_number := result;
                    RETURN NEW;
                END IF;
                attempt := attempt + 1;
                IF attempt > 20 THEN
                    RAISE EXCEPTION 'generate_order_number: could not generate unique number after 20 attempts';
                END IF;
            END LOOP;
        END;
        $$
    """))

    op.execute(sa.text("""
        CREATE TRIGGER trg_generate_order_number
        BEFORE INSERT ON orders
        FOR EACH ROW
        WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
        EXECUTE FUNCTION generate_order_number()
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_generate_order_number ON orders"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS generate_order_number()"))

    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000"))

    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION generate_order_number()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            NEW.order_number := '#' || LPAD(nextval('order_number_seq')::TEXT, 6, '0');
            RETURN NEW;
        END;
        $$
    """))

    op.execute(sa.text("""
        CREATE TRIGGER trg_generate_order_number
        BEFORE INSERT ON orders
        FOR EACH ROW
        WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
        EXECUTE FUNCTION generate_order_number()
    """))
