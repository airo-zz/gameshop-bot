"""
api/routers/admin/decor.py
─────────────────────────────────────────────────────────────────────────────
Украшения Discord в админке: таблица цен (формат лота GGSel, как в UchetFP),
базовая цена, статус синхронизации каталога и ручной запуск синхронизации.
Логика — api/services/decor_catalog.py.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services import decor_catalog
from api.utils.admin_log import log_admin_action

router = APIRouter()


class DecorSettingsIn(BaseModel):
    price_tiers: str | None = Field(None, max_length=20000)
    base_rub: int | None = Field(None, ge=0, le=100000)


@router.get("", dependencies=[require_permission("catalog.edit")])
async def get_settings(db: DbSession, admin: CurrentAdmin) -> dict:
    return await decor_catalog.get_settings_view(db)


@router.put("", dependencies=[require_permission("catalog.edit")])
async def update_settings(body: DecorSettingsIn, db: DbSession, admin: CurrentAdmin) -> dict:
    await decor_catalog.update_settings(db, price_tiers=body.price_tiers, base_rub=body.base_rub)
    # Цены пересчитываем сразу — чтобы владелец видел результат таблицы
    await decor_catalog.sync(db, force=True)
    await log_admin_action(
        db=db, admin=admin, action="shop_settings.decor_update", entity_type="shop_settings", entity_id=None,
        after_data={"tiers": len(decor_catalog.parse_price_tiers(body.price_tiers or "")), "base_rub": body.base_rub},
    )
    return await decor_catalog.get_settings_view(db)


@router.post("/sync", dependencies=[require_permission("catalog.edit")])
async def sync_now(db: DbSession, admin: CurrentAdmin) -> dict:
    await decor_catalog.sync(db, force=True)
    return await decor_catalog.get_settings_view(db)
