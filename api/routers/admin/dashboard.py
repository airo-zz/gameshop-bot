"""
api/routers/admin/dashboard.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинт аналитики для дашборда администратора.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("")
async def get_dashboard(
    db: DbSession,
    admin: CurrentAdmin = require_permission("analytics.view"),
) -> dict:
    """
    Полная аналитика магазина.

    Возвращает:
      - revenue: выручка (total, today, week, month, avg_order, orders_count)
      - orders: заказы по статусам + completion_rate
      - users: пользователи (total, today, week, month, with_orders, active_week)
      - top_products: топ-10 товаров по числу заказов
      - top_games: топ-5 игр
      - daily_7d: динамика за 7 дней (date, revenue, orders, new_users)
      - abandoned_carts_count: брошенные корзины
      - conversion_rate: % пользователей совершивших хотя бы 1 заказ
    """
    svc = AnalyticsService(db)
    data = await svc.get_full_analytics()

    return {
        "revenue": {
            "total": float(data.revenue.total),
            "today": float(data.revenue.today),
            "week": float(data.revenue.week),
            "month": float(data.revenue.month),
            "avg_order": float(data.revenue.avg_order),
            "orders_count": data.revenue.orders_count,
        },
        "orders": {
            "total": data.orders.total,
            "new": data.orders.new,
            "pending_payment": data.orders.pending_payment,
            "paid": data.orders.paid,
            "processing": data.orders.processing,
            "clarification": data.orders.clarification,
            "completed": data.orders.completed,
            "cancelled": data.orders.cancelled,
            "dispute": data.orders.dispute,
            "completion_rate": data.orders.completion_rate,
        },
        "users": {
            "total": data.users.total,
            "today": data.users.today,
            "week": data.users.week,
            "month": data.users.month,
            "with_orders": data.users.with_orders,
            "active_week": data.users.active_week,
        },
        "top_products": [
            {
                "product_id": p.product_id,
                "name": p.name,
                "orders_count": p.orders_count,
                "revenue": float(p.revenue),
            }
            for p in data.top_products
        ],
        "top_games": data.top_games,
        "daily_7d": [
            {
                "date": d.date,
                "revenue": float(d.revenue),
                "orders": d.orders,
                "new_users": d.new_users,
            }
            for d in data.daily_7d
        ],
        "abandoned_carts_count": data.abandoned_carts_count,
        "conversion_rate": data.conversion_rate,
    }
