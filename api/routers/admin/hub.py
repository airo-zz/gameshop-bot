"""
api/routers/admin/hub.py
─────────────────────────────────────────────────────────────────────────────
Хаб UchetFP в админке: включить связь, адрес и токен аккаунта reDonate,
проверка связи. Обмен сообщениями — worker/tasks/hub_tasks + hub_bridge.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services import hub_bridge, hub_config
from api.utils.admin_log import log_admin_action

router = APIRouter()


class HubConfigIn(BaseModel):
    enabled: bool | None = None
    url: str | None = Field(None, max_length=200, pattern=r"^(https?://[\w.\-:]+/?)?$")
    token: str | None = Field(None, max_length=200)   # "" — не менять, "-" — удалить


@router.get("/overview", dependencies=[require_permission("settings.view")])
async def get_overview(db: DbSession, admin: CurrentAdmin) -> dict:
    return await hub_config.overview(db)


@router.patch("/config", dependencies=[require_permission("settings.edit")])
async def update_config(body: HubConfigIn, db: DbSession, admin: CurrentAdmin) -> dict:
    await hub_config.update_config(db, enabled=body.enabled, url=body.url, token=body.token)
    # токен в журнал не пишем
    await log_admin_action(
        db=db, admin=admin, action="shop_settings.hub_update", entity_type="shop_settings", entity_id=None,
        after_data={"enabled": body.enabled, "url": body.url, "token_changed": bool(body.token)},
    )
    return await hub_config.overview(db)


@router.post("/test", dependencies=[require_permission("settings.edit")])
async def test_connection(db: DbSession, admin: CurrentAdmin) -> dict:
    """Heartbeat в хаб: проверяет адрес и токен (аккаунт в хабе станет «онлайн»)."""
    error = await hub_bridge.check_connection(db)
    await hub_config.mark_result(db, error)
    return {**await hub_config.overview(db), "test_error": error}
