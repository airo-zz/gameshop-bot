"""
api/deps_admin.py
─────────────────────────────────────────────────────────────────────────────
FastAPI Depends для проверки прав администратора.
─────────────────────────────────────────────────────────────────────────────
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import CurrentUser, DbSession
from shared.models import AdminUser


async def get_current_admin(user: CurrentUser, db: DbSession) -> AdminUser:
    """Проверяет что пользователь — активный админ."""
    result = await db.execute(
        select(AdminUser).where(
            AdminUser.telegram_id == user.telegram_id,
            AdminUser.is_active == True,
        )
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуются права администратора",
        )
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
