"""api/routers/reviews.py — отзывы о магазине (сайт, миниапп)."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.deps import CurrentUser, DbSession
from api.rate_limit import limiter
from api.services.review_service import KINDS, TEXT_MAX, ReviewError, ReviewService

router = APIRouter()


class ReviewOut(BaseModel):
    id: UUID
    positive: bool
    text: str | None
    reply: str | None
    author: str
    game_name: str | None
    game_slug: str | None
    game_image_url: str | None
    product_name: str | None
    created_at: datetime


class SummaryOut(BaseModel):
    total: int
    positive: int
    negative: int
    percent: float


class ReviewListOut(BaseModel):
    summary: SummaryOut | None
    items: list[ReviewOut]
    has_more: bool


class OrderReviewOut(BaseModel):
    can_review: bool
    review: ReviewOut | None


class ReviewCreateIn(BaseModel):
    positive: bool
    text: str | None = Field(None, max_length=TEXT_MAX)


def _summary_out(s) -> SummaryOut:
    return SummaryOut(total=s.total, positive=s.positive, negative=s.negative, percent=s.percent)


@router.get("", response_model=ReviewListOut)
async def list_reviews(
    db: DbSession,
    game: str | None = Query(None, max_length=128, description="slug игры"),
    kind: str = Query("all", pattern="^(" + "|".join(KINDS) + ")$"),
    offset: int = Query(0, ge=0, le=100_000),
    limit: int = Query(20, ge=1, le=50),
):
    """Отзывы (новые сверху) и сводка — сводка только на первой странице."""
    svc = ReviewService(db)
    try:
        items, has_more = await svc.list_public(game, kind, offset, limit)
        summary = _summary_out(await svc.summary(game)) if offset == 0 else None
    except ReviewError as e:
        raise HTTPException(404, str(e))
    return ReviewListOut(summary=summary, items=items, has_more=has_more)


@router.get("/order/{order_id}", response_model=OrderReviewOut)
async def order_review(order_id: UUID, db: DbSession, user: CurrentUser):
    try:
        can, review = await ReviewService(db).get_for_order(user, order_id)
    except ReviewError as e:
        raise HTTPException(404, str(e))
    return OrderReviewOut(can_review=can, review=review)


@router.post("/order/{order_id}", response_model=ReviewOut)
@limiter.limit("5/minute")
async def create_order_review(
    request: Request, order_id: UUID, body: ReviewCreateIn, db: DbSession, user: CurrentUser,
):
    try:
        return await ReviewService(db).create_for_order(user, order_id, body.positive, body.text)
    except ReviewError as e:
        raise HTTPException(400, str(e))
