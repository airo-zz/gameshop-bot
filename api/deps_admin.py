"""
api/deps_admin.py
─────────────────────────────────────────────────────────────────────────────
FastAPI Depends для проверки прав администратора.

Основной способ — сессия админки (cookie adm_session на admin.redonate.gg,
api/services/admin_auth_service.py). Запросы с cookie обязаны идти со страниц
самой админки: заголовок X-Admin-Request (чужой сайт не может его поставить без
разрешения CORS) и Origin/Sec-Fetch-Site того же адреса — защита от CSRF.

Старый способ — JWT покупателя + запись в admin_users (админка внутри /app) —
работает, пока ADMIN_LEGACY_BEARER=true: на время перехода на поддомен.
─────────────────────────────────────────────────────────────────────────────
"""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select

from api.deps import DbSession, get_current_user, security
from api.services.admin_auth_service import COOKIE, get_session_admin
from shared.config import settings
from shared.models import AdminUser


def check_admin_request(request: Request) -> None:
    """Запрос пришёл со страницы админки (а не с чужого сайта)."""
    if request.headers.get("x-admin-request") != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Запрос не из админки")
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != settings.ADMIN_ORIGIN.rstrip("/"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Запрос не из админки")
    site = request.headers.get("sec-fetch-site")
    if site and site not in ("same-origin", "none"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Запрос не из админки")


async def get_current_admin(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)] = None,
    x_telegram_init_data: Annotated[str | None, Header()] = None,
) -> AdminUser:
    token = request.cookies.get(COOKIE)
    if token:
        check_admin_request(request)
        found = await get_session_admin(db, token)
        if not found:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия админки истекла — войдите снова")
        session, admin = found
        request.state.admin_session_id = session.id
        return admin

    if not settings.ADMIN_LEGACY_BEARER:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Войдите в админку")

    user = await get_current_user(db, credentials, x_telegram_init_data)
    admin = (await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == user.telegram_id, AdminUser.is_active.is_(True))
    )).scalar_one_or_none()
    if not admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Требуются права администратора")
    return admin


CurrentAdmin = Annotated[AdminUser, Depends(get_current_admin)]


def require_permission(permission: str):
    """Dependency factory для проверки конкретного permission."""

    async def checker(admin: CurrentAdmin) -> AdminUser:
        if not admin.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Недостаточно прав: {permission}",
            )
        return admin

    return Depends(checker)
