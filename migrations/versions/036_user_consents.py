"""Согласия пользователя сайта (152-ФЗ, 38-ФЗ «О рекламе»).

users.pd_consent_at        — когда дано согласие на обработку персональных данных
                             (обязательное при входе на сайте);
users.marketing_consent    — согласие на рекламные письма (необязательное);
users.marketing_consent_at — когда дано/отозвано.

Revision ID: 036_user_consents
Revises: 035_seo_fields
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision = "036_user_consents"
down_revision = "035_seo_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pd_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("marketing_consent", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("marketing_consent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "marketing_consent_at")
    op.drop_column("users", "marketing_consent")
    op.drop_column("users", "pd_consent_at")
