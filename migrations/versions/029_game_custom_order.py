"""Кнопка «Индивидуальный заказ» на уровне игры.

custom_order_enabled = показывать ли на странице игры кнопку заявки на
индивидуальный лот (покупатель описывает/присылает скрины, оператор собирает лот).

Revision ID: 029_game_custom_order
Revises: 028_balance_topup_anchor
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa

revision = "029_game_custom_order"
down_revision = "028_balance_topup_anchor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column(
            "custom_order_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("games", "custom_order_enabled")
