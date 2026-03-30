"""api/routers/profile.py"""
from fastapi import APIRouter
from sqlalchemy.orm import selectinload
from sqlalchemy import select

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

    return ProfileOut(
        telegram_id=user_full.telegram_id,
        username=user_full.username,
        first_name=user_full.first_name,
        balance=user_full.balance,
        orders_count=user_full.orders_count,
        total_spent=user_full.total_spent,
        referral_code=user_full.referral_code,
        loyalty_level_name=loyalty.name if loyalty else "Bronze",
        loyalty_level_emoji=loyalty.icon_emoji if loyalty else "🥉",
        loyalty_discount_percent=loyalty.discount_percent if loyalty else 0,
        loyalty_cashback_percent=loyalty.cashback_percent if loyalty else 0,
    )
