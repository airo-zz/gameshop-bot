"""
api/services/analytics_service.py
─────────────────────────────────────────────────────────────────────────────
Аналитика магазина.

Метрики:
  - Выручка (день / неделя / месяц / всё время)
  - Заказы по статусам
  - Конверсия корзина → заказ
  - Популярные товары и игры
  - Новые пользователи
  - Брошенные корзины
  - Средний чек
  - Динамика (график по дням)
─────────────────────────────────────────────────────────────────────────────
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import (
    AbandonedCart,
    Order,
    OrderItem,
    OrderStatus,
    User,
)


@dataclass
class RevenueStats:
    total: Decimal
    today: Decimal
    week: Decimal
    month: Decimal
    avg_order: Decimal
    orders_count: int


@dataclass
class OrdersStats:
    total: int
    new: int
    pending_payment: int
    paid: int
    processing: int
    clarification: int
    completed: int
    cancelled: int
    completion_rate: float  # completed / (completed + cancelled)


@dataclass
class UsersStats:
    total: int
    today: int
    week: int
    month: int
    with_orders: int  # Хоть раз покупали
    active_week: int  # Активны за 7 дней


@dataclass
class TopProduct:
    product_id: str
    name: str
    orders_count: int
    revenue: Decimal


@dataclass
class DailyPoint:
    date: str  # "2025-01-15"
    revenue: Decimal
    orders: int
    new_users: int


@dataclass
class FullAnalytics:
    revenue: RevenueStats
    orders: OrdersStats
    users: UsersStats
    top_products: list[TopProduct]
    top_games: list[dict]
    daily_7d: list[DailyPoint]
    abandoned_carts_count: int
    conversion_rate: float  # заказы / уникальные пользователи с корзиной


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_full_analytics(self) -> FullAnalytics:
        revenue = await self._get_revenue_stats()
        orders = await self._get_orders_stats()
        users = await self._get_users_stats()
        top_prods = await self._get_top_products(limit=10)
        top_games = await self._get_top_games(limit=5)
        daily = await self._get_daily_stats(days=7)
        abandoned = await self._get_abandoned_count()
        conv = await self._get_conversion_rate()

        return FullAnalytics(
            revenue=revenue,
            orders=orders,
            users=users,
            top_products=top_prods,
            top_games=top_games,
            daily_7d=daily,
            abandoned_carts_count=abandoned,
            conversion_rate=conv,
        )

    # ── Выручка ───────────────────────────────────────────────────────────────

    async def _get_revenue_stats(self) -> RevenueStats:
        now = datetime.now(timezone.utc)

        async def revenue_since(since: datetime) -> Decimal:
            result = await self.db.execute(
                select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                    Order.status == OrderStatus.completed,
                    Order.completed_at >= since,
                )
            )
            return Decimal(str(result.scalar_one()))

        async def orders_count_since(since: datetime) -> int:
            result = await self.db.execute(
                select(func.count(Order.id)).where(
                    Order.status == OrderStatus.completed,
                    Order.completed_at >= since,
                )
            )
            return result.scalar_one()

        total_result = await self.db.execute(
            select(
                func.coalesce(func.sum(Order.total_amount), 0),
                func.count(Order.id),
            ).where(Order.status == OrderStatus.completed)
        )
        total_row = total_result.one()
        total_revenue = Decimal(str(total_row[0]))
        total_orders = int(total_row[1])

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        today_rev = await revenue_since(today_start)
        week_rev = await revenue_since(week_start)
        month_rev = await revenue_since(month_start)

        avg = total_revenue / total_orders if total_orders > 0 else Decimal("0")

        return RevenueStats(
            total=total_revenue,
            today=today_rev,
            week=week_rev,
            month=month_rev,
            avg_order=avg.quantize(Decimal("0.01")),
            orders_count=total_orders,
        )

    # ── Заказы по статусам ────────────────────────────────────────────────────

    async def _get_orders_stats(self) -> OrdersStats:
        result = await self.db.execute(
            select(Order.status, func.count(Order.id)).group_by(Order.status)
        )
        rows = result.all()
        counts: dict[str, int] = {row[0].value: row[1] for row in rows}

        completed = counts.get("completed", 0)
        cancelled = counts.get("cancelled", 0)
        denom = completed + cancelled
        completion_rate = (completed / denom * 100) if denom > 0 else 0.0

        return OrdersStats(
            total=sum(counts.values()),
            new=counts.get("new", 0),
            pending_payment=counts.get("pending_payment", 0),
            paid=counts.get("paid", 0),
            processing=counts.get("processing", 0),
            clarification=counts.get("clarification", 0),
            completed=completed,
            cancelled=cancelled,
            completion_rate=round(completion_rate, 1),
        )

    # ── Пользователи ──────────────────────────────────────────────────────────

    async def _get_users_stats(self) -> UsersStats:
        now = datetime.now(timezone.utc)

        total_result = await self.db.execute(select(func.count(User.id)))
        total = total_result.scalar_one()

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        async def count_since(col, since: datetime) -> int:
            r = await self.db.execute(select(func.count(User.id)).where(col >= since))
            return r.scalar_one()

        today_new = await count_since(User.created_at, today_start)
        week_new = await count_since(User.created_at, week_start)
        month_new = await count_since(User.created_at, month_start)
        active_week = await count_since(User.last_active_at, week_start)

        buyers_result = await self.db.execute(
            select(func.count(User.id)).where(User.orders_count > 0)
        )
        with_orders = buyers_result.scalar_one()

        return UsersStats(
            total=total,
            today=today_new,
            week=week_new,
            month=month_new,
            with_orders=with_orders,
            active_week=active_week,
        )

    # ── Топ товаров ───────────────────────────────────────────────────────────

    async def _get_top_products(self, limit: int = 10) -> list[TopProduct]:
        result = await self.db.execute(
            select(
                OrderItem.product_id,
                OrderItem.product_name,
                func.count(OrderItem.id).label("cnt"),
                func.sum(OrderItem.total_price).label("rev"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status == OrderStatus.completed)
            .group_by(OrderItem.product_id, OrderItem.product_name)
            .order_by(func.count(OrderItem.id).desc())
            .limit(limit)
        )
        return [
            TopProduct(
                product_id=str(row.product_id),
                name=row.product_name,
                orders_count=row.cnt,
                revenue=Decimal(str(row.rev)),
            )
            for row in result.all()
        ]

    # ── Топ игр ───────────────────────────────────────────────────────────────

    async def _get_top_games(self, limit: int = 5) -> list[dict]:
        from shared.models import Game, Category, Product as Prod

        result = await self.db.execute(
            select(
                Game.name,
                func.count(OrderItem.id).label("cnt"),
                func.sum(OrderItem.total_price).label("rev"),
            )
            .join(Prod, Prod.id == OrderItem.product_id)
            .join(Category, Category.id == Prod.category_id)
            .join(Game, Game.id == Category.game_id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status == OrderStatus.completed)
            .group_by(Game.id, Game.name)
            .order_by(func.count(OrderItem.id).desc())
            .limit(limit)
        )
        return [
            {"name": row.name, "orders": row.cnt, "revenue": float(row.rev or 0)}
            for row in result.all()
        ]

    # ── Динамика по дням ──────────────────────────────────────────────────────

    async def _get_daily_stats(self, days: int = 7) -> list[DailyPoint]:
        now = datetime.now(timezone.utc)
        points = []

        for i in range(days - 1, -1, -1):
            day_start = (now - timedelta(days=i)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            day_end = day_start + timedelta(days=1)

            rev_result = await self.db.execute(
                select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                    Order.status == OrderStatus.completed,
                    Order.completed_at >= day_start,
                    Order.completed_at < day_end,
                )
            )
            orders_result = await self.db.execute(
                select(func.count(Order.id)).where(
                    Order.created_at >= day_start,
                    Order.created_at < day_end,
                )
            )
            users_result = await self.db.execute(
                select(func.count(User.id)).where(
                    User.created_at >= day_start,
                    User.created_at < day_end,
                )
            )

            points.append(
                DailyPoint(
                    date=day_start.strftime("%d.%m"),
                    revenue=Decimal(str(rev_result.scalar_one())),
                    orders=orders_result.scalar_one(),
                    new_users=users_result.scalar_one(),
                )
            )

        return points

    # ── Брошенные корзины ─────────────────────────────────────────────────────

    async def _get_abandoned_count(self) -> int:
        result = await self.db.execute(
            select(func.count(AbandonedCart.id)).where(AbandonedCart.recovered == False)
        )
        return result.scalar_one()

    # ── Конверсия ─────────────────────────────────────────────────────────────

    async def _get_conversion_rate(self) -> float:
        """
        Конверсия = пользователи с хотя бы 1 заказом / всего пользователей.
        """
        total_result = await self.db.execute(select(func.count(User.id)))
        total = total_result.scalar_one()
        if total == 0:
            return 0.0

        buyers_result = await self.db.execute(
            select(func.count(User.id)).where(User.orders_count > 0)
        )
        buyers = buyers_result.scalar_one()
        return round(buyers / total * 100, 1)

    # ── Экспорт заказов (CSV) ─────────────────────────────────────────────────

    async def export_orders_csv(self, since: datetime | None = None) -> str:
        """Генерирует CSV-строку со всеми завершёнными заказами."""
        import csv
        import io

        query = (
            select(Order)
            .where(Order.status == OrderStatus.completed)
            .order_by(Order.completed_at.desc())
        )
        if since:
            query = query.where(Order.completed_at >= since)

        result = await self.db.execute(query)
        orders = result.scalars().all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Номер",
                "Дата создания",
                "Дата выполнения",
                "Сумма",
                "Скидка",
                "Итого",
                "Метод оплаты",
            ]
        )

        for order in orders:
            writer.writerow(
                [
                    order.order_number,
                    order.created_at.strftime("%Y-%m-%d %H:%M"),
                    order.completed_at.strftime("%Y-%m-%d %H:%M")
                    if order.completed_at
                    else "",
                    order.subtotal,
                    order.discount_amount,
                    order.total_amount,
                    order.payment_method.value if order.payment_method else "",
                ]
            )

        return output.getvalue()
