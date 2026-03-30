"""
tests/test_discount_service.py — тесты движка скидок
tests/test_order_service.py    — тесты заказов
"""

# ════════════════════════════════════════════════════════════════════════════
# ТЕСТЫ СКИДОК
# ════════════════════════════════════════════════════════════════════════════

import pytest
import pytest_asyncio
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_promo_code_applies(db: AsyncSession, test_user, test_product):
    """Промокод применяется и считает скидку правильно."""
    from shared.models import DiscountRule, DiscountType, DiscountValueType, PromoCode
    from api.services.discount_service import DiscountService

    # Создаём правило 10%
    rule = DiscountRule(
        name="Test 10%",
        type=DiscountType.promo,
        discount_value_type=DiscountValueType.percent,
        discount_value=Decimal("10"),
        min_order_amount=Decimal("0"),
        is_active=True,
        priority=50,
        stackable=False,
    )
    db.add(rule)
    await db.flush()

    promo = PromoCode(
        code="TEST10",
        discount_rule_id=rule.id,
        max_uses=100,
        per_user_limit=1,
        is_active=True,
    )
    db.add(promo)
    await db.flush()

    svc = DiscountService(db)
    result = await svc.validate_promo_code("TEST10", test_user.id, Decimal("200"))

    assert result["valid"] is True
    assert result["discount"] == Decimal("20")  # 10% от 200


@pytest.mark.asyncio
async def test_promo_invalid_code(db: AsyncSession, test_user):
    """Несуществующий промокод возвращает invalid."""
    from api.services.discount_service import DiscountService

    svc = DiscountService(db)
    result = await svc.validate_promo_code("INVALID", test_user.id, Decimal("100"))
    assert result["valid"] is False


@pytest.mark.asyncio
async def test_discount_cannot_exceed_total(db: AsyncSession, test_user):
    """Скидка не может превышать сумму заказа."""
    from shared.models import DiscountRule, DiscountType, DiscountValueType, PromoCode
    from api.services.discount_service import DiscountService

    rule = DiscountRule(
        name="Big discount",
        type=DiscountType.promo,
        discount_value_type=DiscountValueType.fixed,
        discount_value=Decimal("500"),  # Больше суммы заказа
        min_order_amount=Decimal("0"),
        is_active=True,
        priority=50,
    )
    db.add(rule)
    await db.flush()

    promo = PromoCode(
        code="BIG500",
        discount_rule_id=rule.id,
        is_active=True,
    )
    db.add(promo)
    await db.flush()

    svc = DiscountService(db)
    result = await svc.validate_promo_code("BIG500", test_user.id, Decimal("100"))

    assert result["valid"] is True
    # Скидка ограничена суммой заказа
    assert result["discount"] <= Decimal("100")


# ════════════════════════════════════════════════════════════════════════════
# ТЕСТЫ ЗАКАЗОВ
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_order_status_transitions(db: AsyncSession, test_user, test_product):
    """Корректные и некорректные переходы статусов."""
    from shared.models import Order, OrderStatus, PaymentMethod
    from api.services.order_service import OrderService

    order = Order(
        order_number="#TEST01",
        user_id=test_user.id,
        status=OrderStatus.new,
        subtotal=Decimal("99"),
        total_amount=Decimal("99"),
        payment_method=PaymentMethod.balance,
    )
    db.add(order)
    await db.flush()

    svc = OrderService(db)

    # Допустимый переход: new → pending_payment
    await svc.change_status(order, OrderStatus.pending_payment)
    assert order.status == OrderStatus.pending_payment

    # Недопустимый переход: pending_payment → completed (минуя paid)
    with pytest.raises(ValueError):
        await svc.change_status(order, OrderStatus.completed)


@pytest.mark.asyncio
async def test_balance_payment_deducts_correctly(db: AsyncSession, test_user, test_product):
    """Оплата балансом корректно списывает сумму."""
    from shared.models import Order, OrderStatus, PaymentMethod
    from api.services.order_service import OrderService
    from decimal import Decimal

    initial_balance = test_user.balance  # 500 ₽

    order = Order(
        order_number="#TEST02",
        user_id=test_user.id,
        status=OrderStatus.new,
        subtotal=Decimal("99"),
        total_amount=Decimal("99"),
        payment_method=PaymentMethod.balance,
    )
    db.add(order)
    await db.flush()

    svc = OrderService(db)
    await svc.change_status(order, OrderStatus.pending_payment)
    await svc.pay_with_balance(order, test_user)

    assert test_user.balance == initial_balance - Decimal("99")
    assert order.status == OrderStatus.paid


@pytest.mark.asyncio
async def test_balance_payment_fails_if_insufficient(db: AsyncSession, test_user, test_product):
    """Оплата балансом отклоняется при нехватке средств."""
    from shared.models import Order, OrderStatus, PaymentMethod
    from api.services.order_service import OrderService

    test_user.balance = Decimal("10")  # Меньше стоимости

    order = Order(
        order_number="#TEST03",
        user_id=test_user.id,
        status=OrderStatus.pending_payment,
        subtotal=Decimal("99"),
        total_amount=Decimal("99"),
        payment_method=PaymentMethod.balance,
    )
    db.add(order)
    await db.flush()

    svc = OrderService(db)
    with pytest.raises(ValueError, match="Недостаточно средств"):
        await svc.pay_with_balance(order, test_user)


# ════════════════════════════════════════════════════════════════════════════
# ТЕСТЫ НАСТРОЕК (SHOP_NAME)
# ════════════════════════════════════════════════════════════════════════════

def test_shop_name_from_env():
    """SHOP_NAME читается из окружения."""
    from shared.config import settings
    assert settings.SHOP_NAME == "TestShop"


def test_shop_name_emoji_property():
    """shop_name_emoji формируется правильно."""
    from shared.config import settings
    assert settings.shop_name_emoji == f"🎮 {settings.SHOP_NAME}"


def test_bot_texts_use_shop_name():
    """Тексты бота содержат название магазина."""
    from bot.utils.texts import texts
    greeting = texts.greeting("Иван")
    assert "TestShop" in greeting
