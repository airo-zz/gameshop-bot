"""
api/services/review_service.py
─────────────────────────────────────────────────────────────────────────────
Отзывы о магазине: публичный список и сводка (сайт, миниапп), отзыв
покупателя по выполненному заказу, модерация в админке.
Источники — 'site' (наши покупатели) и 'ggsel' (api/services/ggsel_reviews.py).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.models import Category, Game, Order, OrderItem, OrderStatus, Product, Review, User

KINDS = ("all", "positive", "negative", "text")
TEXT_MAX = 1000


class ReviewError(ValueError):
    pass


@dataclass
class Summary:
    total: int
    positive: int
    negative: int

    @property
    def percent(self) -> float:
        return round(self.positive * 100 / self.total, 1) if self.total else 0.0


def _author(r: Review) -> str:
    if r.source == "site" and r.user and r.user.first_name:
        last = (r.user.last_name or "").strip()
        return f"{r.user.first_name.strip()} {last[0]}." if last else r.user.first_name.strip()
    return "Покупатель"


def review_out(r: Review, admin: bool = False) -> dict:
    game = r.game if r.game and r.game.is_active else None
    out = {
        "id": r.id,
        "source": r.source,
        "positive": r.rating >= 4,
        "text": r.text,
        "reply": r.reply,
        "author": _author(r),
        "game_name": game.name if game else (r.game.name if r.game else r.game_name),
        "game_slug": game.slug if game else None,
        "game_image_url": game.image_url if game else None,
        # Названия лотов GGSEL — рекламные («24/7 - … | …»), показываем только свои
        "product_name": r.product_name if r.source == "site" else None,
        "created_at": r.created_at,
    }
    if admin:
        out.update(is_visible=r.is_visible, external_id=r.external_id,
                   product_name=r.product_name, order_id=r.order_id)
    return out


def _filtered(stmt, kind: str):
    if kind == "positive":
        return stmt.where(Review.rating >= 4)
    if kind == "negative":
        return stmt.where(Review.rating < 4)
    if kind == "text":
        return stmt.where(Review.text.is_not(None))
    return stmt


class ReviewService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _game_id(self, slug: str | None) -> uuid.UUID | None:
        if not slug:
            return None
        gid = (await self.db.execute(select(Game.id).where(Game.slug == slug))).scalar_one_or_none()
        if gid is None:
            raise ReviewError("Игра не найдена")
        return gid

    async def summary(self, game_slug: str | None = None) -> Summary:
        stmt = select(
            func.count(Review.id),
            func.coalesce(func.sum(case((Review.rating >= 4, 1), else_=0)), 0),
        ).where(Review.is_visible == True)  # noqa: E712
        gid = await self._game_id(game_slug)
        if gid:
            stmt = stmt.where(Review.game_id == gid)
        total, positive = (await self.db.execute(stmt)).one()
        return Summary(total=int(total), positive=int(positive), negative=int(total) - int(positive))

    async def list_public(
        self, game_slug: str | None = None, kind: str = "all", offset: int = 0, limit: int = 20,
    ) -> tuple[list[dict], bool]:
        stmt = (
            select(Review)
            .options(selectinload(Review.game), selectinload(Review.user))
            .where(Review.is_visible == True)  # noqa: E712
        )
        gid = await self._game_id(game_slug)
        if gid:
            stmt = stmt.where(Review.game_id == gid)
        stmt = _filtered(stmt, kind)
        # Один день у GGSEL без времени — внутри дня сначала с текстом
        stmt = stmt.order_by(
            Review.created_at.desc(), Review.text.is_(None), Review.id.desc()
        ).offset(offset).limit(limit + 1)
        rows = list((await self.db.execute(stmt)).scalars().all())
        return [review_out(r) for r in rows[:limit]], len(rows) > limit

    # ── Отзыв покупателя ─────────────────────────────────────────────────────

    async def get_for_order(self, user: User, order_id: uuid.UUID) -> tuple[bool, dict | None]:
        """(можно ли оставить отзыв, уже оставленный отзыв)."""
        order = (
            await self.db.execute(select(Order).where(Order.id == order_id, Order.user_id == user.id))
        ).scalar_one_or_none()
        if not order:
            raise ReviewError("Заказ не найден")
        review = (
            await self.db.execute(
                select(Review).options(selectinload(Review.game), selectinload(Review.user))
                .where(Review.order_id == order_id)
            )
        ).scalar_one_or_none()
        can = order.status == OrderStatus.completed and review is None
        return can, (review_out(review) if review else None)

    async def create_for_order(
        self, user: User, order_id: uuid.UUID, positive: bool, text: str | None,
    ) -> dict:
        order = (
            await self.db.execute(
                select(Order).options(selectinload(Order.items))
                .where(Order.id == order_id, Order.user_id == user.id)
            )
        ).scalar_one_or_none()
        if not order:
            raise ReviewError("Заказ не найден")
        if order.status != OrderStatus.completed:
            raise ReviewError("Отзыв можно оставить после выполнения заказа")
        exists = (
            await self.db.execute(select(Review.id).where(Review.order_id == order_id))
        ).scalar_one_or_none()
        if exists:
            raise ReviewError("Отзыв на этот заказ уже оставлен")

        text = (text or "").strip()[:TEXT_MAX] or None
        if not positive and not text:
            raise ReviewError("Расскажите, что пошло не так — мы разберёмся")

        item: OrderItem | None = order.items[0] if order.items else None
        game_id = None
        if item and item.product_id:
            game_id = (
                await self.db.execute(
                    select(Category.game_id).join(Product, Product.category_id == Category.id)
                    .where(Product.id == item.product_id)
                )
            ).scalar_one_or_none()
        names = list(dict.fromkeys(i.product_name for i in order.items))
        review = Review(
            source="site",
            user_id=user.id,
            order_id=order.id,
            product_id=item.product_id if item else None,
            game_id=game_id,
            game_name=item.game_name if item else None,
            product_name=", ".join(names)[:255] or None,
            rating=5 if positive else 1,
            text=text,
            is_visible=True,
        )
        self.db.add(review)
        await self.db.commit()
        await self.db.refresh(review, ["game", "user"])
        return review_out(review)

    # ── Админка ──────────────────────────────────────────────────────────────

    async def list_admin(
        self, source: str | None, kind: str, hidden: bool | None, offset: int, limit: int,
    ) -> tuple[list[dict], int]:
        base = select(Review)
        if source:
            base = base.where(Review.source == source)
        if hidden is not None:
            base = base.where(Review.is_visible == (not hidden))
        base = _filtered(base, kind)
        total = (await self.db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (
            await self.db.execute(
                base.options(selectinload(Review.game), selectinload(Review.user))
                .order_by(Review.created_at.desc(), Review.id.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return [review_out(r, admin=True) for r in rows], int(total)

    async def set_visible(self, review_id: uuid.UUID, visible: bool) -> dict:
        r = (
            await self.db.execute(
                select(Review).options(selectinload(Review.game), selectinload(Review.user))
                .where(Review.id == review_id)
            )
        ).scalar_one_or_none()
        if not r:
            raise ReviewError("Отзыв не найден")
        r.is_visible = visible
        await self.db.commit()
        return review_out(r, admin=True)
