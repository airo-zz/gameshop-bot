"""
api/routers/admin/dashboard.py
"""

from fastapi import APIRouter
from sqlalchemy import select, func

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services.analytics_service import AnalyticsService
from shared.models import Product

router = APIRouter()


@router.get("", dependencies=[require_permission("analytics.view")])
async def get_dashboard(
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    svc = AnalyticsService(db)
    data = await svc.get_full_analytics()

    # Product counts
    products_total_r = await db.execute(
        select(func.count()).select_from(Product).where(Product.is_active == True)
    )
    products_total = products_total_r.scalar() or 0

    products_oos_r = await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True, Product.stock == 0
        )
    )
    products_out_of_stock = products_oos_r.scalar() or 0

    # Flat structure matching frontend DashboardStats
    return {
        "orders_today": data.orders.new + data.orders.paid + data.orders.processing,
        "orders_week": data.revenue.orders_count,
        "orders_total": data.orders.total,
        "revenue_today": float(data.revenue.today),
        "revenue_week": float(data.revenue.week),
        "revenue_total": float(data.revenue.total),
        "users_total": data.users.total,
        "users_today": data.users.today,
        "pending_orders": data.orders.new + data.orders.paid + data.orders.processing,
        "products_total": products_total,
        "products_out_of_stock": products_out_of_stock,
    }
