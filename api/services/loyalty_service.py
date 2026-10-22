"""
api/services/loyalty_service.py
─────────────────────────────────────────────────────────────────────────────
Программа лояльности (модель Bybit) и реферальные начисления.

Лояльность:
  • траты месяца = сумма total_amount заказов, оплаченных в календарном месяце
    по МСК и не отменённых/не возвращённых;
  • уровень = max(уровень по тратам прошлого месяца, уровень по тратам текущего):
    достигнутый уровень держится весь следующий месяц, потом может упасть;
  • выгода — только кэшбэк на баланс при выполнении заказа, не больше
    monthly_cashback_cap уровня за календарный месяц.

Рефералка:
  • пригласившему — referral_percent % с каждого выполненного заказа
    приглашённого в течение referral_period_months месяцев с его регистрации
    (0 — бессрочно); один раз за заказ (уникальный order_id в referral_rewards);
  • приглашённому — скидка referral_new_user_discount_percent % на первый заказ
    (применяется в DiscountService).
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_DOWN, Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import BalanceTransaction, LoyaltyLevel, Order, OrderStatus, User
from shared.models.user import ReferralReward, ShopSettings

logger = logging.getLogger(__name__)

# Москва без перехода на летнее время — фиксированный сдвиг надёжнее tzdata в slim-образе
MSK = timezone(timedelta(hours=3))

# Статусы, при которых заказ считается тратой (оплачен и не отменён)
SPENT_STATUSES = (
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.clarification,
    OrderStatus.completed,
)

REFERRAL_PERCENT_KEY = "referral_percent"
REFERRAL_MONTHS_KEY = "referral_period_months"
REFERRAL_DISCOUNT_KEY = "referral_new_user_discount_percent"
REFERRAL_DEFAULTS = {
    REFERRAL_PERCENT_KEY: Decimal("3"),
    REFERRAL_MONTHS_KEY: Decimal("12"),
    REFERRAL_DISCOUNT_KEY: Decimal("5"),
}

CENT = Decimal("0.01")


def month_bounds(now: datetime | None = None, shift: int = 0) -> tuple[datetime, datetime]:
    """Начало и конец календарного месяца по МСК (shift=-1 — прошлый месяц)."""
    now = (now or datetime.now(timezone.utc)).astimezone(MSK)
    year, month = now.year, now.month + shift
    while month < 1:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    start = datetime(year, month, 1, tzinfo=MSK)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=MSK)
    return start, end


@dataclass
class LoyaltyStatus:
    level: LoyaltyLevel | None
    levels: list[LoyaltyLevel]
    month_spent: Decimal              # траты текущего месяца
    prev_month_spent: Decimal         # траты прошлого месяца
    held_from_prev_month: bool        # уровень держится за счёт прошлого месяца
    next_level: LoyaltyLevel | None   # следующий уровень по тратам ЭТОГО месяца
    month_cashback: Decimal           # кэшбэк, начисленный в этом месяце
    month_end: datetime               # когда пересчитается уровень


class LoyaltyService:

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Уровни ────────────────────────────────────────────────────────────────

    async def get_levels(self) -> list[LoyaltyLevel]:
        result = await self.db.execute(
            select(LoyaltyLevel)
            .where(LoyaltyLevel.is_active == True)  # noqa: E712
            .order_by(LoyaltyLevel.min_spent.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    def level_for(amount: Decimal, levels: list[LoyaltyLevel]) -> LoyaltyLevel | None:
        """Наивысший уровень, порог которого не больше amount (levels по возрастанию)."""
        found = levels[0] if levels else None
        for lv in levels:
            if lv.min_spent <= amount:
                found = lv
        return found

    async def month_spent(self, user_id: uuid.UUID, shift: int = 0) -> Decimal:
        start, end = month_bounds(shift=shift)
        result = await self.db.execute(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                Order.user_id == user_id,
                Order.status.in_(SPENT_STATUSES),
                Order.paid_at >= start,
                Order.paid_at < end,
            )
        )
        return Decimal(result.scalar_one())

    async def month_cashback(self, user_id: uuid.UUID) -> Decimal:
        start, end = month_bounds()
        result = await self.db.execute(
            select(func.coalesce(func.sum(BalanceTransaction.amount), 0)).where(
                BalanceTransaction.user_id == user_id,
                BalanceTransaction.type == "cashback",
                BalanceTransaction.created_at >= start,
                BalanceTransaction.created_at < end,
            )
        )
        return Decimal(result.scalar_one())

    async def get_status(self, user: User) -> LoyaltyStatus:
        levels = await self.get_levels()
        spent_now = await self.month_spent(user.id)
        spent_prev = await self.month_spent(user.id, shift=-1)
        by_now = self.level_for(spent_now, levels)
        by_prev = self.level_for(spent_prev, levels)

        level = by_now
        held = False
        if by_prev and (by_now is None or by_prev.min_spent > by_now.min_spent):
            level, held = by_prev, True

        next_level = next((lv for lv in levels if lv.min_spent > spent_now), None)
        # Если уровень держится с прошлого месяца — «следующий» должен быть выше него
        if level and next_level and next_level.min_spent <= level.min_spent:
            next_level = next((lv for lv in levels if lv.min_spent > level.min_spent), None)

        # Кэш уровня в users — для админки и аналитики
        if level and user.loyalty_level_id != level.id:
            user.loyalty_level_id = level.id

        return LoyaltyStatus(
            level=level,
            levels=levels,
            month_spent=spent_now,
            prev_month_spent=spent_prev,
            held_from_prev_month=held,
            next_level=next_level,
            month_cashback=await self.month_cashback(user.id),
            month_end=month_bounds()[1],
        )

    # ── Кэшбэк ────────────────────────────────────────────────────────────────

    async def apply_cashback(self, order: Order) -> Decimal:
        """Начисляет кэшбэк за выполненный заказ с учётом месячного потолка.

        Идемпотентно: повторное выполнение (completed → processing → completed)
        не начислит второй раз.
        """
        already = await self.db.execute(
            select(BalanceTransaction.id).where(
                BalanceTransaction.type == "cashback",
                BalanceTransaction.reference_id == order.id,
            ).limit(1)
        )
        if already.scalar_one_or_none():
            return Decimal("0")

        user = (await self.db.execute(
            select(User).where(User.id == order.user_id).with_for_update()
        )).scalar_one()
        status = await self.get_status(user)
        level = status.level
        if not level or level.cashback_percent <= 0:
            return Decimal("0")

        amount = (order.total_amount * level.cashback_percent / 100).quantize(CENT, ROUND_DOWN)
        if level.monthly_cashback_cap is not None:
            amount = min(amount, max(level.monthly_cashback_cap - status.month_cashback, Decimal("0")))
        if amount <= 0:
            return Decimal("0")

        balance_before = user.balance
        user.balance += amount
        self.db.add(BalanceTransaction(
            user_id=user.id,
            amount=amount,
            balance_before=balance_before,
            balance_after=user.balance,
            type="cashback",
            description=f"Кэшбэк {level.cashback_percent:g}% ({level.name}) за заказ {order.order_number}",
            reference_id=order.id,
        ))
        return amount

    # ── Рефералка ─────────────────────────────────────────────────────────────

    async def get_referral_settings(self) -> dict[str, Decimal]:
        result = await self.db.execute(
            select(ShopSettings).where(ShopSettings.key.in_(REFERRAL_DEFAULTS.keys()))
        )
        values = dict(REFERRAL_DEFAULTS)
        for row in result.scalars().all():
            try:
                values[row.key] = Decimal(row.value)
            except Exception:
                logger.warning("Некорректное значение shop_settings %s=%r", row.key, row.value)
        return values

    async def reward_referrer_for_order(self, order: Order) -> tuple[User, Decimal, Decimal] | None:
        """Платит пригласившему процент с выполненного заказа друга.

        Возвращает (пригласивший, сумма, процент) при начислении, иначе None.
        Один раз за заказ — уникальный order_id в referral_rewards (повторное
        выполнение после реверса completed → processing второй раз не платит).
        """
        referred = (await self.db.execute(
            select(User).where(User.id == order.user_id)
        )).scalar_one_or_none()
        if not referred or not referred.referred_by_id or referred.referred_by_id == referred.id:
            return None

        cfg = await self.get_referral_settings()
        percent = cfg[REFERRAL_PERCENT_KEY]
        if percent <= 0:
            return None
        months = int(cfg[REFERRAL_MONTHS_KEY])
        if months > 0 and referred.created_at:
            if datetime.now(timezone.utc) > referred.created_at + timedelta(days=30 * months):
                return None

        amount = (Decimal(order.total_amount) * percent / 100).quantize(CENT, rounding=ROUND_DOWN)
        if amount <= 0:
            return None

        inserted = await self.db.execute(
            pg_insert(ReferralReward)
            .values(
                id=uuid.uuid4(),
                referrer_id=referred.referred_by_id,
                referred_id=referred.id,
                order_id=order.id,
                reward_amount=amount,
                is_paid=True,
                paid_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(
                index_elements=["order_id"], index_where=ReferralReward.order_id.isnot(None),
            )
            .returning(ReferralReward.id)
        )
        if inserted.scalar_one_or_none() is None:
            return None  # за этот заказ уже начислено

        referrer = (await self.db.execute(
            select(User).where(User.id == referred.referred_by_id).with_for_update()
        )).scalar_one()
        balance_before = referrer.balance
        referrer.balance += amount
        self.db.add(BalanceTransaction(
            user_id=referrer.id,
            amount=amount,
            balance_before=balance_before,
            balance_after=referrer.balance,
            type="referral_bonus",
            description=f"{percent:g}% с заказа друга {order.order_number} ({referred.display_name})",
            reference_id=order.id,
        ))
        return referrer, amount, percent

    async def referral_first_order_discount(self, user: User) -> Decimal:
        """% скидки на первый заказ для приглашённого (0 — не положена)."""
        if not user.referred_by_id or user.orders_count > 0:
            return Decimal("0")
        cfg = await self.get_referral_settings()
        return max(cfg[REFERRAL_DISCOUNT_KEY], Decimal("0"))
