"""
api/services/catalog_service.py
─────────────────────────────────────────────────────────────────────────────
Бизнес-логика каталога.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.models import (
    Category, Game, Product, ProductLot, Review,
    UserFavorite, UserViewedProduct,
)


class CatalogService:

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Games ─────────────────────────────────────────────────────────────────

    async def get_active_games(self) -> list[Game]:
        result = await self.db.execute(
            select(Game)
            .where(Game.is_active == True)
            .order_by(Game.sort_order, Game.name)
        )
        return result.scalars().all()

    async def get_game_by_slug(self, slug: str) -> Game | None:
        result = await self.db.execute(
            select(Game).where(Game.slug == slug, Game.is_active == True)
        )
        return result.scalar_one_or_none()

    # ── Categories ────────────────────────────────────────────────────────────

    async def get_categories_by_game(self, game_id: uuid.UUID) -> list[Category]:
        """Возвращает корневые категории игры с подкатегориями."""
        result = await self.db.execute(
            select(Category)
            .options(selectinload(Category.children))
            .where(
                Category.game_id == game_id,
                Category.parent_id == None,
                Category.is_active == True,
            )
            .order_by(Category.sort_order, Category.name)
        )
        return result.scalars().all()

    # ── Products ──────────────────────────────────────────────────────────────

    async def get_products_by_category(
        self,
        category_id: uuid.UUID,
        page: int = 0,
        page_size: int = 20,
    ) -> tuple[list[Product], int]:
        """Возвращает (товары, total_count)."""
        base_query = (
            select(Product)
            .options(selectinload(Product.lots))
            .where(
                Product.category_id == category_id,
                Product.is_active == True,
            )
            .order_by(Product.sort_order, Product.name)
        )

        # Total
        count_result = await self.db.execute(
            select(func.count()).select_from(base_query.subquery())
        )
        total = count_result.scalar_one()

        # Page
        result = await self.db.execute(
            base_query.offset(page * page_size).limit(page_size)
        )
        return result.scalars().all(), total

    async def get_product_detail(self, product_id: uuid.UUID) -> Product | None:
        result = await self.db.execute(
            select(Product)
            .options(
                selectinload(Product.lots),
                selectinload(Product.reviews),
                selectinload(Product.category).selectinload(Category.game),
            )
            .where(Product.id == product_id, Product.is_active == True)
        )
        return result.scalar_one_or_none()

    async def get_product_avg_rating(self, product_id: uuid.UUID) -> tuple[float | None, int]:
        """Возвращает (avg_rating, reviews_count)."""
        result = await self.db.execute(
            select(
                func.avg(Review.rating).label("avg"),
                func.count(Review.id).label("cnt"),
            ).where(
                Review.product_id == product_id,
                Review.is_visible == True,
            )
        )
        row = result.one()
        avg = float(row.avg) if row.avg else None
        return avg, row.cnt

    async def search_products(
        self,
        query: str,
        game_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        min_price: Decimal | None = None,
        max_price: Decimal | None = None,
        delivery_type: str | None = None,
        page: int = 0,
        page_size: int = 20,
    ) -> tuple[list[Product], int]:
        """Полнотекстовый поиск по каталогу."""
        q = (
            select(Product)
            .options(selectinload(Product.lots))
            .where(Product.is_active == True)
        )

        if query:
            q = q.where(
                Product.name.ilike(f"%{query}%") |
                Product.description.ilike(f"%{query}%") |
                Product.tags.any(query.lower())
            )
        if game_id:
            q = q.join(Product.category).where(Category.game_id == game_id)
        if category_id:
            q = q.where(Product.category_id == category_id)
        if min_price:
            q = q.where(Product.price >= min_price)
        if max_price:
            q = q.where(Product.price <= max_price)
        if delivery_type:
            q = q.where(Product.delivery_type == delivery_type)

        count_result = await self.db.execute(
            select(func.count()).select_from(q.subquery())
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            q.order_by(Product.is_featured.desc(), Product.sort_order)
             .offset(page * page_size).limit(page_size)
        )
        return result.scalars().all(), total

    # ── Favorites ─────────────────────────────────────────────────────────────

    async def get_favorites(self, user_id: uuid.UUID) -> list[Product]:
        result = await self.db.execute(
            select(Product)
            .join(UserFavorite, UserFavorite.product_id == Product.id)
            .options(selectinload(Product.lots))
            .where(UserFavorite.user_id == user_id, Product.is_active == True)
            .order_by(UserFavorite.added_at.desc())
        )
        return result.scalars().all()

    async def toggle_favorite(self, user_id: uuid.UUID, product_id: uuid.UUID) -> bool:
        """Добавить/убрать из избранного. Возвращает True если добавлено."""
        result = await self.db.execute(
            select(UserFavorite).where(
                UserFavorite.user_id == user_id,
                UserFavorite.product_id == product_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            await self.db.delete(existing)
            return False
        else:
            self.db.add(UserFavorite(user_id=user_id, product_id=product_id))
            return True

    async def get_favorite_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        result = await self.db.execute(
            select(UserFavorite.product_id).where(UserFavorite.user_id == user_id)
        )
        return set(result.scalars().all())

    # ── Recently Viewed ───────────────────────────────────────────────────────

    async def track_view(self, user_id: uuid.UUID, product_id: uuid.UUID) -> None:
        """Записывает просмотр. Хранит последние 20 на пользователя."""
        from datetime import datetime, timezone
        from sqlalchemy.dialects.postgresql import insert

        # Upsert — обновляем viewed_at если уже есть
        stmt = (
            insert(UserViewedProduct)
            .values(user_id=user_id, product_id=product_id,
                    viewed_at=datetime.now(timezone.utc))
            .on_conflict_do_update(
                constraint="uq_user_viewed",
                set_={"viewed_at": datetime.now(timezone.utc)},
            )
        )
        await self.db.execute(stmt)

        # Чистим старые (оставляем последние 20)
        subq = (
            select(UserViewedProduct.product_id)
            .where(UserViewedProduct.user_id == user_id)
            .order_by(UserViewedProduct.viewed_at.desc())
            .limit(20)
            .subquery()
        )
        await self.db.execute(
            UserViewedProduct.__table__.delete().where(
                UserViewedProduct.user_id == user_id,
                UserViewedProduct.product_id.not_in(select(subq.c.product_id)),
            )
        )

    async def get_recently_viewed(self, user_id: uuid.UUID, limit: int = 10) -> list[Product]:
        result = await self.db.execute(
            select(Product)
            .join(UserViewedProduct, UserViewedProduct.product_id == Product.id)
            .options(selectinload(Product.lots))
            .where(UserViewedProduct.user_id == user_id, Product.is_active == True)
            .order_by(UserViewedProduct.viewed_at.desc())
            .limit(limit)
        )
        return result.scalars().all()
