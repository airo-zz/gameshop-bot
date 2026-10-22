"""SEO: поля игры и латинские адреса разделов.

games.seo_title / seo_description — свой заголовок и описание страницы игры
  для поисковиков (пусто — генерируются);
games.seo_aliases — другие названия, по которым ищут игру («Битва замков»,
  «кастл клэш»), по одному на строку;
games.seo_text — текст о донате в игре внизу страницы.

categories.slug переписывается в латиницу из названия («Бриллианты» →
«brillianty»): у разделов появляются свои страницы /game/<игра>/<раздел>.
Старые адреса (кириллица из импорта CSV) нигде не использовались как ссылки.
Откат возвращает только схему — прежние slug не восстанавливаются.

Revision ID: 035_seo_fields
Revises: 034_referral_percent
Create Date: 2026-10-22
"""

import re

import sqlalchemy as sa
from alembic import op

revision = "035_seo_fields"
down_revision = "034_referral_percent"
branch_labels = None
depends_on = None

# Копия shared/slug.py — миграция не должна зависеть от кода приложения
_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}


def _slug(text: str) -> str:
    s = "".join(_MAP.get(ch, ch) for ch in (text or "").lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:64].strip("-") or "razdel"


def upgrade() -> None:
    op.add_column("games", sa.Column("seo_title", sa.String(160), nullable=True))
    op.add_column("games", sa.Column("seo_description", sa.String(320), nullable=True))
    op.add_column("games", sa.Column("seo_aliases", sa.Text(), nullable=True))
    op.add_column("games", sa.Column("seo_text", sa.Text(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, game_id, name FROM categories ORDER BY game_id, parent_id NULLS FIRST, sort_order, created_at"
    )).fetchall()
    taken: dict = {}
    for cid, gid, name in rows:
        used = taken.setdefault(gid, set())
        base, slug, n = _slug(name), None, 2
        slug = base
        while slug in used:
            slug = f"{base[:60]}-{n}"
            n += 1
        used.add(slug)
        conn.execute(sa.text("UPDATE categories SET slug = :s WHERE id = :id"), {"s": slug, "id": cid})


def downgrade() -> None:
    op.drop_column("games", "seo_text")
    op.drop_column("games", "seo_aliases")
    op.drop_column("games", "seo_description")
    op.drop_column("games", "seo_title")
