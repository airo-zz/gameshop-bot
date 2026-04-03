"""api/routers/profile.py"""
from fastapi import APIRouter
from sqlalchemy.orm import selectinload
from sqlalchemy import select, func

from api.deps import CurrentUser, DbSession
from api.schemas.cart import ProfileOut
from shared.models import User

router = APIRouter()


@router.get("", response_model=ProfileOut)
async def get_profile(db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(User)
        .options(selectinload(User.loyalty_level))
        .where(User.id == user.id)
    )
    user_full = result.scalar_one()
    loyalty = user_full.loyalty_level

    # Считаем количество рефералов
    ref_result = await db.execute(
        select(func.count()).where(User.referred_by_id == user_full.id)
    )
    referrals_count = ref_result.scalar_one() or 0

    return ProfileOut(
        telegram_id=user_full.telegram_id,
        username=user_full.username,
        first_name=user_full.first_name,
        photo_url=user_full.photo_url,
        balance=user_full.balance,
        orders_count=user_full.orders_count,
        total_spent=user_full.total_spent,
        referral_code=user_full.referral_code,
        referrals_count=referrals_count,
        loyalty_level_name=loyalty.name if loyalty else "Bronze",
        loyalty_level_emoji=loyalty.icon_emoji if loyalty else "🥉",
        loyalty_discount_percent=loyalty.discount_percent if loyalty else 0,
        loyalty_cashback_percent=loyalty.cashback_percent if loyalty else 0,
    )


@router.get("/referral-stats")
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
