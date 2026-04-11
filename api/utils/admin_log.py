"""
api/utils/admin_log.py
─────────────────────────────────────────────────────────────────────────────
Запись действий администратора в admin_action_log.
Вызывается из роутеров/сервисов API после каждого значимого изменения.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AdminActionLog, AdminUser


async def log_admin_action(
    db: AsyncSession,
    admin: AdminUser,
    action: str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    before_data: dict[str, Any] | None = None,
    after_data: dict[str, Any] | None = None,
    description: str | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Записывает действие администратора в лог.

    Параметры:
        action      — строка вида "game.create", "order.status_change"
        entity_type — "game", "product", "order", "user" и т.д.
        entity_id   — UUID объекта который изменили
        before_data — состояние ДО (для изменений)
        after_data  — состояние ПОСЛЕ
        description — произвольный комментарий
        ip_address  — IP-адрес клиента (доступен в API через Request)
    """
    log_entry = AdminActionLog(
        admin_id=admin.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_data=before_data,
        after_data=after_data,
        description=description,
        ip_address=ip_address,
    )
    db.add(log_entry)
    # Не делаем commit здесь — он будет в middleware после handler
