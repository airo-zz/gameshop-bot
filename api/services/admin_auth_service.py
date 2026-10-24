"""
api/services/admin_auth_service.py
─────────────────────────────────────────────────────────────────────────────
Вход в админку (admin.redonate.gg) — отдельно от входа покупателей.

Сессия: случайный токен в HttpOnly-cookie admin.redonate.gg, в БД (admin_sessions)
только его SHA-256. Живёт ADMIN_SESSION_DAYS, без активности — ADMIN_SESSION_IDLE_HOURS.

Способы входа:
  • telegram_webapp  — админка открыта внутри Telegram (бот поддержки или основной):
                       initData подписан токеном бота — Telegram сам подтверждает аккаунт;
  • telegram_confirm — браузер: страница создаёт запрос, сотрудник открывает бот поддержки
                       по ссылке и нажимает «Подтвердить» (support_bot/handlers/admin_login.py);
                       забрать сессию может только браузер, создавший запрос (секрет в cookie);
  • email            — без Telegram: почта + пароль, затем код из письма.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import hashlib
import logging
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.services import email_auth_service as eas
from shared.config import settings
from shared.models import AdminSession, AdminUser

logger = logging.getLogger(__name__)

COOKIE = "adm_session"
LOGIN_REQUEST_COOKIE = "adm_lr"
LOGIN_REQUEST_TTL = 300          # запрос входа через бот живёт 5 минут
PASSWORD_OK_TTL = 600            # после пароля — 10 минут на ввод кода
EMAIL_FAILS_LIMIT = 10           # неверных паролей на адрес в час
PASSWORD_MIN = 10
TOUCH_EVERY = timedelta(minutes=5)

METHOD_LABELS = {
    "telegram_webapp": "Telegram (внутри приложения)",
    "telegram_confirm": "Telegram (подтверждение в боте)",
    "email": "Почта и пароль",
}


class AdminAuthError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _r():
    return eas._r()  # тот же Redis-клиент, что у кодов входа


# ── Пароли (scrypt из стандартной библиотеки) ────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        # одинаковое время ответа, есть пароль у адреса или нет
        hashlib.scrypt(password.encode(), salt=b"0" * 16, n=2**14, r=8, p=1, dklen=32)
        return False
    try:
        _, n, r, p, salt, dk = stored.split("$")
        calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                              dklen=len(bytes.fromhex(dk)))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(calc.hex(), dk)


# ── Сессии ───────────────────────────────────────────────────────────────────

async def create_session(db: AsyncSession, admin: AdminUser, method: str, ip: str | None, ua: str | None) -> str:
    token = secrets.token_urlsafe(32)
    now = _now()
    db.add(AdminSession(
        admin_id=admin.id,
        token_hash=_hash_token(token),
        method=method,
        ip=(ip or "")[:45] or None,
        user_agent=(ua or "")[:256] or None,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=settings.ADMIN_SESSION_DAYS),
    ))
    await db.flush()
    return token


async def get_session_admin(db: AsyncSession, token: str) -> tuple[AdminSession, AdminUser] | None:
    if not token:
        return None
    row = (await db.execute(
        select(AdminSession, AdminUser)
        .join(AdminUser, AdminUser.id == AdminSession.admin_id)
        .where(AdminSession.token_hash == _hash_token(token))
    )).first()
    if not row:
        return None
    sess, admin = row
    now = _now()
    idle = timedelta(hours=settings.ADMIN_SESSION_IDLE_HOURS)
    if sess.revoked_at or sess.expires_at <= now or now - sess.last_seen_at > idle or not admin.is_active:
        return None
    if now - sess.last_seen_at > TOUCH_EVERY:
        sess.last_seen_at = now
    return sess, admin


async def revoke_session(db: AsyncSession, session_id: uuid.UUID, admin_id: uuid.UUID | None = None) -> bool:
    q = update(AdminSession).where(AdminSession.id == session_id, AdminSession.revoked_at.is_(None))
    if admin_id is not None:
        q = q.where(AdminSession.admin_id == admin_id)
    res = await db.execute(q.values(revoked_at=_now()))
    return res.rowcount > 0


async def revoke_all(db: AsyncSession, admin_id: uuid.UUID, except_id: uuid.UUID | None = None) -> int:
    q = update(AdminSession).where(AdminSession.admin_id == admin_id, AdminSession.revoked_at.is_(None))
    if except_id is not None:
        q = q.where(AdminSession.id != except_id)
    res = await db.execute(q.values(revoked_at=_now()))
    return res.rowcount


async def list_sessions(db: AsyncSession, admin_id: uuid.UUID) -> list[AdminSession]:
    now = _now()
    return list((await db.execute(
        select(AdminSession)
        .where(AdminSession.admin_id == admin_id, AdminSession.revoked_at.is_(None), AdminSession.expires_at > now,
               AdminSession.last_seen_at > now - timedelta(hours=settings.ADMIN_SESSION_IDLE_HOURS))
        .order_by(AdminSession.last_seen_at.desc())
    )).scalars().all())


async def active_admin_by_tg(db: AsyncSession, telegram_id: int) -> AdminUser | None:
    return (await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == telegram_id, AdminUser.is_active.is_(True))
    )).scalar_one_or_none()


# ── Telegram: внутри приложения ──────────────────────────────────────────────

def verify_webapp_init_data(init_data: str) -> dict:
    """Подпись initData ботом поддержки или основным ботом. Возвращает user."""
    from api.deps import verify_telegram_init_data_with

    tokens = [t for t in (settings.SUPPORT_BOT_TOKEN, settings.BOT_TOKEN) if t]
    last: Exception | None = None
    for token in tokens:
        try:
            return verify_telegram_init_data_with(init_data, token)
        except Exception as e:  # noqa: BLE001 — пробуем следующий бот
            last = e
    raise AdminAuthError("Не удалось подтвердить вход через Telegram", 401) from last


# ── Telegram: подтверждение в боте (браузер) ─────────────────────────────────

def _lr_key(nonce: str) -> str:
    return f"admin_login_req:{nonce}"


async def create_login_request(ip: str | None, ua: str | None) -> tuple[str, str]:
    """(nonce для ссылки на бота, секрет браузера)."""
    nonce = secrets.token_urlsafe(18).replace("-", "a").replace("_", "b")
    secret = secrets.token_urlsafe(24)
    await _r().set(_lr_key(nonce), json.dumps({
        "s": _hash_token(secret), "ip": ip, "ua": (ua or "")[:200], "status": "pending", "admin": None,
    }), ex=LOGIN_REQUEST_TTL)
    return nonce, secret


async def get_login_request(nonce: str) -> dict | None:
    raw = await _r().get(_lr_key(nonce))
    return json.loads(raw) if raw else None


async def decide_login_request(db: AsyncSession, nonce: str, telegram_id: int, approve: bool) -> tuple[bool, str]:
    """Решение из бота поддержки. (успех, текст ответа сотруднику)."""
    data = await get_login_request(nonce)
    if not data:
        return False, "Запрос входа устарел. Обновите страницу входа и попробуйте снова."
    if data["status"] != "pending":
        return False, "Этот запрос уже обработан."
    admin = await active_admin_by_tg(db, telegram_id)
    if not admin:
        return False, "У этого аккаунта нет доступа к админке."
    data["status"] = "approved" if approve else "denied"
    data["admin"] = str(admin.id)
    r = _r()
    ttl = await r.ttl(_lr_key(nonce))
    await r.set(_lr_key(nonce), json.dumps(data), ex=max(ttl, 30))
    return True, ("Вход подтверждён. Можно вернуться в браузер." if approve else "Вход отклонён.")


async def claim_login_request(db: AsyncSession, nonce: str, secret: str) -> AdminUser | None:
    """
    Браузер забирает подтверждённый вход. None — ещё ждём.
    Только браузер с секретом из своего запроса; запрос одноразовый.
    """
    data = await get_login_request(nonce)
    if not data or not secret or not hmac.compare_digest(data["s"], _hash_token(secret)):
        raise AdminAuthError("Запрос входа устарел — начните заново", 410)
    if data["status"] == "pending":
        return None
    await _r().delete(_lr_key(nonce))
    if data["status"] != "approved":
        raise AdminAuthError("Вход отклонён в Telegram", 403)
    admin = (await db.execute(
        select(AdminUser).where(AdminUser.id == uuid.UUID(data["admin"]), AdminUser.is_active.is_(True))
    )).scalar_one_or_none()
    if not admin:
        raise AdminAuthError("Нет доступа к админке", 403)
    return admin


# ── Почта и пароль ───────────────────────────────────────────────────────────

def _email(raw: str) -> str:
    try:
        return eas.normalize_email(raw)
    except eas.EmailAuthError as e:
        raise AdminAuthError(e.message, e.status) from e


async def email_password_step(db: AsyncSession, email: str, password: str) -> None:
    """Пароль верный → код на почту. Ответ одинаковый, есть такой сотрудник или нет."""
    email = _email(email)
    r = _r()
    fails_key = f"admin_pw_fails:{email}"
    if int(await r.get(fails_key) or 0) >= EMAIL_FAILS_LIMIT:
        raise AdminAuthError("Слишком много попыток. Попробуйте через час", 429)
    admin = (await db.execute(
        select(AdminUser).where(AdminUser.email == email, AdminUser.is_active.is_(True))
    )).scalar_one_or_none()
    if not verify_password(password, admin.password_hash if admin else None):
        n = await r.incr(fails_key)
        if n == 1:
            await r.expire(fails_key, 3600)
        raise AdminAuthError("Неверная почта или пароль", 401)
    await r.delete(fails_key)
    await r.set(f"admin_pw_ok:{email}", str(admin.id), ex=PASSWORD_OK_TTL)
    try:
        await eas.send_code(email, "admin")
    except eas.EmailAuthError as e:
        raise AdminAuthError(e.message, e.status) from e


async def email_code_step(db: AsyncSession, email: str, code: str) -> AdminUser:
    email = _email(email)
    r = _r()
    admin_id = await r.get(f"admin_pw_ok:{email}")
    if not admin_id:
        raise AdminAuthError("Сначала введите почту и пароль", 400)
    try:
        await eas.check_code(email, code, "admin")
    except eas.EmailAuthError as e:
        raise AdminAuthError(e.message, e.status) from e
    await r.delete(f"admin_pw_ok:{email}")
    admin = (await db.execute(
        select(AdminUser).where(AdminUser.id == uuid.UUID(admin_id), AdminUser.is_active.is_(True))
    )).scalar_one_or_none()
    if not admin:
        raise AdminAuthError("Нет доступа к админке", 403)
    return admin


async def credentials_request(db: AsyncSession, admin: AdminUser, email: str) -> None:
    """Код на новую почту сотрудника — подтверждение, что адрес его."""
    email = _email(email)
    taken = (await db.execute(
        select(AdminUser.id).where(AdminUser.email == email, AdminUser.id != admin.id)
    )).scalar_one_or_none()
    if taken:
        raise AdminAuthError("Эта почта уже у другого сотрудника", 409)
    try:
        await eas.send_code(email, "admin_link")
    except eas.EmailAuthError as e:
        raise AdminAuthError(e.message, e.status) from e


async def credentials_save(db: AsyncSession, admin: AdminUser, email: str, code: str, password: str) -> None:
    email = _email(email)
    if len(password) < PASSWORD_MIN:
        raise AdminAuthError(f"Пароль — не короче {PASSWORD_MIN} символов")
    if password.lower() in email or len(set(password)) < 5:
        raise AdminAuthError("Пароль слишком простой")
    try:
        await eas.check_code(email, code, "admin_link")
    except eas.EmailAuthError as e:
        raise AdminAuthError(e.message, e.status) from e
    admin.email = email
    admin.password_hash = hash_password(password)
    admin.password_set_at = _now()


# ── Уведомление о входе ──────────────────────────────────────────────────────

async def notify_login(admin: AdminUser, method: str, ip: str | None, ua: str | None) -> None:
    """Сообщение сотруднику в бот поддержки: новый вход. Не критично."""
    from html import escape

    import httpx

    token = settings.SUPPORT_BOT_TOKEN or settings.BOT_TOKEN
    if not token or admin.telegram_id <= 0:
        return
    text = (
        "<b>Вход в админку</b>\n"
        f"Способ: {escape(METHOD_LABELS.get(method, method))}\n"
        f"IP: {escape(ip or '—')}\n"
        f"Браузер: {escape((ua or '—')[:120])}\n\n"
        "Если это были не вы — откройте админку → «Безопасность» и завершите все сессии."
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                              json={"chat_id": admin.telegram_id, "text": text, "parse_mode": "HTML"})
    except httpx.HTTPError as exc:
        logger.warning("admin login notify failed admin=%s: %s", admin.id, exc)
