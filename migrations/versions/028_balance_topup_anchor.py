"""Balance top-up anchor table + unique external_id on payments (security hardening).

- balance_topups: якорная запись инициированного пополнения (source of truth
  по сумме/пользователю), чтобы webhook не доверял echo-payload.
- payments.external_id: частичный UNIQUE, чтобы webhook-lookup не падал на
  MultipleResultsFound и не ретраился бесконечно.

Revision ID: 028_balance_topup_anchor
Revises: 027_platega_payment_methods
Create Date: 2026-09-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "028_balance_topup_anchor"
down_revision = "027_platega_payment_methods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "balance_topups",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("credited_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_balance_topups_user_id", "balance_topups", ["user_id"])
    op.create_index("ix_balance_topups_external_id", "balance_topups", ["external_id"])
    op.create_index(
        "uq_balance_topups_external",
        "balance_topups",
        ["provider", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    # Пустые external_id от неуспешных попыток → NULL, чтобы не ломать UNIQUE.
    op.execute("UPDATE payments SET external_id = NULL WHERE external_id = ''")
    op.create_index(
        "uq_payments_external_id",
        "payments",
        ["external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_payments_external_id", table_name="payments")
    op.drop_index("uq_balance_topups_external", table_name="balance_topups")
    op.drop_index("ix_balance_topups_external_id", table_name="balance_topups")
    op.drop_index("ix_balance_topups_user_id", table_name="balance_topups")
    op.drop_table("balance_topups")
