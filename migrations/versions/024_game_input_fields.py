"""Поля покупателя на уровне игры + input_data на уровне заказа.

Переносит существующие products.input_fields на games.input_fields (объединяя
по ключу), чтобы сбор данных при оформлении не потерял поля старых игр.

Revision ID: 024_game_input_fields
Revises: 023_product_price_usd
Create Date: 2026-09-11
"""

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024_game_input_fields"
down_revision = "023_product_price_usd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column("input_fields", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "orders",
        sa.Column("input_data", postgresql.JSONB(), nullable=False, server_default="{}"),
    )

    # Перенос: для каждой игры собираем уникальные (по key) поля её товаров
    conn = op.get_bind()
    games = conn.execute(sa.text("SELECT id FROM games")).fetchall()
    for (game_id,) in games:
        rows = conn.execute(
            sa.text(
                """
                SELECT p.input_fields
                FROM products p
                JOIN categories c ON c.id = p.category_id
                WHERE c.game_id = :gid AND p.input_fields IS NOT NULL
                """
            ),
            {"gid": game_id},
        ).fetchall()

        merged: dict[str, dict] = {}
        for (fields,) in rows:
            if not fields:
                continue
            for f in fields:
                if isinstance(f, dict):
                    key = f.get("key")
                    if key and key not in merged:
                        merged[key] = f

        if merged:
            conn.execute(
                sa.text("UPDATE games SET input_fields = CAST(:val AS jsonb) WHERE id = :gid"),
                {"val": json.dumps(list(merged.values())), "gid": game_id},
            )

    # Поля переехали на игры — очищаем их у товаров, чтобы клиенты не спрашивали дважды
    conn.execute(sa.text("UPDATE products SET input_fields = '[]'::jsonb"))


def downgrade() -> None:
    op.drop_column("orders", "input_data")
    op.drop_column("games", "input_fields")
