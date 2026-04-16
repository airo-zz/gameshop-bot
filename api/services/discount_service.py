"""
api/services/discount_service.py
─────────────────────────────────────────────────────────────────────────────
Движок применения скидок.

Алгоритм:
  1. Собрать все активные правила применимые к заказу/корзине
  2. Отсортировать по priority DESC
  3. Применить первое non-stackable правило с наивысшим приоритетом
  4. Дополнительно применить все stackable правила
  5. Вернуть итоговую сумму скидки + список применённых правил
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.models import (
    Cart, DiscountRule, DiscountType, LoyaltyLevel,
    PromoCode, PromoCodeUsage, User,
)


@dataclass
class AppliedDiscount:
    rule: DiscountRule | None  # None для прямых скидок по уровню лояльности
    amount: Decimal
    reason: str


@dataclass
class DiscountResult:
    total_discount: Decimal
    applied: list[AppliedDiscount]
    promo_code: PromoCode | None = None


class DiscountService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_cart_discounts(
        self,
        user: User,
        cart: Cart,
        promo_code_str: str | None = None,
    ) -> DiscountResult:
        """
        Рассчитывает все скидки для корзины.
        Возвращает итоговую скидку и список применённых правил.
        """
        subtotal = cart.total
        if subtotal <= 0:
            return DiscountResult(total_discount=Decimal("0"), applied=[])

        applicable_rules: list[DiscountRule] = []
        promo_code: PromoCode | None = None

        # ── 1. Скидки по уровню лояльности ───────────────────────────────────
        if user.loyalty_level_id:
            loyalty_rules = await self._get_loyalty_rules(user.loyalty_level_id)
            applicable_rules.extend(loyalty_rules)

        # ── 2. Временные акции (time_based) ──────────────────────────────────
        time_rules = await self._get_time_based_rules(subtotal)
        applicable_rules.extend(time_rules)

        # ── 3. Промокод ───────────────────────────────────────────────────────
        if promo_code_str:
            promo_result = await self._validate_promo(promo_code_str, user.id, subtotal)
            if promo_result:
                promo_code, promo_rule = promo_result
                applicable_rules.append(promo_rule)

        # ── Применяем правила ─────────────────────────────────────────────────
        applied = self._apply_rules(applicable_rules, subtotal)

        # ── 4. Прямая скидка уровня лояльности ───────────────────────────────
        # Применяется независимо от DiscountRule-записей: берём discount_percent
        # прямо из LoyaltyLevel и добавляем отдельной записью (stackable).
        if user.loyalty_level_id:
            level = await self._get_loyalty_level(user.loyalty_level_id)
            if level and level.is_active and level.discount_percent > 0:
                loyalty_amount = subtotal * level.discount_percent / Decimal("100")
                if loyalty_amount > 0:
                    applied.append(AppliedDiscount(
                        rule=None,
                        amount=loyalty_amount,
                        reason=f"{level.name}: скидка {level.discount_percent}%",
                    ))

        total = sum(a.amount for a in applied)
        # Скидка не может превышать сумму заказа
        total = min(total, subtotal)

        return DiscountResult(
            total_discount=total,
            applied=applied,
            promo_code=promo_code,
        )

    def _apply_rules(
        self,
        rules: list[DiscountRule],
        subtotal: Decimal,
    ) -> list[AppliedDiscount]:
        """
        Применяет правила по приоритету.
        Не-суммируемые (stackable=False): только одно (с наивысшим приоритетом).
        Суммируемые (stackable=True): все.
        """
        if not rules:
            return []

        # Сортируем по приоритету
        rules_sorted = sorted(rules, key=lambda r: r.priority, reverse=True)

        applied: list[AppliedDiscount] = []
        non_stackable_used = False

        for rule in rules_sorted:
            if rule.is_expired or rule.is_limit_reached:
                continue
            if subtotal < rule.min_order_amount:
                continue

            if not rule.stackable:
                if non_stackable_used:
                    continue  # Уже применили одно non-stackable
                non_stackable_used = True

            amount = rule.calculate_discount(subtotal)
            if amount <= 0:
                continue

            applied.append(AppliedDiscount(
                rule=rule,
                amount=amount,
                reason=self._describe_rule(rule),
            ))

        return applied

    def _describe_rule(self, rule: DiscountRule) -> str:
        from shared.models.discount import DiscountValueType
        if rule.discount_value_type == DiscountValueType.percent:
            return f"{rule.name}: скидка {rule.discount_value}%"
        return f"{rule.name}: скидка {rule.discount_value} ₽"

    async def _get_loyalty_rules(self, loyalty_level_id: uuid.UUID) -> list[DiscountRule]:
        result = await self.db.execute(
            select(DiscountRule).where(
                DiscountRule.type == DiscountType.loyalty,
                DiscountRule.target_id == loyalty_level_id,
                DiscountRule.is_active == True,
            )
        )
        return result.scalars().all()

    async def _get_loyalty_level(self, loyalty_level_id: uuid.UUID) -> LoyaltyLevel | None:
        result = await self.db.execute(
            select(LoyaltyLevel).where(LoyaltyLevel.id == loyalty_level_id)
        )
        return result.scalar_one_or_none()

    async def _get_time_based_rules(self, subtotal: Decimal) -> list[DiscountRule]:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(DiscountRule).where(
                DiscountRule.type == DiscountType.time_based,
                DiscountRule.is_active == True,
                DiscountRule.starts_at <= now,
                DiscountRule.ends_at >= now,
            )
        )
        return result.scalars().all()

    async def _validate_promo(
        self,
        code: str,
        user_id: uuid.UUID,
        subtotal: Decimal,
    ) -> tuple[PromoCode, DiscountRule] | None:
        """Валидирует промокод. Возвращает (PromoCode, DiscountRule) или None."""
        result = await self.db.execute(
            select(PromoCode)
            .options(selectinload(PromoCode.discount_rule))
            .where(
                PromoCode.code == code.upper(),
                PromoCode.is_active == True,
            )
        )
        promo = result.scalar_one_or_none()

        if not promo or not promo.is_available:
            return None

        # Проверяем per_user_limit
        usage_result = await self.db.execute(
            select(PromoCodeUsage).where(
                PromoCodeUsage.promo_code_id == promo.id,
                PromoCodeUsage.user_id == user_id,
            )
        )
        user_usages = len(usage_result.scalars().all())
        if user_usages >= promo.per_user_limit:
            return None

        rule = promo.discount_rule
        if not rule or not rule.is_active or rule.is_expired:
            return None

        if subtotal < rule.min_order_amount:
            return None

        return promo, rule

    async def validate_promo_code(
        self,
        code: str,
        user_id: uuid.UUID,
        subtotal: Decimal,
    ) -> dict:
        """
        Публичный метод для API — проверить промокод перед применением.
        Возвращает {"valid": bool, "discount": Decimal, "message": str}
        """
        result = await self._validate_promo(code, user_id, subtotal)
        if not result:
            return {"valid": False, "discount": Decimal("0"), "message": "Промокод недействителен"}

        promo, rule = result
        discount = rule.calculate_discount(subtotal)
        return {
            "valid": True,
            "discount": discount,
            "message": f"Промокод применён! Скидка: {discount:.0f} ₽",
            "promo_id": str(promo.id),
        }

    async def record_promo_usage(
        self,
        promo_id: uuid.UUID,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
    ) -> None:
        """Фиксирует использование промокода после создания заказа.

        Использует атомарный UPDATE вместо ORM read-modify-write,
        чтобы два конкурентных заказа не обнулили счётчик друг друга.
        """
        # Атомарный инкремент used_count — безопасен под конкурентной нагрузкой
        await self.db.execute(
            update(PromoCode)
            .where(PromoCode.id == promo_id)
            .values(used_count=PromoCode.used_count + 1)
        )

        # Атомарный инкремент usage_count для связанного DiscountRule (если есть)
        promo_result = await self.db.execute(
            select(PromoCode)
            .options(selectinload(PromoCode.discount_rule))
            .where(PromoCode.id == promo_id)
        )
        promo = promo_result.scalar_one_or_none()
        if promo and promo.discount_rule:
            await self.db.execute(
                update(DiscountRule)
                .where(DiscountRule.id == promo.discount_rule.id)
                .values(usage_count=DiscountRule.usage_count + 1)
            )

        # Лог
        self.db.add(PromoCodeUsage(
            promo_code_id=promo_id,
            user_id=user_id,
            order_id=order_id,
        ))
