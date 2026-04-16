"""
api/routers/admin/__init__.py
─────────────────────────────────────────────────────────────────────────────
Агрегирующий роутер для всей администраторской части API.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter

from . import auth, catalog, dashboard, discounts, orders, settings, support, users

router = APIRouter()
router.include_router(auth.router, tags=["Admin Auth"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["Admin Dashboard"])
router.include_router(orders.router, prefix="/orders", tags=["Admin Orders"])
router.include_router(users.router, prefix="/users", tags=["Admin Users"])
router.include_router(catalog.router, prefix="/catalog", tags=["Admin Catalog"])
router.include_router(discounts.router, prefix="/discounts", tags=["Admin Discounts"])
router.include_router(support.router, prefix="/support", tags=["Admin Support"])
router.include_router(settings.router, prefix="/settings", tags=["Admin Settings"])
