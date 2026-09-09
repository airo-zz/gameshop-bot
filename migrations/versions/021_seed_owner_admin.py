"""Seed owner admin (telegram_id 1035714581)

Revision ID: 021_seed_owner_admin
Revises: 020_order_refunded_status
Create Date: 2026-09-09

Идемпотентно добавляет владельца магазина в admin_users как role=owner.
Если админ с таким telegram_id уже есть — ничего не делает (ON CONFLICT),
но принудительно активирует его и повышает до owner, чтобы гарантировать доступ.
"""

from alembic import op

revision = "021_seed_owner_admin"
down_revision = "020_order_refunded_status"
branch_labels = None
depends_on = None

OWNER_TELEGRAM_ID = 1035714581


def upgrade() -> None:
    # id / created_at / updated_at заполняются server_default'ами.
    # permissions по умолчанию '[]' — owner получает всё через роль.
    op.execute(
        f"""
        INSERT INTO admin_users (telegram_id, first_name, role, permissions, is_active)
        VALUES ({OWNER_TELEGRAM_ID}, 'Owner', 'owner', '[]'::jsonb, true)
        ON CONFLICT (telegram_id)
        DO UPDATE SET role = 'owner', is_active = true
        """
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM admin_users WHERE telegram_id = {OWNER_TELEGRAM_ID}")
