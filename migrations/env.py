"""
migrations/env.py
─────────────────────────────────────────────────────────────────────────────
Alembic конфигурация для async PostgreSQL.
Автоматически обнаруживает все модели через shared.models.
─────────────────────────────────────────────────────────────────────────────
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Импортируем ВСЕ модели — Alembic должен их видеть для autogenerate
from shared.models import Base  # noqa: F401 — все модели регистрируются через __init__
from shared.config import settings

# Alembic Config объект
config = context.config

# Логирование из alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Метаданные для autogenerate
target_metadata = Base.metadata

# Переопределяем DATABASE_URL из настроек (синхронный URL для Alembic)
config.set_main_option("sqlalchemy.url", settings.sync_url)


def run_migrations_offline() -> None:
    """Офлайн-режим: генерация SQL без подключения к БД."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,          # Отслеживать изменения типов колонок
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Онлайн-режим: async подключение к PostgreSQL."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
