"""
api/deps.py
─────────────────────────────────────────────────────────────────────────────
FastAPI Depends — авторизация и доступ к БД.

Два способа авторизации:
  1. Telegram WebApp initData (при первом открытии Mini App)
  2. JWT Bearer токен (все последующие запросы)

Оба метода возвращают объект User из БД.
─────────────────────────────────────────────────────────────────────────────
"""

import hashlib
import hmac
import json
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.config import settings
from shared.database.session import get_session
from shared.models import User

# ── Database Dependency ───────────────────────────────────────────────────────

DbSession = Annotated[AsyncSession, Depends(get_session)]


# ── JWT ───────────────────────────────────────────────────────────────────────

security = HTTPBearer(auto_error=False)


def create_access_token(telegram_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(telegram_id), "exp": expire, "type": "access"}
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


def create_refresh_token(telegram_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {"sub": str(telegram_id), "exp": expire, "type": "refresh"}
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный токен",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Telegram WebApp Verification ──────────────────────────────────────────────


def verify_telegram_init_data(init_data: str) -> dict:
    """
    Верифицирует подпись Telegram WebApp initData.
    Алгоритм: HMAC-SHA256 с ключом = HMAC-SHA256("WebAppData", BOT_TOKEN)

    Возвращает распарсенный user dict если подпись верна.
    Выбрасывает HTTPException 401 если подпись невалидна.
    """
    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)

    if not received_hash:
        raise HTTPException(status_code=401, detail="Отсутствует hash в initData")

    # Формируем строку для проверки
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))

    # Вычисляем секретный ключ: HMAC-SHA256(key="WebAppData", msg=BOT_TOKEN)
    secret_key = hmac.new(
        b"WebAppData",
        settings.BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()

    # Вычисляем hash: HMAC-SHA256(key=secret_key, msg=data_check_string)
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(status_code=401, detail="Невалидная подпись initData")

    # Проверяем свежесть (не старше 24 часов — рекомендация Telegram для Mini Apps)
    MAX_AUTH_AGE = 86400
    auth_date = int(parsed.get("auth_date", 0))
    now = int(datetime.now(timezone.utc).timestamp())
    if now - auth_date > MAX_AUTH_AGE:
        raise HTTPException(status_code=401, detail="initData устарела")

    # Парсим user
    user_str = parsed.get("user", "{}")
    try:
        return json.loads(user_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Невалидные данные пользователя")


# ── Auth Endpoints ────────────────────────────────────────────────────────────


async def get_or_create_user(
    tg_user_data: dict,
    db: AsyncSession,
) -> User:
    """Находит или создаёт пользователя по данным из Telegram."""
    telegram_id = tg_user_data.get("id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Отсутствует user.id")

    result = await db.execute(
        select(User)
        .options(
            selectinload(User.loyalty_level),
            selectinload(User.referred_by),
        )
        .where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Новый пользователь через Mini App
        from shared.models import LoyaltyLevel

        bronze_result = await db.execute(
            select(LoyaltyLevel)
            .where(LoyaltyLevel.is_active == True)
            .order_by(LoyaltyLevel.priority.asc())
            .limit(1)
        )
        bronze = bronze_result.scalar_one_or_none()

        user = User(
            telegram_id=telegram_id,
            username=tg_user_data.get("username"),
            first_name=tg_user_data.get("first_name", ""),
            last_name=tg_user_data.get("last_name"),
            language_code=tg_user_data.get("language_code", "ru"),
            loyalty_level_id=bronze.id if bronze else None,
            last_active_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.flush()
        result2 = await db.execute(
            select(User)
            .options(
                selectinload(User.loyalty_level),
                selectinload(User.referred_by),
            )
            .where(User.id == user.id)
        )
        user = result2.scalar_one()
    else:
        user.last_active_at = datetime.now(timezone.utc)

    return user


# ── Main Auth Dependency ──────────────────────────────────────────────────────


async def get_current_user(
    db: DbSession,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
    x_telegram_init_data: Annotated[str | None, Header()] = None,
) -> User:
    """
    Универсальная зависимость авторизации.

    Порядок проверки:
    1. JWT Bearer токен (приоритет)
    2. X-Telegram-Init-Data header (для первого открытия Mini App)

    Всегда возвращает User из БД.
    """
    user: User | None = None

    # — Способ 1: JWT —
    if credentials and credentials.credentials:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Неверный тип токена")

        telegram_id = int(payload["sub"])
        result = await db.execute(
            select(User)
            .options(
                selectinload(User.loyalty_level),
                selectinload(User.referred_by),
            )
            .where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=401, detail="Пользователь не найден")

    # — Способ 2: Telegram initData —
    elif x_telegram_init_data:
        tg_user_data = verify_telegram_init_data(x_telegram_init_data)
        user = await get_or_create_user(tg_user_data, db)

    else:
        raise HTTPException(
            status_code=401,
            detail="Необходима авторизация",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    return user


# ── Typed Dependency ──────────────────────────────────────────────────────────
CurrentUser = Annotated[User, Depends(get_current_user)]


# ── Optional Auth (для публичных эндпоинтов) ─────────────────────────────────


async def get_optional_user(
    db: DbSession,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
    x_telegram_init_data: Annotated[str | None, Header()] = None,
) -> User | None:
    """Как get_current_user, но возвращает None вместо 401."""
    try:
        return await get_current_user(db, credentials, x_telegram_init_data)
    except HTTPException:
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
