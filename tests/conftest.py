"""
tests/conftest.py
─────────────────────────────────────────────────────────────────────────────
Базовая конфигурация тестов.
─────────────────────────────────────────────────────────────────────────────
"""

import os

import pytest
import pytest_asyncio
from decimal import Decimal

# Устанавливаем тестовое окружение ДО импорта приложения
os.environ.setdefault("BOT_TOKEN", "0000000000:test_token")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET_KEY", "test_secret_key_minimum_32_characters_x")
os.environ.setdefault("SHOP_NAME", "TestShop")

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from shared.models import Base


# ── Тестовый движок БД ────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def engine():
    from shared.config import settings
    _engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncSession:
    """Изолированная сессия для каждого теста (rollback после)."""
    async with engine.begin() as conn:
        session = AsyncSession(bind=conn)
        yield session
        await session.rollback()
        await session.close()


# ── Фабрики тестовых объектов ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(db: AsyncSession):
    """Создаёт тестового пользователя."""
    from shared.models import User
    user = User(
        telegram_id=123456789,
        username="testuser",
        first_name="Test",
        balance=Decimal("500.00"),
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def test_game(db: AsyncSession):
    """Создаёт тестовую игру."""
    from shared.models import Game
    game = Game(name="Test Game", slug="test-game", is_active=True)
    db.add(game)
    await db.flush()
    return game


@pytest_asyncio.fixture
async def test_product(db: AsyncSession, test_game):
    """Создаёт тестовый товар."""
    from shared.models import Category, Product
    cat = Category(
        game_id=test_game.id, name="Test Cat",
        slug="test-cat", is_active=True,
    )
    db.add(cat)
    await db.flush()

    product = Product(
        category_id=cat.id,
        name="Test Product",
        price=Decimal("99.00"),
        is_active=True,
    )
    db.add(product)
    await db.flush()
    return product


# ── Без внешних отправок ──────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _no_outgoing_messages(monkeypatch):
    """Тесты не шлют сообщения в Telegram и персоналу и не ставят задачи в хаб."""
    async def _noop(*args, **kwargs):
        return None

    import api.telegram_utils
    import shared.staff_notify
    monkeypatch.setattr(api.telegram_utils, "send_tg_message", _noop)
    monkeypatch.setattr(shared.staff_notify, "send_staff_async", _noop)
    from api.services.order_service import OrderService
    monkeypatch.setattr(OrderService, "_schedule_hub_order_push", lambda *a, **k: None)
