"""
api/services/catalog_service.py
─────────────────────────────────────────────────────────────────────────────
Бизнес-логика каталога.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.models import (
    Category, Game, Product, ProductLot, Review,
    UserFavorite, UserViewedProduct,
    Order, OrderItem,
)

from api.schemas.catalog import ProductListOut


def _product_to_list_out(product: Product) -> ProductListOut:
    """Конвертирует ORM-объект Product в ProductListOut, включая game_name.

    Требует, чтобы product.category и product.category.game были уже загружены
    (через selectinload).
    """
    game_name: str | None = None
    game_slug: str | None = None
    if product.category and product.category.game:
        game_name = product.category.game.name
        game_slug = product.category.game.slug

    return ProductListOut(
        id=product.id,
        name=product.name,
        short_description=product.short_description,
        price=product.price,
        currency=product.currency,
        images=product.images,
        is_featured=product.is_featured,
        delivery_type=product.delivery_type,
        stock=product.stock,
        lots=product.lots,
        game_name=game_name,
        game_slug=game_slug,
    )


class CatalogService:

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Games ─────────────────────────────────────────────────────────────────

    async def get_active_games(self, type: str | None = None) -> list[Game]:
        q = select(Game).where(Game.is_active == True)
        if type is not None:
            q = q.where(Game.type == type)
        q = q.order_by(Game.sort_order, Game.name)
        result = await self.db.execute(q)
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
        category_id: uuid.UUID | None,
        page: int = 0,
        page_size: int = 20,
    ) -> tuple[list[Product], int]:
        """Возвращает (товары, total_count)."""
        base_query = (
            select(Product)
            .options(
                selectinload(Product.lots),
                selectinload(Product.category).selectinload(Category.game),
            )
            .where(Product.is_active == True)
            .order_by(Product.sort_order, Product.name)
        )
        if category_id is not None:
            base_query = base_query.where(Product.category_id == category_id)

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
            .options(
                selectinload(Product.lots),
                selectinload(Product.category).selectinload(Category.game),
            )
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
            .options(
                selectinload(Product.lots),
                selectinload(Product.category).selectinload(Category.game),
            )
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
            .options(
                selectinload(Product.lots),
                selectinload(Product.category).selectinload(Category.game),
            )
            .where(UserViewedProduct.user_id == user_id, Product.is_active == True)
            .order_by(UserViewedProduct.viewed_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    # ── Trending ──────────────────────────────────────────────────────────────

    async def get_trending_categories(self, limit: int = 6) -> list[Category]:
        """Топ-N категорий по количеству заказов за последние 3 дня."""
        since = datetime.now(timezone.utc) - timedelta(days=3)

        trending_subq = (
            select(
                Product.category_id,
                func.count(OrderItem.id).label("order_count"),
            )
            .join(OrderItem, OrderItem.product_id == Product.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.created_at >= since)
            .group_by(Product.category_id)
            .subquery()
        )

        result = await self.db.execute(
            select(Category)
            .join(trending_subq, trending_subq.c.category_id == Category.id)
            .options(selectinload(Category.game))
            .where(Category.is_active == True)
            .order_by(trending_subq.c.order_count.desc())
            .limit(limit)
        )
        categories = result.scalars().all()

        # Fallback: если нет данных за 3 дня — показываем закреплённые категории
        if not categories:
            fallback = await self.db.execute(
                select(Category)
                .options(selectinload(Category.game))
                .where(Category.is_active == True, Category.is_featured == True)
                .order_by(Category.sort_order, Category.name)
                .limit(limit)
            )
            categories = fallback.scalars().all()

        return categories

    async def get_trending(self, limit: int = 6) -> list[Product]:
        """Топ-N товаров по количеству заказов за последние 3 дня."""
        since = datetime.now(timezone.utc) - timedelta(days=3)

        # Подзапрос: product_id → кол-во позиций в заказах за 3 дня
        trending_subq = (
            select(
                OrderItem.product_id,
                func.count(OrderItem.id).label("order_count"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.created_at >= since)
            .group_by(OrderItem.product_id)
            .order_by(func.count(OrderItem.id).desc())
            .limit(limit)
            .subquery()
        )

        result = await self.db.execute(
            select(Product)
            .join(trending_subq, trending_subq.c.product_id == Product.id)
            .options(
                selectinload(Product.lots),
                selectinload(Product.category).selectinload(Category.game),
            )
            .where(Product.is_active == True)
            .order_by(trending_subq.c.order_count.desc())
        )
        return result.scalars().all()
