"""
tests/test_money.py
─────────────────────────────────────────────────────────────────────────────
Тесты денежной логики — то, где ошибка стоит денег:
  • цены: USD → ₽, округление «в 9», наценка способа оплаты;
  • доплата: холд баланса, возврат холда, без двойного списания;
  • вебхук Platega: подтверждение заказа, повтор вебхука, отмена с возвратом холда;
  • пополнение баланса: зачисляется один раз, даже если вебхук пришёл дважды;
  • кэшбэк: процент уровня, месячный потолок, без повторного начисления;
  • инвариант: users.balance == сумма balance_transactions.
Описание логики — docs/ORDERS_AND_PAYMENTS.md.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select

from api.services.pricing import method_total, round_to_nine, rub_to_usd, usd_to_rub


# ── Цены (чистые функции) ─────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, expected", [
    (145, 149), (143, 139), (9, 9), (0, 9), (999, 999),
    (1234, 1190), (1260, 1290), (1000, 990),
])
def test_round_to_nine(raw, expected):
    assert round_to_nine(raw) == expected


def test_usd_to_rub_with_markup_and_rounding():
    # 1 $ × 90 ₽ × 1.10 = 99 → уже «в 9»
    assert usd_to_rub(1, 90, 10) == 99
    # товар «за единицу» (звёзды, рубли Steam) — без округления, до копеек
    assert usd_to_rub(0.0123, 90, 0, round_nine=False) == 1.11


def test_method_total_replaces_display_markup():
    # каталог показывает цену без наценки (balance = 0), СБП +10%
    assert method_total(100, 0, 10) == 110.0
    # если в цену показа заложено 10%, а у метода 0% — снимаем наценку
    assert method_total(110, 10, 0) == 100.0


def test_rub_to_usd():
    assert rub_to_usd(900, 90) == 10.0
    assert rub_to_usd(100, 0) == 0.0


# ── Фабрики ───────────────────────────────────────────────────────────────────

async def _user(db, balance: str):
    from shared.models import User
    u = User(telegram_id=int(uuid.uuid4().int % 10**9) + 10**9, first_name="T", balance=Decimal(balance))
    db.add(u)
    await db.flush()
    return u


async def _order(db, user, product, amount: str, status=None):
    from shared.models import Order, OrderItem, OrderStatus, PaymentMethod
    o = Order(
        order_number=f"#T{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        status=status or OrderStatus.pending_payment,
        subtotal=Decimal(amount),
        total_amount=Decimal(amount),
        payment_method=PaymentMethod.sbp,
    )
    db.add(o)
    await db.flush()
    # ручная позиция — иначе после оплаты заказ сразу завершит автовыдача
    db.add(OrderItem(
        order_id=o.id, product_id=product.id, product_name=product.name,
        quantity=1, unit_price=Decimal(amount), total_price=Decimal(amount),
    ))
    await db.flush()
    return o


async def _payment(db, order, user, external_id: str):
    from shared.models import Payment, PaymentMethod, PaymentStatus
    p = Payment(
        order_id=order.id, user_id=user.id, method=PaymentMethod.sbp,
        status=PaymentStatus.pending, amount=order.subtotal,
        external_id=external_id, idempotency_key=uuid.uuid4().hex,
    )
    db.add(p)
    await db.flush()
    return p


async def _assert_balance_matches_ledger(db, user):
    """Инвариант, который проверяет и задача check_integrity."""
    from shared.models import BalanceTransaction, User
    await db.flush()
    total = (await db.execute(
        select(func.coalesce(func.sum(BalanceTransaction.amount), 0))
        .where(BalanceTransaction.user_id == user.id)
    )).scalar_one()
    start = getattr(user, "_test_start_balance", Decimal("0"))
    balance = (await db.execute(select(User.balance).where(User.id == user.id))).scalar_one()
    assert balance == start + total


# ── Доплата: холд баланса ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hold_balance_takes_whole_balance_once(db, test_product):
    from api.services.order_service import OrderService
    user = await _user(db, "40.00")
    user._test_start_balance = Decimal("40.00")
    order = await _order(db, user, test_product, "100")
    svc = OrderService(db)

    assert await svc.hold_balance(order, user) == Decimal("40.00")
    assert user.balance == Decimal("0.00")
    # повторный вызов не списывает второй раз
    assert await svc.hold_balance(order, user) == Decimal("40.00")
    assert user.balance == Decimal("0.00")
    await _assert_balance_matches_ledger(db, user)


@pytest.mark.asyncio
async def test_hold_balance_skipped_when_balance_covers_order(db, test_product):
    """Баланса хватает на весь заказ — это обычная оплата балансом, не доплата."""
    from api.services.order_service import OrderService
    user = await _user(db, "500.00")
    order = await _order(db, user, test_product, "100")
    assert await OrderService(db).hold_balance(order, user) == Decimal("0")
    assert user.balance == Decimal("500.00")


@pytest.mark.asyncio
async def test_release_hold_returns_money_once(db, test_product):
    from api.services.order_service import OrderService
    user = await _user(db, "40.00")
    user._test_start_balance = Decimal("40.00")
    order = await _order(db, user, test_product, "100")
    svc = OrderService(db)
    await svc.hold_balance(order, user)

    assert await svc.release_balance_hold(order, "тест") == Decimal("40.00")
    assert user.balance == Decimal("40.00")
    assert await svc.release_balance_hold(order, "тест") == Decimal("0")
    assert user.balance == Decimal("40.00")
    await _assert_balance_matches_ledger(db, user)


# ── Вебхук Platega: заказ ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_platega_confirmed_marks_order_paid_and_is_idempotent(db, test_product):
    from api.services.payment_service import PaymentService
    from shared.models import OrderStatus, PaymentStatus
    user = await _user(db, "0")
    order = await _order(db, user, test_product, "150")
    payment = await _payment(db, order, user, "ext-confirm-1")
    svc = PaymentService(db)

    body = {"Id": "ext-confirm-1", "status": "CONFIRMED", "amount": 150, "currency": "RUB"}
    assert await svc.handle_platega_webhook(body) is True
    assert payment.status == PaymentStatus.succeeded
    assert order.status == OrderStatus.paid
    paid_at = order.paid_at

    # Platega повторяет вебхук — ничего не меняется
    assert await svc.handle_platega_webhook(body) is True
    assert order.status == OrderStatus.paid
    assert order.paid_at == paid_at


@pytest.mark.asyncio
async def test_platega_unknown_payment_rejected(db):
    from api.services.payment_service import PaymentService
    assert await PaymentService(db).handle_platega_webhook({"Id": "nope", "status": "CONFIRMED"}) is False
    assert await PaymentService(db).handle_platega_webhook({"status": "CONFIRMED"}) is False


@pytest.mark.asyncio
async def test_platega_canceled_returns_balance_hold(db, test_product):
    from api.services.order_service import OrderService
    from api.services.payment_service import PaymentService
    from shared.models import PaymentStatus
    user = await _user(db, "30.00")
    user._test_start_balance = Decimal("30.00")
    order = await _order(db, user, test_product, "100")
    await OrderService(db).hold_balance(order, user)
    payment = await _payment(db, order, user, "ext-cancel-1")
    assert user.balance == Decimal("0.00")

    assert await PaymentService(db).handle_platega_webhook({"Id": "ext-cancel-1", "status": "CANCELED"}) is True
    assert payment.status == PaymentStatus.cancelled
    assert user.balance == Decimal("30.00")
    await _assert_balance_matches_ledger(db, user)


# ── Вебхук Coinso ─────────────────────────────────────────────────────────────

def _coinso_status(monkeypatch, status):
    """Подменяет GET /payment/status Coinso (None — API недоступен)."""
    from api.services.payment_service import PaymentService

    async def _fake(self, invoice_id):
        return status
    monkeypatch.setattr(PaymentService, "_coinso_status", _fake)


@pytest.mark.asyncio
async def test_coinso_success_marks_order_paid_once(db, test_product, monkeypatch):
    from api.services.payment_service import PaymentService
    from shared.models import OrderStatus, PaymentStatus
    _coinso_status(monkeypatch, "paid")
    user = await _user(db, "0")
    order = await _order(db, user, test_product, "150")
    payment = await _payment(db, order, user, "Cn5oInv1")
    svc = PaymentService(db)

    body = {"event": "payment.success", "invoice_id": "Cn5oInv1", "amount": 150, "payment_method": "sbp"}
    assert await svc.handle_coinso_webhook(body) is True
    assert payment.status == PaymentStatus.succeeded
    assert order.status == OrderStatus.paid
    assert await svc.handle_coinso_webhook(body) is True  # дубль вебхука
    assert order.status == OrderStatus.paid


@pytest.mark.asyncio
async def test_coinso_success_ignored_when_status_not_paid(db, test_product, monkeypatch):
    from api.services.payment_service import PaymentService
    from shared.models import OrderStatus, PaymentStatus
    _coinso_status(monkeypatch, "pending")
    user = await _user(db, "0")
    order = await _order(db, user, test_product, "150")
    payment = await _payment(db, order, user, "Cn5oInv2")

    body = {"event": "payment.success", "invoice_id": "Cn5oInv2", "amount": 150}
    assert await PaymentService(db).handle_coinso_webhook(body) is True
    assert payment.status == PaymentStatus.pending
    assert order.status == OrderStatus.pending_payment


@pytest.mark.asyncio
async def test_coinso_test_mode_does_not_pay(db, test_product, monkeypatch):
    from api.services.payment_service import PaymentService
    from shared.models import OrderStatus
    _coinso_status(monkeypatch, "paid")
    user = await _user(db, "0")
    order = await _order(db, user, test_product, "150")
    await _payment(db, order, user, "Cn5oInv3")

    body = {"event": "payment.success", "invoice_id": "Cn5oInv3", "amount": 150, "test_mode": True}
    assert await PaymentService(db).handle_coinso_webhook(body) is True
    assert order.status == OrderStatus.pending_payment


@pytest.mark.asyncio
async def test_coinso_failed_returns_balance_hold(db, test_product):
    from api.services.order_service import OrderService
    from api.services.payment_service import PaymentService
    from shared.models import PaymentStatus
    user = await _user(db, "30.00")
    user._test_start_balance = Decimal("30.00")
    order = await _order(db, user, test_product, "100")
    await OrderService(db).hold_balance(order, user)
    payment = await _payment(db, order, user, "Cn5oInv4")

    body = {"event": "payment.failed", "invoice_id": "Cn5oInv4", "error_code": "payment_expired"}
    assert await PaymentService(db).handle_coinso_webhook(body) is True
    assert payment.status == PaymentStatus.cancelled
    assert user.balance == Decimal("30.00")
    await _assert_balance_matches_ledger(db, user)


@pytest.mark.asyncio
async def test_coinso_topup_credits_amount_without_markup(db, monkeypatch):
    """К оплате ушло 102 ₽ (крипта +2%), зачисляется 100 ₽ — сумма якоря."""
    from api.services.payment_service import PaymentService
    from shared.models import BalanceTopup
    _coinso_status(monkeypatch, None)  # статус-API недоступен — доверяем подписанному вебхуку
    user = await _user(db, "0")
    topup = BalanceTopup(user_id=user.id, amount=Decimal("100.00"), provider="coinso", external_id="Cn5oTop1")
    db.add(topup)
    await db.flush()
    svc = PaymentService(db)

    body = {"event": "payment.success", "invoice_id": "Cn5oTop1", "amount": 102}
    assert await svc.handle_coinso_webhook(body) is True
    assert await svc.handle_coinso_webhook(body) is True
    await db.flush()
    await db.refresh(user)
    assert user.balance == Decimal("100.00")
    assert topup.status == "credited"
    await _assert_balance_matches_ledger(db, user)


def test_gateway_for_routes_card_to_platega(monkeypatch):
    from api.services import payment_service as ps
    monkeypatch.setattr(ps.settings, "COINSO_PROJECT_ID", "1")
    monkeypatch.setattr(ps.settings, "COINSO_SECRET_KEY", "s")
    assert ps.gateway_for("sbp") == "coinso"
    assert ps.gateway_for("crypto") == "coinso"
    assert ps.gateway_for("card") == "platega"
    monkeypatch.setattr(ps.settings, "COINSO_SECRET_KEY", "")
    assert ps.gateway_for("sbp") == "platega"  # Coinso не настроен — запасной шлюз


# ── Вебхук Platega: пополнение баланса ────────────────────────────────────────

@pytest.mark.asyncio
async def test_topup_credited_once_with_server_amount(db):
    from api.services.payment_service import PaymentService
    from shared.models import BalanceTopup
    user = await _user(db, "0")
    topup = BalanceTopup(user_id=user.id, amount=Decimal("500.00"), provider="platega", external_id="ext-topup-1")
    db.add(topup)
    await db.flush()
    svc = PaymentService(db)

    # сумма в вебхуке отличается — зачисляется серверная (из BalanceTopup)
    body = {"Id": "ext-topup-1", "status": "CONFIRMED", "amount": 99999}
    assert await svc.handle_platega_webhook(body) is True
    assert await svc.handle_platega_webhook(body) is True  # повтор вебхука
    await db.flush()
    await db.refresh(user)
    assert user.balance == Decimal("500.00")
    assert topup.status == "credited"
    await _assert_balance_matches_ledger(db, user)


@pytest.mark.asyncio
async def test_topup_chargeback_after_credit_keeps_balance(db):
    """Оспоренное после зачисления пополнение не списывается автоматически — решает персонал."""
    from api.services.payment_service import PaymentService
    from shared.models import BalanceTopup
    user = await _user(db, "0")
    topup = BalanceTopup(user_id=user.id, amount=Decimal("200.00"), provider="platega", external_id="ext-topup-2")
    db.add(topup)
    await db.flush()
    svc = PaymentService(db)
    await svc.handle_platega_webhook({"Id": "ext-topup-2", "status": "CONFIRMED"})
    await svc.handle_platega_webhook({"Id": "ext-topup-2", "status": "CHARGEBACKED"})
    await db.flush()
    await db.refresh(user)
    assert topup.status == "chargeback"
    assert user.balance == Decimal("200.00")


# ── Кэшбэк ────────────────────────────────────────────────────────────────────

async def _only_level(db, percent: str, cap: str | None):
    """Оставляет в БД один уровень лояльности (откатится вместе с тестом)."""
    from shared.models import LoyaltyLevel, User
    await db.execute(User.__table__.update().values(loyalty_level_id=None))
    await db.execute(delete(LoyaltyLevel))
    db.add(LoyaltyLevel(
        name="Test", min_spent=Decimal("0"), cashback_percent=Decimal(percent),
        monthly_cashback_cap=Decimal(cap) if cap is not None else None, priority=1,
    ))
    await db.flush()


@pytest.mark.asyncio
async def test_cashback_percent_cap_and_idempotency(db, test_product):
    from api.services.loyalty_service import LoyaltyService
    from shared.models import OrderStatus
    await _only_level(db, "5", "30")
    user = await _user(db, "0")
    user._test_start_balance = Decimal("0")
    svc = LoyaltyService(db)

    first = await _order(db, user, test_product, "400", status=OrderStatus.completed)
    assert await svc.apply_cashback(first) == Decimal("20.00")   # 5% от 400
    assert await svc.apply_cashback(first) == Decimal("0")       # повторно не начисляет

    second = await _order(db, user, test_product, "400", status=OrderStatus.completed)
    assert await svc.apply_cashback(second) == Decimal("10.00")  # упёрлись в потолок 30 ₽/мес
    await db.flush()
    await db.refresh(user)
    assert user.balance == Decimal("30.00")
    await _assert_balance_matches_ledger(db, user)


# ── Импорт GGSEL (запись плана в каталог) ─────────────────────────────────────

@pytest.mark.asyncio
async def test_ggsel_import_reuses_category_and_converts_prices(db, test_game):
    from api.schemas.admin import ImportCommitIn
    from api.services.ggsel_import_commit import commit_ggsel_import
    from shared.models import Category, Product, ShopSettings

    # фиксированный курс и наценка, чтобы цены были предсказуемы
    for key, value in (("usd_rub_rate", "90"), ("markup_balance", "0")):
        row = (await db.execute(select(ShopSettings).where(ShopSettings.key == key))).scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(ShopSettings(key=key, value=value))
    existing = Category(game_id=test_game.id, name="Алмазы", slug="almazy", is_active=True)
    db.add(existing)
    await db.flush()

    body = ImportCommitIn(
        game_id=test_game.id, base_price=90,
        categories=[
            {"name": "Алмазы", "products": [{"name": "100 алмазов", "price_modifier": 0},
                                            {"name": "Бесплатно", "price_modifier": -90}]},
            {"name": "Наборы", "products": [{"name": "Набор", "price_modifier": 810}]},
        ],
        input_fields=[{"key": "player_id", "label": "ID игрока", "required": True}],
    )
    cats, prods = await commit_ggsel_import(db, test_game, body)

    assert (cats, prods) == (1, 3)  # «Алмазы» переиспользован, создан только «Наборы»
    items = {p.name: p for p in (await db.execute(
        select(Product).join(Category).where(Category.game_id == test_game.id)
    )).scalars()}
    assert items["100 алмазов"].price_usd == Decimal("1.0000")   # 90 ₽ / 90
    assert items["100 алмазов"].price == Decimal("89")           # 90 ₽ → ближайшее «…9»
    assert items["Набор"].price_usd == Decimal("10.0000")        # (90 + 810) / 90
    assert items["Набор"].price == Decimal("899")
    assert items["Бесплатно"].price_usd == Decimal("0.0000")     # отрицательная себестоимость → 0
    assert items["Бесплатно"].is_active is False                 # без цены — не продаём
    assert items["Набор"].is_active is True
    assert any(f.get("key") == "player_id" for f in test_game.input_fields)

    # повторный импорт тех же полей не дублирует их
    await commit_ggsel_import(db, test_game, body)
    assert sum(1 for f in test_game.input_fields if f.get("key") == "player_id") == 1
