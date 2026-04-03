"""
migrations/env.py
─────────────────────────────────────────────────────────────────────────────
Alembic конфигурация — синхронный psycopg2.
Приложение использует asyncpg, миграции — psycopg2 (стандартная практика).
─────────────────────────────────────────────────────────────────────────────
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from shared.config import settings
from shared.models import Base  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Подставляем синхронный URL (postgresql+psycopg2://...)
config.set_main_option("sqlalchemy.url", settings.sync_url)


def run_migrations_offline() -> None:
    context.configure(
        url=settings.sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
