"""
api/services/email_auth_service.py
─────────────────────────────────────────────────────────────────────────────
Вход на сайте по коду из письма и привязка почты/Telegram к аккаунту.

Коды живут в Redis (не в БД): 6 цифр, 10 минут, 5 попыток ввода; повторная
отправка не чаще раза в минуту и не больше 10 писем на адрес в сутки.
Хранится только хэш кода.

Пользователь, зарегистрированный по почте, получает служебный отрицательный
telegram_id (см. shared.models.user.EMAIL_USER_ID_BASE) — поэтому JWT, чат,
корзина и заказы работают без изменений.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.config import settings
from shared.mailer import code_email, send_email
from shared.models import Chat, LoyaltyLevel, User

CODE_TTL = 600            # код действует 10 минут
MAX_ATTEMPTS = 5          # попыток ввода на один код
RESEND_COOLDOWN = 60      # повторная отправка — не чаще раза в минуту
DAILY_LIMIT = 10          # писем на один адрес в сутки

# Простая проверка формата: точная валидация всё равно — доставка кода
_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")

_redis: aioredis.Redis | None = None


def _r() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


class EmailAuthError(Exception):
    """Ошибка с текстом для пользователя; status — HTTP-код для роутера."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if len(email) > 254 or not _EMAIL_RE.match(email):
        raise EmailAuthError("Проверьте адрес почты")
    return email


def _hash(email: str, code: str) -> str:
    return hmac.new(settings.JWT_SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


# purpose: "login" — вход/регистрация, "link" — привязка почты к аккаунту
def _key(purpose: str, email: str) -> str:
    return f"email_code:{purpose}:{email}"


async def send_code(email: str, purpose: str) -> None:
    r = _r()
    cooldown_key = f"email_code_cd:{email}"
    if await r.exists(cooldown_key):
        ttl = await r.ttl(cooldown_key)
        raise EmailAuthError(f"Код уже отправлен. Повторить можно через {max(ttl, 1)} с", 429)

    day_key = f"email_code_day:{email}"
    sent_today = await r.incr(day_key)
    if sent_today == 1:
        await r.expire(day_key, 86400)
    if sent_today > DAILY_LIMIT:
        raise EmailAuthError("Слишком много запросов кода на этот адрес. Попробуйте завтра", 429)

    code = f"{secrets.randbelow(1_000_000):06d}"
    subject, html_body, plain = code_email(code)
    if not await send_email(email, subject, html_body, plain):
        raise EmailAuthError("Не удалось отправить письмо. Попробуйте позже", 503)

    await r.set(_key(purpose, email), json.dumps({"h": _hash(email, code), "tries": 0}), ex=CODE_TTL)
    await r.set(cooldown_key, "1", ex=RESEND_COOLDOWN)


async def check_code(email: str, code: str, purpose: str) -> None:
    """Проверяет код; при успехе удаляет его. Иначе EmailAuthError."""
    r = _r()
    key = _key(purpose, email)
    raw = await r.get(key)
    if not raw:
        raise EmailAuthError("Код устарел — запросите новый")
    data = json.loads(raw)
    code = re.sub(r"\D", "", code or "")
    if hmac.compare_digest(data["h"], _hash(email, code)):
        await r.delete(key)
        return
    data["tries"] += 1
    if data["tries"] >= MAX_ATTEMPTS:
        await r.delete(key)
        raise EmailAuthError("Слишком много неверных попыток — запросите новый код")
    ttl = await r.ttl(key)
    await r.set(key, json.dumps(data), ex=max(ttl, 1))
    raise EmailAuthError(f"Неверный код. Осталось попыток: {MAX_ATTEMPTS - data['tries']}")


async def _load_user(db: AsyncSession, *where) -> User | None:
    return (
        await db.execute(
            select(User)
            .options(selectinload(User.loyalty_level), selectinload(User.referred_by))
            .where(*where)
        )
    ).scalar_one_or_none()


async def get_or_create_email_user(db: AsyncSession, email: str) -> tuple[User, bool]:
    """(пользователь, создан_сейчас)."""
    from api.services.account_service import new_service_id

    user = await _load_user(db, User.email == email)
    if user:
        user.last_active_at = datetime.now(timezone.utc)
        return user, False

    start_level = (
        await db.execute(
            select(LoyaltyLevel)
            .where(LoyaltyLevel.is_active == True)  # noqa: E712
            .order_by(LoyaltyLevel.priority.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    user = User(
        telegram_id=await new_service_id(db),
        email=email,
        first_name=email.split("@", 1)[0][:128],
        loyalty_level_id=start_level.id if start_level else None,
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return await _load_user(db, User.id == user.id), True  # type: ignore[return-value]


async def attach_email(db: AsyncSession, user: User, email: str) -> User | None:
    """
    Привязывает (или меняет) подтверждённую почту. Если она уже у другого
    аккаунта — ничего не меняет и возвращает его (предложим объединить).
    """
    other = await _load_user(db, User.email == email)
    if other and other.id != user.id:
        return other
    user.email = email
    return None


async def link_telegram(db: AsyncSession, user: User, tg: dict) -> User | None:
    """
    Привязывает Telegram (данные уже проверенного Login Widget) к аккаунту без
    него: служебный ID заменяется настоящим, чат переезжает. Если этот
    Telegram уже есть в магазине — возвращает тот аккаунт (предложим объединить).
    """
    if user.has_telegram:
        raise EmailAuthError("Telegram уже привязан к аккаунту", 409)
    new_id = int(tg["id"])
    other = await _load_user(db, User.telegram_id == new_id)
    if other:
        return other
    old_id = user.telegram_id
    await db.execute(update(Chat).where(Chat.user_id == old_id).values(user_id=new_id))
    user.telegram_id = new_id
    user.is_guest = False
    user.username = tg.get("username") or user.username
    if tg.get("first_name"):
        user.first_name = tg["first_name"]
    user.last_name = tg.get("last_name") or user.last_name
    return None
