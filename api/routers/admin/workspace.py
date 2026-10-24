"""
api/routers/admin/workspace.py — общее для всей админки:
  GET /admin/badges  — счётчики в меню (новые оплаченные заказы, непрочитанные чаты)
  GET /admin/search  — общий поиск (Ctrl+K): заказы, покупатели, товары, игры
"""

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import selectinload

from api.deps import DbSession
from api.deps_admin import CurrentAdmin
from api.utils.search import escape_like
from shared.models import Category, Game, Order, OrderStatus, Product, User

router = APIRouter()

_UNREAD_CHATS = text("""
    SELECT count(*) FROM chats c
    WHERE EXISTS (
        SELECT 1 FROM chat_messages m
        WHERE m.chat_id = c.id AND m.sender_type = 'user'
          AND m.created_at > COALESCE(c.last_admin_read_at, '-infinity'::timestamptz)
    )
""")


@router.get("/badges")
async def badges(admin: CurrentAdmin, db: DbSession):
    out = {"new_orders": 0, "unread_chats": 0}
    if admin.has_permission("orders.view"):
        out["new_orders"] = (await db.execute(
            select(func.count()).select_from(Order).where(
                Order.status == OrderStatus.paid,
                Order.assigned_admin_id.is_(None),
                Order.deleted_at.is_(None),
            )
        )).scalar_one()
    # Чаты доступны любому сотруднику (как /admin/chats)
    out["unread_chats"] = (await db.execute(_UNREAD_CHATS)).scalar_one()
    return out


@router.get("/search")
async def search(admin: CurrentAdmin, db: DbSession, q: str = Query(..., min_length=1, max_length=100)):
    q = q.strip().lstrip("#")
    like = f"%{escape_like(q)}%"
    out: dict[str, list] = {"orders": [], "users": [], "products": [], "games": []}

    if admin.has_permission("orders.view"):
        rows = (await db.execute(
            select(Order).options(selectinload(Order.user))
            .where(Order.deleted_at.is_(None), Order.order_number.ilike(like, escape="\\"))
            .order_by(Order.created_at.desc()).limit(6)
        )).scalars().all()
        out["orders"] = [{
            "id": o.id, "order_number": o.order_number, "status": o.status.value,
            "total": float(o.total_amount), "created_at": o.created_at,
            "user": o.user.display_name if o.user else None,
        } for o in rows]

    if admin.has_permission("users.view"):
        conds = [User.username.ilike(like, escape="\\"), User.first_name.ilike(like, escape="\\"),
                 User.email.ilike(like, escape="\\")]
        if q.lstrip("-").isdigit():
            conds.append(User.telegram_id == int(q))
        rows = (await db.execute(
            select(User).where(or_(*conds), User.is_guest.is_(False)).order_by(User.created_at.desc()).limit(6)
        )).scalars().all()
        out["users"] = [{
            "id": u.id, "telegram_id": u.telegram_id, "name": u.display_name, "email": u.email,
            "orders_count": u.orders_count,
        } for u in rows]

    if admin.has_permission("products.view"):
        rows = (await db.execute(
            select(Product, Game.name)
            .join(Category, Category.id == Product.category_id).join(Game, Game.id == Category.game_id)
            .where(Product.name.ilike(like, escape="\\")).order_by(Product.is_active.desc()).limit(6)
        )).all()
        out["products"] = [{
            "id": p.id, "name": p.name, "game": game, "price": float(p.price), "is_active": p.is_active,
        } for p, game in rows]

    if admin.has_permission("games.view"):
        rows = (await db.execute(
            select(Game).where(or_(Game.name.ilike(like, escape="\\"), Game.slug.ilike(like, escape="\\")))
            .order_by(Game.sort_order).limit(5)
        )).scalars().all()
        out["games"] = [{"id": g.id, "name": g.name, "slug": g.slug, "is_active": g.is_active} for g in rows]
    return out
