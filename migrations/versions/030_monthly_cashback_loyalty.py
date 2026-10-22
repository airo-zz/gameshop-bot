"""Лояльность по модели Bybit + рабочая реферальная программа.

Лояльность:
  • уровень = максимум из (уровень по тратам прошлого месяца, уровень по тратам
    текущего месяца) — достигнутый уровень держится весь следующий месяц;
  • только кэшбэк, скидки по уровню больше не применяются (discount_percent = 0);
  • monthly_cashback_cap — потолок кэшбэка в месяц на уровне (NULL = без потолка);
  • старые 4 уровня заменяются сеткой из 10 (на момент миграции в проде
    15 пользователей, кэшбэк выплачен один раз — пересчёт безопасен).

Рефералка:
  • referral_rewards.referred_id — уникален: бонус за друга выплачивается один раз;
  • настройки: порог трат друга и скидка новому пользователю на первый заказ.

Revision ID: 030_monthly_cashback_loyalty
Revises: 029_game_custom_order
Create Date: 2026-10-22
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "030_monthly_cashback_loyalty"
down_revision = "029_game_custom_order"
branch_labels = None
depends_on = None

# (name, min_spent за месяц ₽, cashback %, потолок кэшбэка в месяц ₽, цвет)
LEVELS = [
    ("Старт",    0,      1.0, 100,  "#8A94A6"),
    ("Бронза",   2000,   1.5, 200,  "#C08457"),
    ("Серебро",  5000,   2.0, 300,  "#B8C2CC"),
    ("Золото",   10000,  2.5, 500,  "#E3B341"),
    ("Платина",  20000,  3.0, 800,  "#9FB7C9"),
    ("Изумруд",  35000,  3.5, 1200, "#3FBF8F"),
    ("Сапфир",   50000,  4.0, 1600, "#4C7DF0"),
    ("Рубин",    75000,  4.5, 2200, "#E0565B"),
    ("Алмаз",    100000, 5.0, 3000, "#8FD3FF"),
    ("Легенда",  150000, 6.0, 5000, "#C58BFF"),
]


def upgrade() -> None:
    op.add_column(
        "loyalty_levels",
        sa.Column("monthly_cashback_cap", sa.Numeric(12, 2), nullable=True),
    )

    # Сетка уровней: старые удаляем (users.loyalty_level_id → SET NULL),
    # уровень пользователя дальше считается на лету из трат по месяцам.
    op.execute("DELETE FROM loyalty_levels")
    levels = sa.table(
        "loyalty_levels",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("min_spent", sa.Numeric),
        sa.column("min_orders", sa.Integer),
        sa.column("discount_percent", sa.Numeric),
        sa.column("cashback_percent", sa.Numeric),
        sa.column("monthly_cashback_cap", sa.Numeric),
        sa.column("priority", sa.Integer),
        sa.column("color_hex", sa.String),
        sa.column("icon_emoji", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(levels, [
        {
            "id": uuid.uuid4(),
            "name": name,
            "min_spent": min_spent,
            "min_orders": 0,
            "discount_percent": 0,
            "cashback_percent": cashback,
            "monthly_cashback_cap": cap,
            "priority": (i + 1) * 10,
            "color_hex": color,
            "icon_emoji": "",
            "is_active": True,
        }
        for i, (name, min_spent, cashback, cap, color) in enumerate(LEVELS)
    ])

    op.create_unique_constraint(
        "uq_referral_rewards_referred", "referral_rewards", ["referred_id"]
    )

    op.execute("""
        INSERT INTO shop_settings (key, value, description) VALUES
          ('referral_threshold_amount', '1000',
           'Сколько ₽ должен потратить приглашённый, чтобы пригласивший получил бонус'),
          ('referral_new_user_discount_percent', '5',
           'Скидка в % на первый заказ пользователю, пришедшему по реферальной ссылке')
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM shop_settings
        WHERE key IN ('referral_threshold_amount', 'referral_new_user_discount_percent')
    """)
    op.drop_constraint("uq_referral_rewards_referred", "referral_rewards", type_="unique")
    # Старую сетку уровней не восстанавливаем — она настраивается в админке
    op.drop_column("loyalty_levels", "monthly_cashback_cap")
