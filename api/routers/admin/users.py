"""
api/routers/admin/users.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинты управления пользователями в admin-панели.
─────────────────────────────────────────────────────────────────────────────
"""

import math
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.schemas.admin import BalanceAdjustIn, PaginatedResponse, UserUpdateIn
from api.utils.admin_log import log_admin_action
from shared.models import BalanceTransaction, LoyaltyLevel, Order, User

router = APIRouter()


# ── GET / — список пользователей ─────────────────────────────────────────────


@router.get(
    "/",
    dependencies=[require_permission("users.view")],
    summary="Список пользователей",
)
async def list_users(
    db: DbSession,
    search: str | None = Query(None, description="Поиск по username, first_name или telegram_id"),
    is_blocked: bool | None = Query(None, description="Фильтр по статусу блокировки"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[dict[str, Any]]:
    base_q = (
        select(User)
        .options(joinedload(User.loyalty_level))
        .order_by(User.created_at.desc())
    )

    if search:
        # telegram_id — только если search состоит целиком из цифр
        if search.isdigit():
            base_q = base_q.where(
                or_(
                    User.telegram_id == int(search),
                    User.username.ilike(f"%{search}%"),
                    User.first_name.ilike(f"%{search}%"),
                )
            )
        else:
            base_q = base_q.where(
                or_(
                    User.username.ilike(f"%{search}%"),
                    User.first_name.ilike(f"%{search}%"),
                )
            )

    if is_blocked is not None:
        base_q = base_q.where(User.is_blocked == is_blocked)

    # COUNT без ORDER BY и limit/offset
    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await db.execute(count_q)).scalar_one()

    offset = (page - 1) * page_size
    rows = (await db.execute(base_q.offset(offset).limit(page_size))).scalars().all()

    items = [_user_list_item(u) for u in rows]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _user_list_item(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "balance": float(user.balance),
        "total_spent": float(user.total_spent),
        "orders_count": user.orders_count,
        "is_blocked": user.is_blocked,
        "blocked_reason": user.blocked_reason,
        "loyalty_level": (
            {"id": user.loyalty_level.id, "name": user.loyalty_level.name}
            if user.loyalty_level
            else None
        ),
        "created_at": user.created_at,
        "last_active_at": user.last_active_at,
    }


# ── GET /{user_id} — детальная карточка пользователя ─────────────────────────


@router.get(
    "/{user_id}",
    dependencies=[require_permission("users.view")],
    summary="Детальная карточка пользователя",
)
async def get_user(
    user_id: uuid.UUID,
    db: DbSession,
) -> dict[str, Any]:
    result = await db.execute(
        select(User)
        .options(joinedload(User.loyalty_level))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    # Последние 10 заказов
    orders_result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
        .limit(10)
    )
    orders = orders_result.scalars().all()

    # Последние 20 транзакций баланса
    txn_result = await db.execute(
        select(BalanceTransaction)
        .where(BalanceTransaction.user_id == user_id)
        .order_by(BalanceTransaction.created_at.desc())
        .limit(20)
    )
    transactions = txn_result.scalars().all()

    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "language_code": user.language_code,
        "phone": user.phone,
        "photo_url": user.photo_url,
        "referral_code": user.referral_code,
        "referred_by_id": user.referred_by_id,
        "balance": float(user.balance),
        "total_spent": float(user.total_spent),
        "orders_count": user.orders_count,
        "is_blocked": user.is_blocked,
        "blocked_reason": user.blocked_reason,
        "blocked_at": user.blocked_at,
        "loyalty_level": (
            {
                "id": user.loyalty_level.id,
                "name": user.loyalty_level.name,
                "discount_percent": float(user.loyalty_level.discount_percent),
                "cashback_percent": float(user.loyalty_level.cashback_percent),
                "color_hex": user.loyalty_level.color_hex,
                "icon_emoji": user.loyalty_level.icon_emoji,
            }
            if user.loyalty_level
            else None
        ),
        "created_at": user.created_at,
        "last_active_at": user.last_active_at,
        "orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "status": o.status,
                "total_amount": float(o.total_amount),
                "payment_method": o.payment_method,
                "created_at": o.created_at,
            }
            for o in orders
        ],
        "balance_transactions": [
            {
                "id": t.id,
                "amount": float(t.amount),
                "balance_before": float(t.balance_before),
                "balance_after": float(t.balance_after),
                "type": t.type,
                "description": t.description,
                "created_at": t.created_at,
            }
            for t in transactions
        ],
    }


