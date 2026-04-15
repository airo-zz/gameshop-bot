"""
api/routers/admin/auth.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинты авторизации/идентификации администратора.
Включает Telegram Login Widget для входа через браузер.
─────────────────────────────────────────────────────────────────────────────
"""

import hashlib
import hmac
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from api.deps import DbSession, create_access_token, create_refresh_token
from api.deps_admin import CurrentAdmin
from api.schemas.admin import AdminMeOut
from shared.config import settings
from shared.models import AdminUser, DEFAULT_PERMISSIONS, User

router = APIRouter()


@router.get("/me", response_model=AdminMeOut)
async def admin_me(admin: CurrentAdmin) -> AdminMeOut:
    """
    Возвращает данные текущего администратора.

    Поле permissions содержит эффективный набор прав:
    дефолтные права роли объединяются с кастомными правами из поля AdminUser.permissions.
    """
    role_perms: list[str] = DEFAULT_PERMISSIONS.get(admin.role, [])
    custom_perms: list[str] = list(admin.permissions)

    # Объединяем без дублей, сохраняя порядок: роль → кастомные
    seen: set[str] = set()
    effective: list[str] = []
    for perm in role_perms + custom_perms:
        if perm not in seen:
            seen.add(perm)
            effective.append(perm)

    return AdminMeOut(
        id=admin.id,
        telegram_id=admin.telegram_id,
        username=admin.username,
        first_name=admin.first_name,
        role=admin.role,
        permissions=effective,
    )


# ── Telegram Login Widget ────────────────────────────────────────────────────


class TelegramLoginData(BaseModel):
    id: int
    first_name: str = ""
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/auth/telegram-login", response_model=LoginResponse)
async def telegram_login(data: TelegramLoginData, db: DbSession):
    """
    Авторизация администратора через Telegram Login Widget.
    Проверяет подпись, ищет юзера в admin_users, выдаёт JWT.
    """
    # 1. Проверяем подпись виджета
    _verify_telegram_login(data)

    # 2. Проверяем что auth_date не старше 24 часов
    if time.time() - data.auth_date > 86400:
        raise HTTPException(status_code=401, detail="Данные авторизации устарели")

    # 3. Ищем юзера в БД (создаём если нет)
    result = await db.execute(
        select(User).where(User.telegram_id == data.id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=403, detail="Пользователь не зарегистрирован")

    # 4. Проверяем что он админ
    admin_result = await db.execute(
        select(AdminUser).where(
            AdminUser.telegram_id == data.id,
            AdminUser.is_active.is_(True),
        )
    )
    admin = admin_result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=403, detail="Нет прав администратора")

    # 5. Выдаём JWT
    return LoginResponse(
        access_token=create_access_token(data.id),
        refresh_token=create_refresh_token(data.id),
    )


def _verify_telegram_login(data: TelegramLoginData) -> None:
    """Проверяет подпись Telegram Login Widget (SHA256 hash of BOT_TOKEN)."""
    check_data = {
        "id": str(data.id),
        "first_name": data.first_name,
        "auth_date": str(data.auth_date),
    }
    if data.last_name:
        check_data["last_name"] = data.last_name
    if data.username:
        check_data["username"] = data.username
    if data.photo_url:
        check_data["photo_url"] = data.photo_url

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(check_data.items())
    )

    secret_key = hashlib.sha256(settings.BOT_TOKEN.encode()).digest()
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, data.hash):
        raise HTTPException(status_code=401, detail="Невалидная подпись")
