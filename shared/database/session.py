"""
shared/database/session.py
─────────────────────────────────────────────────────────────────────────────
Async SQLAlchemy сессия и управление соединением.
─────────────────────────────────────────────────────────────────────────────
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from shared.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,             # SQL-логи в DEBUG режиме
    pool_size=10,                    # Базовый размер пула
    max_overflow=20,                 # Дополнительные соединения при пиковой нагрузке
    pool_pre_ping=True,              # Проверка соединения перед использованием
    pool_recycle=3600,               # Пересоздавать соединения каждый час
)

# ── Session Factory ───────────────────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,     # Не перегружать объекты после commit
    autocommit=False,
    autoflush=False,
)


# ── Context Manager для ручного использования ─────────────────────────────────
@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Контекст-менеджер для использования сессии вне FastAPI DI.
    Пример (в боте или Celery):
        async with get_db_session() as session:
            user = await session.get(User, user_id)
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── FastAPI Dependency ─────────────────────────────────────────────────────────
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency.
    Использование в роутере:
        async def endpoint(db: AsyncSession = Depends(get_session)):
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
