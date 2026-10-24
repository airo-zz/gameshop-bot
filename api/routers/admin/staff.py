"""
api/routers/admin/staff.py — сотрудники админки (только владелец: право staff.manage).

  GET    /admin/staff                 — список с последней активностью
  GET    /admin/staff/roles           — роли и их права (для подсказок в интерфейсе)
  POST   /admin/staff                 — добавить по @нику или Telegram ID (человек должен
                                        хотя бы раз открыть бота магазина)
  PATCH  /admin/staff/{id}            — роль / включить-отключить
  GET    /admin/staff/{id}/sessions   — активные сессии сотрудника
  POST   /admin/staff/{id}/revoke-sessions — завершить все его сессии
Защита: нельзя менять себя и нельзя оставить магазин без активного владельца.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.routers.admin.session_auth import session_out
from api.services import admin_auth_service as aas
from api.utils.admin_log import log_admin_action
from shared.models import DEFAULT_PERMISSIONS, AdminRole, AdminSession, AdminUser, User

router = APIRouter()
PERM = [require_permission("staff.manage")]

ROLE_LABELS = {
    AdminRole.owner: ("Владелец", "Полный доступ, управление сотрудниками"),
    AdminRole.admin: ("Администратор", "Каталог, заказы, покупатели, скидки, поддержка, журнал"),
    AdminRole.manager: ("Менеджер", "Заказы, покупатели, скидки, поддержка"),
    AdminRole.operator: ("Оператор", "Выдача заказов и чаты с покупателями"),
    AdminRole.content: ("Контент", "Игры, разделы и товары"),
}


class StaffOut(BaseModel):
    id: uuid.UUID
    telegram_id: int
    username: str | None
    first_name: str
    role: AdminRole
    role_label: str
    is_active: bool
    email: str | None
    has_password: bool
    created_at: datetime
    last_seen_at: datetime | None
    sessions: int


async def _staff_out(db, admins: list[AdminUser]) -> list[StaffOut]:
    stats = dict(((r[0], (r[1], r[2])) for r in (await db.execute(
        select(AdminSession.admin_id, func.max(AdminSession.last_seen_at),
               func.count().filter(AdminSession.revoked_at.is_(None), AdminSession.expires_at > func.now()))
        .group_by(AdminSession.admin_id)
    )).all()))
    return [StaffOut(
        id=a.id, telegram_id=a.telegram_id, username=a.username, first_name=a.first_name,
        role=a.role, role_label=ROLE_LABELS[a.role][0], is_active=a.is_active,
        email=a.email, has_password=bool(a.password_hash), created_at=a.created_at,
        last_seen_at=stats.get(a.id, (None, 0))[0], sessions=stats.get(a.id, (None, 0))[1],
    ) for a in admins]


@router.get("", response_model=list[StaffOut], dependencies=PERM)
async def list_staff(db: DbSession):
    admins = list((await db.execute(
        select(AdminUser).order_by(AdminUser.is_active.desc(), AdminUser.created_at)
    )).scalars().all())
    return await _staff_out(db, admins)


@router.get("/roles", dependencies=PERM)
async def roles():
    return [{"role": r.value, "label": lbl, "description": desc, "permissions": DEFAULT_PERMISSIONS.get(r, [])}
            for r, (lbl, desc) in ROLE_LABELS.items()]


class StaffAddIn(BaseModel):
    query: str = Field(..., min_length=2, max_length=64, description="@ник или Telegram ID")
    role: AdminRole = AdminRole.operator


@router.post("", response_model=StaffOut, dependencies=PERM)
async def add_staff(body: StaffAddIn, request: Request, admin: CurrentAdmin, db: DbSession):
    q = body.query.strip().lstrip("@")
    if q.isdigit():
        user = (await db.execute(select(User).where(User.telegram_id == int(q)))).scalar_one_or_none()
    else:
        user = (await db.execute(
            select(User).where(func.lower(User.username) == q.lower(), User.telegram_id > 0)
        )).scalars().first()
    if not user or user.telegram_id <= 0:
        raise HTTPException(404, "Не нашли такого пользователя. Попросите его открыть бота магазина и повторите")
    if body.role == AdminRole.owner and admin.role != AdminRole.owner:
        raise HTTPException(403, "Назначить владельца может только владелец")

    existing = (await db.execute(select(AdminUser).where(AdminUser.telegram_id == user.telegram_id))).scalar_one_or_none()
    if existing and existing.is_active:
        raise HTTPException(409, "Этот человек уже сотрудник")
    if existing:
        existing.is_active, existing.role = True, body.role
        target = existing
    else:
        target = AdminUser(telegram_id=user.telegram_id, username=user.username, first_name=user.first_name or "",
                           role=body.role, permissions=[], is_active=True, added_by_id=admin.id)
        db.add(target)
    await db.flush()
    await db.refresh(target)
    await log_admin_action(db=db, admin=admin, action="staff.add", entity_type="admin_user", entity_id=target.id,
                           after_data={"telegram_id": target.telegram_id, "role": target.role.value},
                           ip_address=request.client.host if request.client else None)
    return (await _staff_out(db, [target]))[0]


class StaffPatchIn(BaseModel):
    role: AdminRole | None = None
    is_active: bool | None = None


async def _active_owners(db) -> int:
    return (await db.execute(
        select(func.count()).select_from(AdminUser)
        .where(AdminUser.role == AdminRole.owner, AdminUser.is_active.is_(True))
    )).scalar_one()


@router.patch("/{staff_id}", response_model=StaffOut, dependencies=PERM)
async def patch_staff(staff_id: uuid.UUID, body: StaffPatchIn, request: Request, admin: CurrentAdmin, db: DbSession):
    target = (await db.execute(select(AdminUser).where(AdminUser.id == staff_id).with_for_update())).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Сотрудник не найден")
    if target.id == admin.id:
        raise HTTPException(400, "Свою роль и доступ менять нельзя — попросите другого владельца")
    before = {"role": target.role.value, "is_active": target.is_active}
    losing_owner = target.role == AdminRole.owner and target.is_active and (
        (body.role is not None and body.role != AdminRole.owner) or body.is_active is False
    )
    if losing_owner and await _active_owners(db) <= 1:
        raise HTTPException(400, "Нельзя оставить магазин без владельца")
    if body.role == AdminRole.owner and admin.role != AdminRole.owner:
        raise HTTPException(403, "Назначить владельца может только владелец")
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
        if not body.is_active:
            await aas.revoke_all(db, target.id)
    await log_admin_action(db=db, admin=admin, action="staff.update", entity_type="admin_user", entity_id=target.id,
                           before_data=before, after_data={"role": target.role.value, "is_active": target.is_active},
                           ip_address=request.client.host if request.client else None)
    return (await _staff_out(db, [target]))[0]


@router.get("/{staff_id}/sessions", dependencies=PERM)
async def staff_sessions(staff_id: uuid.UUID, db: DbSession):
    return [session_out(s, None) for s in await aas.list_sessions(db, staff_id)]


@router.post("/{staff_id}/revoke-sessions", dependencies=PERM)
async def staff_revoke(staff_id: uuid.UUID, request: Request, admin: CurrentAdmin, db: DbSession):
    except_id = getattr(request.state, "admin_session_id", None) if staff_id == admin.id else None
    n = await aas.revoke_all(db, staff_id, except_id=except_id)
    await log_admin_action(db=db, admin=admin, action="staff.revoke_sessions", entity_type="admin_user",
                           entity_id=staff_id, after_data={"revoked": n})
    return {"revoked": n}
