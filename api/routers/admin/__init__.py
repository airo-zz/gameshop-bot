"""
api/routers/admin/__init__.py
─────────────────────────────────────────────────────────────────────────────
Агрегирующий роутер для всей администраторской части API.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter

from . import (
    audit,
    auth,
    catalog,
    chats,
    content,
    dashboard,
    decor,
    discounts,
    fazer,
    hub,
    orders,
    reviews,
    session_auth,
    settings,
    staff,
    support,
    users,
    workspace,
)

router = APIRouter()
router.include_router(auth.router, tags=["Admin Auth"])
router.include_router(session_auth.router, tags=["Admin Auth"])
router.include_router(workspace.router, tags=["Admin Workspace"])
router.include_router(staff.router, prefix="/staff", tags=["Admin Staff"])
router.include_router(audit.router, prefix="/audit", tags=["Admin Audit"])
router.include_router(content.router, prefix="/content", tags=["Admin Content"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["Admin Dashboard"])
router.include_router(orders.router, prefix="/orders", tags=["Admin Orders"])
router.include_router(users.router, prefix="/users", tags=["Admin Users"])
router.include_router(catalog.router, prefix="/catalog", tags=["Admin Catalog"])
router.include_router(discounts.router, prefix="/discounts", tags=["Admin Discounts"])
router.include_router(support.router, prefix="/support", tags=["Admin Support"])
router.include_router(settings.router, prefix="/settings", tags=["Admin Settings"])
router.include_router(fazer.router, prefix="/fazer", tags=["Admin FazerCards"])
router.include_router(hub.router, prefix="/hub", tags=["Admin Hub UchetFP"])
router.include_router(decor.router, prefix="/decor", tags=["Admin Discord Decor"])
router.include_router(chats.router, prefix="/chats", tags=["Admin Chats"])
router.include_router(reviews.router, prefix="/reviews", tags=["Admin Reviews"])
