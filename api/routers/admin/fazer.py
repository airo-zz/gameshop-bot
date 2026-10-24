"""
api/routers/admin/fazer.py
─────────────────────────────────────────────────────────────────────────────
FazerCards в админке: настройки и баланс, каталог поставщика, импорт номиналов
в товары, привязка товара, повтор выдачи позиции. Логика — fazer_service.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services import fazer_config, fazer_service
from api.services.fazer_service import FazerServiceError
from api.utils.admin_log import log_admin_action

router = APIRouter()


def _err(e: FazerServiceError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))


# ── Настройки ────────────────────────────────────────────────────────────────


class FazerConfigIn(BaseModel):
    enabled: bool | None = None
    api_key: str | None = Field(None, max_length=200)   # "" — не менять, "-" — удалить
    low_balance: float | None = Field(None, ge=0, le=100000)


@router.get("/overview", dependencies=[require_permission("settings.view")])
async def get_overview(db: DbSession, admin: CurrentAdmin) -> dict:
    return await fazer_service.overview(db)


@router.patch("/config", dependencies=[require_permission("settings.edit")])
async def update_config(body: FazerConfigIn, db: DbSession, admin: CurrentAdmin) -> dict:
    await fazer_config.update_config(db, enabled=body.enabled, api_key=body.api_key, low_balance=body.low_balance)
    if body.api_key:
        fazer_service.clear_cache()
    # секрет в журнал не пишем
    await log_admin_action(
        db=db, admin=admin, action="shop_settings.fazer_update", entity_type="shop_settings", entity_id=None,
        after_data={"enabled": body.enabled, "api_key_changed": bool(body.api_key), "low_balance": body.low_balance},
    )
    return await fazer_service.overview(db)


# ── Каталог поставщика ───────────────────────────────────────────────────────

Kind = Literal["topup", "giftcard"]


@router.get("/games", dependencies=[require_permission("catalog.edit")])
async def search_games(db: DbSession, admin: CurrentAdmin, kind: Kind = "topup",
                       q: str = Query("", max_length=100)) -> dict:
    try:
        return await fazer_service.search_games(db, kind, q)
    except FazerServiceError as e:
        raise _err(e) from e


@router.get("/game", dependencies=[require_permission("catalog.edit")])
async def game_details(db: DbSession, admin: CurrentAdmin, category_id: str = Query(..., max_length=120),
                       kind: Kind = "topup", fresh: bool = False) -> dict:
    try:
        return await fazer_service.game_details(db, kind, category_id, fresh)
    except FazerServiceError as e:
        raise _err(e) from e


@router.get("/steam-rates", dependencies=[require_permission("catalog.edit")])
async def steam_rates(db: DbSession, admin: CurrentAdmin) -> dict:
    try:
        return await fazer_service.steam_rates(db)
    except FazerServiceError as e:
        raise _err(e) from e


# ── Импорт и привязка ────────────────────────────────────────────────────────


class ImportIn(BaseModel):
    category_id: uuid.UUID
    kind: Kind
    fazer_category_id: str = Field(..., max_length=120)
    offer_ids: list[str] = Field(..., min_length=1, max_length=200)
    margin_percent: float = Field(30, ge=-50, le=1000)
    apply_fields: bool = True
    validate_id: bool = True


class SteamImportIn(BaseModel):
    category_id: uuid.UUID
    currency: Literal["USD", "RUB", "UAH", "KZT"] = "USD"
    margin_percent: float = Field(30, ge=-50, le=1000)
    name: str | None = Field(None, max_length=200)
    min_amount: int = Field(1, ge=1, le=100000)


class LinkIn(BaseModel):
    mapping: dict[str, Any] | None   # None — отвязать


@router.post("/import", dependencies=[require_permission("catalog.edit")])
async def import_offers(body: ImportIn, db: DbSession, admin: CurrentAdmin) -> dict:
    try:
        res = await fazer_service.import_offers(
            db, category_id=body.category_id, kind=body.kind, fazer_category_id=body.fazer_category_id,
            offer_ids=body.offer_ids, margin_percent=body.margin_percent,
            apply_fields=body.apply_fields, validate=body.validate_id,
        )
    except FazerServiceError as e:
        raise _err(e) from e
    await log_admin_action(
        db=db, admin=admin, action="product.fazer_import", entity_type="category", entity_id=body.category_id,
        after_data={"kind": body.kind, "fazer_category_id": body.fazer_category_id, "created": res["created"],
                    "margin_percent": body.margin_percent},
    )
    return res


@router.post("/import-steam", dependencies=[require_permission("catalog.edit")])
async def import_steam(body: SteamImportIn, db: DbSession, admin: CurrentAdmin) -> dict:
    try:
        res = await fazer_service.create_steam_product(
            db, category_id=body.category_id, currency=body.currency, margin_percent=body.margin_percent,
            name=body.name, min_amount=body.min_amount,
        )
    except FazerServiceError as e:
        raise _err(e) from e
    await log_admin_action(
        db=db, admin=admin, action="product.fazer_import", entity_type="category", entity_id=body.category_id,
        after_data={"kind": "steam_topup", "currency": body.currency, "margin_percent": body.margin_percent},
    )
    return res


@router.put("/products/{product_id}/link", dependencies=[require_permission("catalog.edit")])
async def link_product(product_id: uuid.UUID, body: LinkIn, db: DbSession, admin: CurrentAdmin) -> dict:
    try:
        product = await fazer_service.link_product(db, product_id, body.mapping)
    except FazerServiceError as e:
        raise _err(e) from e
    await log_admin_action(
        db=db, admin=admin, action="product.fazer_link", entity_type="product", entity_id=product_id,
        after_data={"fazer": (product.meta or {}).get("fazer")},
    )
    return {"meta": product.meta, "delivery_type": product.delivery_type.value}


# ── Повтор выдачи ────────────────────────────────────────────────────────────


class RedeliverIn(BaseModel):
    fields: dict[str, str] = Field(default_factory=dict, max_length=20)


@router.post("/order-items/{item_id}/redeliver", dependencies=[require_permission("orders.update_status")])
async def redeliver(item_id: uuid.UUID, body: RedeliverIn, db: DbSession, admin: CurrentAdmin) -> dict:
    try:
        await fazer_service.redeliver_item(db, item_id, body.fields)
    except FazerServiceError as e:
        raise _err(e) from e
    await log_admin_action(
        db=db, admin=admin, action="order.fazer_redeliver", entity_type="order_item", entity_id=item_id,
        after_data={"fields": list(body.fields)},
    )
    return {"ok": True}
