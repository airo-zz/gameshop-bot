"""Отзывы: два источника — наш сайт/миниапп (после выполненного заказа) и GGSEL.

reviews.source       — 'site' | 'ggsel'
reviews.external_id  — id отзыва у источника (GGSEL), уникален в паре с source
reviews.game_id      — игра, к которой относится отзыв (показ «по какой игре»)
reviews.game_name    — название игры, если в каталоге её нет (отзывы GGSEL)
reviews.product_name — название товара/лота
reviews.reply        — ответ продавца
user_id / product_id / order_id — теперь необязательные (у GGSEL их нет);
один отзыв на заказ вместо одного на товар. Таблица до этой миграции пустая.

Revision ID: 037_reviews_sources
Revises: 036_user_consents
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "037_reviews_sources"
down_revision = "036_user_consents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_one_review_per_product", "reviews", type_="unique")
    op.alter_column("reviews", "user_id", nullable=True)
    op.alter_column("reviews", "product_id", nullable=True)
    op.alter_column("reviews", "order_id", nullable=True)
    # Удаление товара не должно стирать отзывы о магазине
    op.drop_constraint("reviews_product_id_fkey", "reviews", type_="foreignkey")
    op.create_foreign_key(
        "reviews_product_id_fkey", "reviews", "products", ["product_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "reviews_order_id_fkey", "reviews", "orders", ["order_id"], ["id"], ondelete="SET NULL"
    )

    op.add_column("reviews", sa.Column("source", sa.String(16), nullable=False, server_default="site"))
    op.add_column("reviews", sa.Column("external_id", sa.String(64), nullable=True))
    op.add_column(
        "reviews",
        sa.Column("game_id", UUID(as_uuid=True), sa.ForeignKey("games.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("reviews", sa.Column("game_name", sa.String(128), nullable=True))
    op.add_column("reviews", sa.Column("product_name", sa.String(255), nullable=True))
    op.add_column("reviews", sa.Column("reply", sa.Text(), nullable=True))

    op.create_unique_constraint("uq_review_source_external", "reviews", ["source", "external_id"])
    op.create_index("uq_review_order", "reviews", ["order_id"], unique=True,
                    postgresql_where=sa.text("order_id IS NOT NULL"))
    op.create_index("ix_reviews_game_id", "reviews", ["game_id"])
    op.create_index("ix_reviews_visible_created", "reviews", ["is_visible", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_reviews_visible_created", "reviews")
    op.drop_index("ix_reviews_game_id", "reviews")
    op.drop_index("uq_review_order", "reviews")
    op.drop_constraint("uq_review_source_external", "reviews", type_="unique")
    op.execute("DELETE FROM reviews WHERE source <> 'site' OR user_id IS NULL OR product_id IS NULL OR order_id IS NULL")
    for col in ("reply", "product_name", "game_name", "game_id", "external_id", "source"):
        op.drop_column("reviews", col)
    op.drop_constraint("reviews_order_id_fkey", "reviews", type_="foreignkey")
    op.drop_constraint("reviews_product_id_fkey", "reviews", type_="foreignkey")
    op.create_foreign_key(
        "reviews_product_id_fkey", "reviews", "products", ["product_id"], ["id"], ondelete="CASCADE"
    )
    op.alter_column("reviews", "order_id", nullable=False)
    op.alter_column("reviews", "product_id", nullable=False)
    op.alter_column("reviews", "user_id", nullable=False)
    op.create_unique_constraint("uq_one_review_per_product", "reviews", ["user_id", "product_id"])
