"""Seed admin (telegram_id 340516761)

Revision ID: 022_seed_admin_340516761
Revises: 021_seed_owner_admin
Create Date: 2026-09-09

Идемпотентно добавляет администратора в admin_users как role=admin.
Если админ с таким telegram_id уже есть — только активирует его, НЕ трогая
роль (чтобы не понизить владельца, если id совпадёт).
"""

from alembic import op

revision = "022_seed_admin_340516761"
down_revision = "021_seed_owner_admin"
branch_labels = None
depends_on = None

ADMIN_TELEGRAM_ID = 340516761


def upgrade() -> None:
    # id / created_at / updated_at заполняются server_default'ами.
    # permissions по умолчанию '[]' — admin получает права через роль.
    op.execute(
        f"""
        INSERT INTO admin_users (telegram_id, first_name, role, permissions, is_active)
        VALUES ({ADMIN_TELEGRAM_ID}, 'Admin', 'admin', '[]'::jsonb, true)
        ON CONFLICT (telegram_id)
        DO UPDATE SET is_active = true
        """
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM admin_users WHERE telegram_id = {ADMIN_TELEGRAM_ID}")
