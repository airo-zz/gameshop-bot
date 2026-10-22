"""Названия уровней лояльности на английском (просьба владельца).

Переименовываем только уровни из сетки миграции 030; если владелец уже
переименовал уровень в админке — его не трогаем.

Revision ID: 031_loyalty_level_names_en
Revises: 030_monthly_cashback_loyalty
Create Date: 2026-10-22
"""

from alembic import op

revision = "031_loyalty_level_names_en"
down_revision = "030_monthly_cashback_loyalty"
branch_labels = None
depends_on = None

NAMES = [
    ("Старт", "Start"),
    ("Бронза", "Bronze"),
    ("Серебро", "Silver"),
    ("Золото", "Gold"),
    ("Платина", "Platinum"),
    ("Изумруд", "Emerald"),
    ("Сапфир", "Sapphire"),
    ("Рубин", "Ruby"),
    ("Алмаз", "Diamond"),
    ("Легенда", "Legend"),
]


def _rename(pairs):
    for old, new in pairs:
        op.execute(
            f"UPDATE loyalty_levels SET name = '{new}' WHERE name = '{old}'"
        )


def upgrade() -> None:
    _rename(NAMES)


def downgrade() -> None:
    _rename([(new, old) for old, new in NAMES])
