"""api/routers/admin/reviews.py — модерация отзывов и ручная синхронизация с GGSEL."""

import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services.review_service import KINDS, ReviewError, ReviewService
from api.utils.admin_log import log_admin_action

router = APIRouter()


class VisibilityIn(BaseModel):
    is_visible: bool


@router.get("", dependencies=[require_permission("products.view")])
async def list_reviews(
    db: DbSession,
    admin: CurrentAdmin,
    source: str | None = Query(None, pattern="^(site|ggsel)$"),
    kind: str = Query("all", pattern="^(" + "|".join(KINDS) + ")$"),
    hidden: bool | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    items, total = await ReviewService(db).list_admin(source, kind, hidden, offset, limit)
    return {"items": items, "total": total}


@router.patch("/{review_id}", dependencies=[require_permission("products.edit")])
async def set_visibility(review_id: uuid.UUID, body: VisibilityIn, db: DbSession, admin: CurrentAdmin):
    try:
        out = await ReviewService(db).set_visible(review_id, body.is_visible)
    except ReviewError as e:
        raise HTTPException(404, str(e))
    await log_admin_action(
        db=db, admin=admin, action="review.visibility",
        entity_type="review", entity_id=review_id, after_data={"is_visible": body.is_visible},
    )
    return out


@router.post("/sync-ggsel", dependencies=[require_permission("products.edit")])
async def sync_ggsel(db: DbSession, admin: CurrentAdmin):
    from api.services.ggsel_reviews import GgselError, sync_ggsel_reviews

    try:
        return await sync_ggsel_reviews(db)
    except (GgselError, OSError) as e:
        raise HTTPException(502, f"GGSEL: {e}")