# ── PATCH /{user_id} — обновление пользователя ───────────────────────────────


@router.patch(
    "/{user_id}",
    dependencies=[require_permission("users.edit")],
    summary="Блокировка / смена уровня лояльности",
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict[str, Any]:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    before_data: dict[str, Any] = {
        "is_blocked": user.is_blocked,
        "blocked_reason": user.blocked_reason,
        "loyalty_level_id": str(user.loyalty_level_id) if user.loyalty_level_id else None,
    }

    if body.is_blocked is not None:
        user.is_blocked = body.is_blocked
        user.blocked_reason = body.blocked_reason if body.is_blocked else None
        user.blocked_at = (
            datetime.now(timezone.utc) if body.is_blocked else None
        )

    if body.loyalty_level_id is not None:
        try:
            loyalty_uuid = uuid.UUID(body.loyalty_level_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="loyalty_level_id должен быть валидным UUID",
            )
        level_result = await db.execute(
            select(LoyaltyLevel).where(LoyaltyLevel.id == loyalty_uuid)
        )
        if not level_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Уровень лояльности не найден",
            )
        user.loyalty_level_id = loyalty_uuid

    after_data: dict[str, Any] = {
        "is_blocked": user.is_blocked,
        "blocked_reason": user.blocked_reason,
        "loyalty_level_id": str(user.loyalty_level_id) if user.loyalty_level_id else None,
    }

    await log_admin_action(
        db=db,
        admin=admin,
        action="user.update",
        entity_type="user",
        entity_id=user_id,
        before_data=before_data,
        after_data=after_data,
    )

    await db.flush()

    return {
        "id": user.id,
        "is_blocked": user.is_blocked,
        "blocked_reason": user.blocked_reason,
        "blocked_at": user.blocked_at,
        "loyalty_level_id": user.loyalty_level_id,
    }


# ── POST /{user_id}/balance — корректировка баланса ──────────────────────────

_ALLOWED_MANUAL_TYPES = {"manual_credit", "manual_debit"}


@router.post(
    "/{user_id}/balance",
    dependencies=[require_permission("users.edit_balance")],
    status_code=status.HTTP_201_CREATED,
    summary="Корректировка баланса пользователя",
)
async def adjust_balance(
    user_id: uuid.UUID,
    body: BalanceAdjustIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict[str, Any]:
    if body.type not in _ALLOWED_MANUAL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Допустимые типы: {', '.join(sorted(_ALLOWED_MANUAL_TYPES))}",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    amount = Decimal(str(body.amount))
    balance_before = user.balance

    if body.type == "manual_debit":
        if user.balance < amount:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Недостаточно средств: баланс {float(user.balance):.2f}, "
                    f"запрошено {float(amount):.2f}"
                ),
            )
        user.balance -= amount
        tx_amount = -amount
    else:
        user.balance += amount
        tx_amount = amount

    balance_after = user.balance

    txn = BalanceTransaction(
        user_id=user_id,
        amount=tx_amount,
        balance_before=balance_before,
        balance_after=balance_after,
        type=body.type,
        description=body.description,
    )
    db.add(txn)

    await log_admin_action(
        db=db,
        admin=admin,
        action="user.balance_adjust",
        entity_type="user",
        entity_id=user_id,
        before_data={"balance": float(balance_before)},
        after_data={
            "balance": float(balance_after),
            "type": body.type,
            "amount": float(amount),
            "description": body.description,
        },
    )

    await db.flush()

    return {
        "user_id": user_id,
        "balance_before": float(balance_before),
        "balance_after": float(balance_after),
        "amount": float(tx_amount),
        "type": body.type,
        "description": body.description,
    }
