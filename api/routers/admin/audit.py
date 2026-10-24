"""
api/routers/admin/audit.py — журнал действий сотрудников (admin_action_log).
Право audit.view: владелец и администратор.
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from api.deps import DbSession
from api.deps_admin import require_permission
from shared.models import AdminActionLog, AdminUser

router = APIRouter()
PERM = [require_permission("audit.view")]

# Понятные названия действий для журнала (остальные показываются как есть)
ACTION_LABELS = {
    "admin.login": "Вход в админку",
    "admin.session_revoke": "Завершение сессии",
    "admin.session_revoke_all": "Завершение всех сессий",
    "admin.credentials_set": "Почта и пароль для входа",
    "staff.add": "Добавлен сотрудник",
    "staff.update": "Изменён сотрудник",
    "staff.revoke_sessions": "Завершены сессии сотрудника",
    "order.status_change": "Статус заказа",
    "review.visibility": "Видимость отзыва",
    "shop_settings.home_update": "Главная сайта",
}


def _label(action: str) -> str:
    return ACTION_LABELS.get(action, action)


@router.get("", dependencies=PERM)
async def audit_log(
    db: DbSession,
    admin_id: uuid.UUID | None = None,
    action: str | None = Query(None, max_length=128, description="точное действие или префикс с точкой: order."),
    entity_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    q = select(AdminActionLog, AdminUser).join(AdminUser, AdminUser.id == AdminActionLog.admin_id)
    if admin_id:
        q = q.where(AdminActionLog.admin_id == admin_id)
    if action:
        q = q.where(AdminActionLog.action.startswith(action) if action.endswith(".") else AdminActionLog.action == action)
    if entity_id:
        q = q.where(AdminActionLog.entity_id == entity_id)
    if date_from:
        q = q.where(AdminActionLog.created_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        q = q.where(AdminActionLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, timezone.utc))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(AdminActionLog.created_at.desc()).offset(offset).limit(limit))).all()
    return {
        "total": total,
        "items": [{
            "id": log.id, "created_at": log.created_at, "action": log.action, "action_label": _label(log.action),
            "entity_type": log.entity_type, "entity_id": log.entity_id,
            "before": log.before_data, "after": log.after_data, "description": log.description,
            "ip": log.ip_address,
            "admin": {"id": a.id, "name": a.first_name or (f"@{a.username}" if a.username else str(a.telegram_id)),
                      "username": a.username},
        } for log, a in rows],
    }


@router.get("/actions", dependencies=PERM)
async def audit_actions(db: DbSession):
    """Какие действия встречаются в журнале — для фильтра."""
    rows = (await db.execute(
        select(AdminActionLog.action, func.count()).group_by(AdminActionLog.action).order_by(func.count().desc())
    )).all()
    return [{"action": a, "label": _label(a), "count": n} for a, n in rows]
