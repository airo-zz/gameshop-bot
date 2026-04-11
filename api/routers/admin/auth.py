"""
api/routers/admin/auth.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинты авторизации/идентификации администратора.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter

from api.deps_admin import CurrentAdmin
from api.schemas.admin import AdminMeOut
from shared.models import DEFAULT_PERMISSIONS

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
