"""api/routers/profile.py"""
from decimal import Decimal

from fastapi import APIRouter, Query
from sqlalchemy import select, func

from api.deps import CurrentUser, DbSession
from api.schemas.cart import ProfileOut
from api.services.loyalty_service import (
    REFERRAL_BONUS_KEY, REFERRAL_DISCOUNT_KEY, REFERRAL_THRESHOLD_KEY, LoyaltyService,
)
from shared.models import Order, OrderStatus, ReferralReward, User
from shared.utils import build_telegram_photo_url

router = APIRouter()


@router.get("", response_model=ProfileOut)
async def get_profile(db: DbSession, user: CurrentUser):
    result = await db.execute(select(User).where(User.id == user.id))
    user_full = result.scalar_one()

    loyalty_svc = LoyaltyService(db)
    st = await loyalty_svc.get_status(user_full)
    loyalty = st.level
    ref_cfg = await loyalty_svc.get_referral_settings()

    ref_result = await db.execute(
        select(func.count()).select_from(User).where(User.referred_by_id == user_full.id)
    )
    referrals_count = ref_result.scalar_one() or 0

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
        loyalty_level_name=loyalty.name if loyalty else "",
        loyalty_level_emoji="",
        loyalty_discount_percent=0,
        loyalty_cashback_percent=loyalty.cashback_percent if loyalty else 0,
        loyalty_color_hex=loyalty.color_hex if loyalty else "#8A94A6",
        loyalty_level_index=st.levels.index(loyalty) if loyalty in st.levels else 0,
        loyalty_cashback_cap=loyalty.monthly_cashback_cap if loyalty else None,
        loyalty_month_cashback=st.month_cashback,
        loyalty_month_spent=st.month_spent,
        loyalty_prev_month_spent=st.prev_month_spent,
        loyalty_held_from_prev_month=st.held_from_prev_month,
        loyalty_next_level_name=st.next_level.name if st.next_level else None,
        loyalty_next_level_min_spent=st.next_level.min_spent if st.next_level else None,
        loyalty_period_ends_at=st.month_end.isoformat(),
        loyalty_levels=[
            {
                "name": lv.name,
                "min_spent": float(lv.min_spent),
                "min_orders": 0,
                "discount_percent": 0.0,
                "cashback_percent": float(lv.cashback_percent),
                "monthly_cashback_cap": (
                    float(lv.monthly_cashback_cap) if lv.monthly_cashback_cap is not None else None
                ),
                "color_hex": lv.color_hex,
                "icon_emoji": "",
                "priority": lv.priority,
            }
            for lv in st.levels
        ],
        referral_bonus_amount=ref_cfg[REFERRAL_BONUS_KEY],
        referral_threshold_amount=ref_cfg[REFERRAL_THRESHOLD_KEY],
        referral_new_user_discount_percent=ref_cfg[REFERRAL_DISCOUNT_KEY],
    )


@router.get("/referrals")
async def get_referral_stats(db: DbSession, user: CurrentUser):
    """Статистика реферальной программы: прогресс каждого друга к порогу."""
    cfg = await LoyaltyService(db).get_referral_settings()
    threshold = cfg[REFERRAL_THRESHOLD_KEY]

    completed_sum = (
        select(func.coalesce(func.sum(Order.total_amount), 0))
        .where(Order.user_id == User.id, Order.status == OrderStatus.completed)
        .correlate(User)
        .scalar_subquery()
    )
    rows = (await db.execute(
        select(User, completed_sum, ReferralReward.reward_amount)
        .outerjoin(ReferralReward, ReferralReward.referred_id == User.id)
        .where(User.referred_by_id == user.id)
        .order_by(User.created_at.desc())
    )).all()

    earned = sum((r[2] or Decimal("0")) for r in rows)
    return {
        "referrals_count": len(rows),
        "bonus_amount": float(cfg[REFERRAL_BONUS_KEY]),
        "threshold_amount": float(threshold),
        "new_user_discount_percent": float(cfg[REFERRAL_DISCOUNT_KEY]),
        "earned_total": float(earned),
        "referrals": [
            {
                "telegram_id": r.telegram_id,
                "first_name": r.first_name,
                "username": r.username,
                "orders_count": r.orders_count,
                "joined_at": r.created_at.isoformat(),
                "spent": float(min(Decimal(spent), threshold)),
                "rewarded": reward is not None,
            }
            for r, spent, reward in rows
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
