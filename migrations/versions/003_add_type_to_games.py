"""Add type to games table

Revision ID: 003_add_type_to_games
Revises: 002_add_user_photo_url
Create Date: 2026-04-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "003_add_type_to_games"
down_revision = "002_add_user_photo_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column(
            "type",
            sa.String(16),
            nullable=False,
            server_default="game",
        ),
    )
    op.create_index("ix_games_type", "games", ["type"])


def downgrade() -> None:
    op.drop_index("ix_games_type", table_name="games")
    op.drop_column("games", "type")
