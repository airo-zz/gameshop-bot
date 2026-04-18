"""api/routers/profile.py"""
from fastapi import APIRouter, Query
from sqlalchemy.orm import selectinload
from sqlalchemy import select, func

from api.deps import CurrentUser, DbSession
from api.schemas.cart import ProfileOut
from shared.models import User
from shared.utils import build_telegram_photo_url

router = APIRouter()


@router.get("", response_model=ProfileOut)
async def get_profile(db: DbSession, user: CurrentUser):
    from shared.models import LoyaltyLevel

    result = await db.execute(
        select(User)
        .options(selectinload(User.loyalty_level))
        .where(User.id == user.id)
    )
    user_full = result.scalar_one()

    # Пересчитываем уровень лояльности на лету — гарантирует актуальность
    # даже если loyalty_level_id в БД устарел.
    level_result = await db.execute(
        select(LoyaltyLevel)
        .where(
            LoyaltyLevel.is_active == True,
            LoyaltyLevel.min_spent <= user_full.total_spent,
            LoyaltyLevel.min_orders <= user_full.orders_count,
        )
        .order_by(LoyaltyLevel.min_spent.desc())
        .limit(1)
    )
    loyalty = level_result.scalar_one_or_none() or user_full.loyalty_level

    # Обновляем поле в БД если расхождение (lazy fix)
    if loyalty and user_full.loyalty_level_id != loyalty.id:
        user_full.loyalty_level_id = loyalty.id

    # Считаем количество рефералов
    ref_result = await db.execute(
        select(func.count()).select_from(User).where(User.referred_by_id == user_full.id)
    )
    referrals_count = ref_result.scalar_one() or 0

    # Все активные уровни лояльности для фронтенда (пороги, цвета)
    levels_result = await db.execute(
        select(LoyaltyLevel)
        .where(LoyaltyLevel.is_active == True)
        .order_by(LoyaltyLevel.priority)
    )
    all_levels = levels_result.scalars().all()

    return ProfileOut(
        telegram_id=user_full.telegram_id,
        username=user_full.username,
        first_name=user_full.first_name,
        photo_url=build_telegram_photo_url(user_full.photo_url),
        balance=user_full.balance,
        orders_count=user_full.orders_count,
        total_spent=user_full.total_spent,
        referral_code=user_full.referral_code,
        referrals_count=referrals_count,
        loyalty_level_name=loyalty.name if loyalty else "Bronze",
        loyalty_level_emoji=loyalty.icon_emoji if loyalty else "🥉",
        loyalty_discount_percent=loyalty.discount_percent if loyalty else 0,
        loyalty_cashback_percent=loyalty.cashback_percent if loyalty else 0,
        loyalty_color_hex=loyalty.color_hex if loyalty else "#CD7F32",
        loyalty_levels=[
            {
                "name": lv.name,
                "min_spent": float(lv.min_spent),
                "min_orders": lv.min_orders,
                "discount_percent": float(lv.discount_percent),
                "cashback_percent": float(lv.cashback_percent),
                "color_hex": lv.color_hex,
                "icon_emoji": lv.icon_emoji,
                "priority": lv.priority,
            }
            for lv in all_levels
        ],
    )


@router.get("/referrals")
async def get_referral_stats(db: DbSession, user: CurrentUser):
    """Статистика реферальной программы пользователя."""
    result = await db.execute(
        select(User).where(User.referred_by_id == user.id)
    )
    referrals = result.scalars().all()

    return {
        "referrals_count": len(referrals),
        "referrals": [
            {
                "telegram_id": r.telegram_id,
                "first_name": r.first_name,
                "username": r.username,
                "orders_count": r.orders_count,
                "joined_at": r.created_at.isoformat(),
            }
            for r in referrals
        ],
    }


@router.get("/balance-history")
async def get_balance_history(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
):
    from shared.models import BalanceTransaction
    from sqlalchemy import select
    result = await db.execute(
        select(BalanceTransaction)
        .where(BalanceTransaction.user_id == user.id)
        .order_by(BalanceTransaction.created_at.desc())
        .limit(limit)
    )
    transactions = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "amount": float(t.amount),
            "balance_before": float(t.balance_before),
            "balance_after": float(t.balance_after),
            "type": t.type,
            "description": t.description,
            "reference_id": str(t.reference_id) if t.reference_id else None,
            "created_at": t.created_at.isoformat(),
        }
        for t in transactions
    ]
