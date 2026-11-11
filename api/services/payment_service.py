"""
api/services/payment_service.py
─────────────────────────────────────────────────────────────────────────────
Оплата заказов и пополнение баланса.
  pay_balance            заказ целиком с баланса
  pay_external           СБП / карта / крипта через внешний шлюз (с доплатой из баланса)
  topup_external         пополнение баланса через внешний шлюз
  handle_platega_webhook подтверждение / отмена платежа от Platega
  handle_coinso_webhook  подтверждение / отмена платежа от Coinso
Шлюз по способу (gateway_for): карта — Platega; СБП и крипта — Coinso, пока он
настроен (иначе тоже Platega).
Подробно — docs/ORDERS_AND_PAYMENTS.md.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import settings
from shared.models import (
    BalanceTopup,
    Order,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    User,
)
from api.services.order_service import OrderService

logger = logging.getLogger(__name__)


# Platega paymentMethod-коды по нашему PaymentMethod.value.
# 2 = СБП QR + Sberpay, 11 = эквайринг карт, 13 = криптовалюта.
PLATEGA_METHOD_CODES: dict[str, int] = {
    "sbp": 2,
    "card": 11,
    "crypto": 13,
}


# Способы, которые идут через Coinso (наш PaymentMethod.value → method Coinso).
COINSO_METHODS: dict[str, str] = {
    "sbp": "sbp",
    "crypto": "crypto",
}


def coinso_enabled() -> bool:
    return bool(settings.COINSO_PROJECT_ID and settings.COINSO_SECRET_KEY)


def gateway_for(method_value: str) -> str:
    """Через какой шлюз идёт способ оплаты: 'coinso' | 'platega'."""
    if method_value in COINSO_METHODS and coinso_enabled():
        return "coinso"
    return "platega"


def _app_base(source: str) -> str:
    """Базовый URL фронта по источнику: сайт — корень, miniapp — /app.

    Обе сборки живут на FRONTEND_URL (redonate.gg): сайт в корне, Mini App
    под /app (vite base '/app/'). Возврат после оплаты должен вести туда же,
    откуда платили.
    """
    base = settings.FRONTEND_URL.rstrip("/")
    return base if source == "web" else f"{base}/app"


def _return_urls(source: str, path: str, success_query: str, fail_query: str) -> tuple[str, str]:
    """URL возврата из Platega (успех, неудача).

    source='bot' — оплата начата в чате бота: возвращаем в Telegram (t.me),
    итог придёт сообщением от бота. Иначе — на экран сайта/Mini App.
    """
    if source == "bot":
        bot_url = f"https://t.me/{settings.BOT_USERNAME}"
        return bot_url, bot_url
    app_base = _app_base(source)
    return f"{app_base}{path}?{success_query}", f"{app_base}{path}{fail_query and '?' + fail_query}"


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.order_svc = OrderService(db)

    def _make_idempotency_key(self, order_id: uuid.UUID, method: str) -> str:
        """Детерминированный ключ идемпотентности на основе UUID5."""
        raw = f"{order_id}:{method}"
        return str(uuid.uuid5(uuid.NAMESPACE_URL, raw))

    async def _create_payment_record(
        self,
        order: Order,
        user: User,
        method: PaymentMethod,
    ) -> Payment:
        key = self._make_idempotency_key(order.id, method.value)
        # Повторная инициация оплаты тем же методом (заказ ещё в pending_payment):
        # переиспользуем существующую запись вместо вставки-дубля (IntegrityError).
        existing = await self.db.execute(
            select(Payment).where(Payment.idempotency_key == key)
        )
        payment = existing.scalar_one_or_none()
        if payment is not None:
            payment.amount = order.total_amount
            payment.status = PaymentStatus.pending
            return payment

        payment = Payment(
            order_id=order.id,
            user_id=user.id,
            method=method,
            status=PaymentStatus.pending,
            amount=order.total_amount,
            currency="RUB",
            idempotency_key=key,
        )
        self.db.add(payment)
        await self.db.flush()
        return payment

    @staticmethod
    def _amounts_match(payload_amount, expected: Decimal) -> bool:
        """Сверка суммы из webhook с ожидаемой (серверной). None → не блокируем."""
        if payload_amount is None:
            return True
        try:
            got = Decimal(str(payload_amount))
        except (InvalidOperation, ValueError, TypeError):
            return False
        return abs(got - expected) <= Decimal("0.01")

    # ── 1. Баланс ─────────────────────────────────────────────────────────────

    @staticmethod
    def _mark_source(order: Order, source: str) -> None:
        """Откуда оплачен заказ (web | miniapp | bot) — для уведомления персоналу."""
        order.meta = {**(order.meta or {}), "source": source}

    async def pay_balance(self, order: Order, user: User, source: str = "miniapp") -> dict:
        """Моментальная оплата с внутреннего баланса."""
        self._mark_source(order, source)
        payment = await self._create_payment_record(order, user, PaymentMethod.balance)

        try:
            # new → pending_payment — обязательный промежуточный переход по конечному автомату
            if order.status == OrderStatus.new:
                await self.order_svc.change_status(
                    order,
                    OrderStatus.pending_payment,
                    changed_by_type="system",
                    reason="Инициирована оплата балансом",
                )
            await self.order_svc.pay_with_balance(order, user)
            payment.status = PaymentStatus.succeeded
            payment.paid_at = datetime.now(timezone.utc)
            await self._notify_user_payment_success(order)
            return {"success": True, "payment_id": str(payment.id)}
        except ValueError:
            payment.status = PaymentStatus.failed
            raise

    # ── 2. Внешние шлюзы (СБП / карта / крипта) ───────────────────────────────

    async def pay_external(
        self,
        order: Order,
        user: User,
        method_value: str,
        source: str = "miniapp",
        use_balance: bool = False,
    ) -> dict:
        """Оплата заказа через шлюз, закреплённый за способом (gateway_for)."""
        if gateway_for(method_value) == "coinso":
            return await self.pay_coinso(order, user, method_value, source, use_balance)
        return await self.pay_platega(order, user, method_value, source, use_balance)

    async def topup_external(
        self, user: User, amount_rub: Decimal, method_value: str, source: str = "miniapp",
    ) -> dict:
        """Пополнение баланса через шлюз, закреплённый за способом (gateway_for)."""
        if gateway_for(method_value) == "coinso":
            return await self.topup_coinso(user, amount_rub, method_value, source)
        return await self.topup_platega(user, amount_rub, method_value, source)

    async def _prepare_external(
        self, order: Order, user: User, method_value: str, source: str, use_balance: bool,
    ) -> tuple[Payment, Decimal]:
        """Запись платежа + холд баланса. Возвращает (payment, остаток к оплате БЕЗ наценки)."""
        self._mark_source(order, source)
        payment = await self._create_payment_record(order, user, PaymentMethod(method_value))
        # Доплата: при use_balance часть суммы списывается с баланса (холд),
        # в шлюз уходит только остаток.
        if use_balance:
            await self.order_svc.hold_balance(order, user)
        else:
            await self.order_svc.release_balance_hold(order, "оплата без баланса")
        rest = order.subtotal - order.discount_amount - self.order_svc.balance_hold(order)
        if rest <= 0:
            raise ValueError("Баланса хватает на весь заказ — выберите оплату балансом")
        return payment, rest

    async def _with_method_markup(self, amount: Decimal, method_value: str) -> Decimal:
        """Сумма с наценкой способа (админка «Цены» → наценки по способам оплаты)."""
        from api.services.pricing import method_total
        from api.services.rapira_service import DISPLAY_GROUP, get_all_markups, method_group

        markups = await get_all_markups(self.db)
        disp = markups[DISPLAY_GROUP]
        return Decimal(str(method_total(float(amount), disp, markups.get(method_group(method_value), disp))))

    # ── 2a. Platega (карта) ───────────────────────────────────────────────────

    async def _platega_headers(self) -> dict:
        return {
            "X-MerchantId": settings.PLATEGA_MERCHANT_ID,
            "X-Secret": settings.PLATEGA_SECRET,
            "Content-Type": "application/json",
        }

    async def pay_platega(
        self,
        order: Order,
        user: User,
        method_value: str = "card",
        source: str = "miniapp",
        use_balance: bool = False,
    ) -> dict:
        """
        Создаёт транзакцию в Platega (POST /transaction/process) и возвращает
        ссылку на оплату. Подтверждение приходит через webhook (status=CONFIRMED).
        method_value — 'sbp' | 'card' | 'crypto'. source — 'web' | 'miniapp' | 'bot'
        (куда вернуть после оплаты).
        """
        if not settings.PLATEGA_MERCHANT_ID or not settings.PLATEGA_SECRET:
            raise ValueError("Platega не настроена")
        code = PLATEGA_METHOD_CODES.get(method_value)
        if code is None:
            raise ValueError("Неподдерживаемый метод Platega")

        # В Platega уходит БАЗОВАЯ цена магазина (subtotal − скидка), БЕЗ нашей
        # наценки метода: комиссию за способ Platega добавляет клиенту сама.
        # Иначе комиссия бралась бы дважды (наша наценка + комиссия Platega).
        payment, base_amount = await self._prepare_external(order, user, method_value, source, use_balance)
        payment.amount = base_amount

        return_url, failed_url = _return_urls(source, f"/orders/{order.id}", "success=1", "")
        payload = {
            "paymentMethod": code,
            "paymentDetails": {"amount": float(base_amount), "currency": "RUB"},
            "description": f"Заказ {order.order_number} — {settings.SHOP_NAME}",
            "return": return_url,
            "failedUrl": failed_url,
            "payload": str(order.id),
            "metadata": {"userId": str(user.telegram_id)},
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.PLATEGA_BASE_URL.rstrip('/')}/transaction/process",
                json=payload,
                headers=await self._platega_headers(),
                timeout=15.0,
            )

        data = response.json() if response.content else {}
        payment.raw_response = data
        # Platega возвращает id транзакции в поле "transactionId" (не "id").
        # Пустой id не пишем ('' сломал бы UNIQUE-индекс external_id).
        txid = data.get("transactionId") or data.get("id")
        payment.external_id = str(txid) if txid else None

        # v1 отдаёт ссылку в "redirect", v2 — в "url".
        redirect = data.get("redirect") or data.get("url")
        if response.status_code not in (200, 201) or not redirect:
            payment.status = PaymentStatus.failed
            logger.warning(
                "Platega pay error order=%s HTTP=%s body=%s req=%s",
                order.id, response.status_code, response.text[:2000],
                {"paymentDetails": payload["paymentDetails"],
                 "paymentMethod": payload["paymentMethod"]},
            )
            raise ValueError("Не удалось создать платёж, попробуйте позже")

        await self.order_svc.change_status(
            order,
            OrderStatus.pending_payment,
            changed_by_type="system",
            reason=f"Platega {method_value}: транзакция создана",
        )

        return {
            "success": False,
            "payment_id": str(payment.id),
            "redirect_url": redirect,
        }

    # ── 2b. Coinso (СБП / крипта) ─────────────────────────────────────────────

    @staticmethod
    def _coinso_client_data(user: User) -> dict:
        """Данные плательщика для антифрода Coinso (все поля необязательны)."""
        from shared.models.user import is_telegram_id

        data = {"client_user_id": str(user.id)}
        if user.email:
            data["client_email"] = user.email
        if is_telegram_id(user.telegram_id):
            data["client_telegram_id"] = str(user.telegram_id)
        return data

    async def _coinso_create(self, body: dict) -> tuple[dict, int]:
        """POST /payment/create. Возвращает (тело ответа, HTTP-код)."""
        body = {
            "project_id": int(settings.COINSO_PROJECT_ID),
            "integration_type": "standard",
            **body,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.COINSO_BASE_URL.rstrip('/')}/payment/create",
                json=body,
                headers={"Authorization": f"Bearer {settings.COINSO_SECRET_KEY}"},
                # QR СБП банк-партнёр может выдавать до 30 с
                timeout=40.0,
            )
        try:
            data = response.json()
        except ValueError:
            data = {"raw": response.text[:2000]}
        return data, response.status_code

    @staticmethod
    def _coinso_error(data: dict) -> str:
        """Текст ошибки для покупателя по ответу Coinso."""
        code = data.get("error_code")
        if code == "amount_out_of_range":
            return "Сумма вне лимитов этого способа оплаты — выберите другой способ"
        if data.get("error_source") == "bank" or data.get("retryable") or code == "method_disabled":
            return "Способ оплаты сейчас недоступен — попробуйте позже или выберите другой"
        return "Не удалось создать платёж, попробуйте позже"

    async def pay_coinso(
        self,
        order: Order,
        user: User,
        method_value: str,
        source: str = "miniapp",
        use_balance: bool = False,
    ) -> dict:
        """
        Счёт Coinso (POST /payment/create) → ссылка на страницу оплаты.
        Подтверждение — вебхук payment.success (handle_coinso_webhook).
        Свою комиссию Coinso удерживает с нас, а не с покупателя, поэтому в счёт
        уходит сумма С нашей наценкой способа (СБП / крипта из «Цен»).
        """
        if method_value not in COINSO_METHODS:
            raise ValueError("Неподдерживаемый метод Coinso")
        payment, rest = await self._prepare_external(order, user, method_value, source, use_balance)
        amount = await self._with_method_markup(rest, method_value)
        payment.amount = amount

        success_url, fail_url = _return_urls(source, f"/orders/{order.id}", "success=1", "")
        data, http = await self._coinso_create({
            "amount": float(amount),
            "method": COINSO_METHODS[method_value],
            "description": f"Заказ {order.order_number} — {settings.SHOP_NAME}",
            "custom": str(order.id),
            "success_url": success_url,
            "fail_url": fail_url,
            **self._coinso_client_data(user),
        })
        payment.raw_response = data
        invoice_id = data.get("invoice_id")
        redirect = data.get("payment_url")
        if http != 200 or not data.get("success") or not invoice_id or not redirect:
            payment.status = PaymentStatus.failed
            logger.warning(
                "Coinso pay error order=%s HTTP=%s body=%s amount=%s method=%s",
                order.id, http, str(data)[:2000], amount, method_value,
            )
            raise ValueError(self._coinso_error(data))
        payment.external_id = str(invoice_id)

        await self.order_svc.change_status(
            order,
            OrderStatus.pending_payment,
            changed_by_type="system",
            reason=f"Coinso {method_value}: счёт создан",
        )
        return {"success": False, "payment_id": str(payment.id), "redirect_url": redirect}

    async def topup_coinso(
        self, user: User, amount_rub: Decimal, method_value: str, source: str = "miniapp",
    ) -> dict:
        """Пополнение через Coinso: зачисляется amount_rub, к оплате — с наценкой способа."""
        if method_value not in COINSO_METHODS:
            raise ValueError("Неподдерживаемый метод Coinso")
        if amount_rub < Decimal("10"):
            raise ValueError("Минимальная сумма пополнения: 10 ₽")
        charge = await self._with_method_markup(amount_rub, method_value)

        success_url, fail_url = _return_urls(source, "/balance", "topup=success", "topup=failed")
        data, http = await self._coinso_create({
            "amount": float(charge),
            "method": COINSO_METHODS[method_value],
            "description": f"Пополнение баланса — {settings.SHOP_NAME}",
            "custom": f"topup:{user.id}",
            "success_url": success_url,
            "fail_url": fail_url,
            **self._coinso_client_data(user),
        })
        invoice_id = data.get("invoice_id")
        redirect = data.get("payment_url")
        if http != 200 or not data.get("success") or not invoice_id or not redirect:
            logger.warning(
                "Coinso topup error user=%s HTTP=%s body=%s amount=%s method=%s",
                user.id, http, str(data)[:2000], charge, method_value,
            )
            raise ValueError(self._coinso_error(data))

        # Якорь: зачисляем ровно amount_rub (без наценки), что бы ни пришло в вебхуке.
        self.db.add(BalanceTopup(
            user_id=user.id,
            amount=amount_rub,
            provider="coinso",
            external_id=str(invoice_id),
            status="pending",
        ))
        await self.db.flush()
        return {"redirect_url": redirect, "payment_id": str(invoice_id)}

    # ── Webhook обработчики ───────────────────────────────────────────────────

    async def handle_platega_webhook(self, payload: dict) -> bool:
        """
        Обработка webhook от Platega.
        Тело: {Id, amount, currency, status, paymentMethod, payload}.
        status ∈ CONFIRMED | CANCELED | PENDING | CHARGEBACKED.
        """
        external_id = str(
            payload.get("Id") or payload.get("id") or payload.get("transactionId") or ""
        )
        status = payload.get("status")
        logger.info(
            "Platega webhook in: external_id=%s status=%s keys=%s",
            external_id, status, list(payload.keys()),
        )
        if not external_id:
            logger.warning("Platega webhook без Id: body=%s", payload)
            return False
        outcome = {"CONFIRMED": "paid", "CANCELED": "failed", "CHARGEBACKED": "chargeback"}.get(status)
        return await self._settle("platega", external_id, outcome, payload.get("amount"), payload)

    async def handle_coinso_webhook(self, payload: dict) -> bool:
        """
        Обработка webhook от Coinso (подпись проверена в роутере).
        Тело: {event: payment.success|payment.failed, invoice_id, transaction_id,
        custom, amount, payment_method, test_mode?, error_code?...}.
        Маршрутизация — по invoice_id (= external_id), custom не доверяем.
        """
        external_id = str(payload.get("invoice_id") or "")
        event = payload.get("event")
        logger.info(
            "Coinso webhook in: invoice=%s event=%s txn=%s test=%s",
            external_id, event, payload.get("transaction_id"), payload.get("test_mode"),
        )
        if not external_id:
            logger.warning("Coinso webhook без invoice_id: body=%s", payload)
            return False
        if payload.get("test_mode") and not settings.COINSO_ACCEPT_TEST:
            # Тестовый платёж (денег нет) — товар не выдаём
            logger.warning("Coinso: тестовый платёж %s проигнорирован (COINSO_ACCEPT_TEST=false)", external_id)
            return True

        if event == "payment.success":
            # Сверка через GET /payment/status: вебхук может прийти дважды или с опозданием.
            # Если статус-API недоступен — доверяем вебхуку (он подписан Secret Key).
            status = await self._coinso_status(external_id)
            if status is not None and status != "paid":
                logger.error("Coinso: вебхук success, но статус счёта %s = %s", external_id, status)
                return True
            outcome = "paid"
        elif event == "payment.failed":
            outcome = "failed"
        else:
            outcome = None
        return await self._settle("coinso", external_id, outcome, payload.get("amount"), payload)

    async def _coinso_status(self, invoice_id: str) -> str | None:
        """Статус счёта Coinso (pending|paid|expired|failed) или None, если API недоступен."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{settings.COINSO_BASE_URL.rstrip('/')}/payment/status",
                    params={"uuid": invoice_id}, timeout=10.0,
                )
            return r.json().get("status") if r.status_code == 200 else None
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Coinso status %s недоступен: %s", invoice_id, exc)
            return None

    async def _settle(
        self, provider: str, external_id: str, outcome: str | None, amount, raw: dict,
    ) -> bool:
        """
        Итог платежа шлюза: outcome ∈ paid | failed | chargeback | None (промежуточный).
        Сначала ищем якорь пополнения баланса, иначе — платёж заказа. Идемпотентно.
        """
        # ── Пополнение баланса ────────────────────────────────────────────────
        # Маршрутизация строго по external_id (тело webhook не доверяем).
        # Якорь BalanceTopup — источник истины по сумме/пользователю.
        topup_result = await self.db.execute(
            select(BalanceTopup)
            .where(
                BalanceTopup.provider == provider,
                BalanceTopup.external_id == external_id,
            )
            .with_for_update()
        )
        topup = topup_result.scalar_one_or_none()
        if topup is not None:
            if topup.status == "credited" and outcome == "chargeback":
                # Пополнение оспорено через банк ПОСЛЕ зачисления: баланс не трогаем
                # (мог быть уже потрачен) — решает персонал
                topup.status = "chargeback"
                await self._alert_chargeback(
                    f"Пополнение баланса на {topup.amount} ₽ оспорено через банк (chargeback) "
                    f"после зачисления.", topup.user_id, external_id, provider,
                )
                return True
            if topup.status in ("credited", "chargeback"):
                return True  # Идемпотентность
            if outcome == "paid":
                # Зачисляем всегда серверную сумму (topup.amount), не из webhook.
                # У Platega к оплате = зачислению — расхождение пишем в аудит-лог.
                # У Coinso к оплате уходит сумма с наценкой способа — не сверяем.
                if provider == "platega" and not self._amounts_match(amount, topup.amount):
                    logger.error(
                        "%s topup amount mismatch: webhook=%s expected=%s ext=%s",
                        provider, amount, topup.amount, external_id,
                    )
                await self._credit_balance_topup(
                    topup.user_id, topup.amount, provider, external_id
                )
                topup.status = "credited"
                topup.credited_at = datetime.now(timezone.utc)
            elif outcome in ("failed", "chargeback"):
                topup.status = "failed"
            return True

        # ── Оплата заказа ─────────────────────────────────────────────────────
        # FOR UPDATE сериализует параллельные ретраи вебхука.
        result = await self.db.execute(
            select(Payment).where(Payment.external_id == external_id).with_for_update()
        )
        payment = result.scalar_one_or_none()
        if not payment:
            logger.warning(
                "%s webhook: платёж не найден по external_id=%s; body=%s",
                provider, external_id, raw,
            )
            return False

        if payment.status == PaymentStatus.succeeded and outcome == "chargeback":
            # Оплата заказа оспорена через банк после подтверждения — заказ мог быть
            # уже выдан; статус заказа не меняем, решает персонал
            payment.status = PaymentStatus.refunded
            payment.raw_response = raw
            order = (await self.db.execute(select(Order).where(Order.id == payment.order_id))).scalar_one_or_none()
            await self._alert_chargeback(
                f"Оплата заказа {order.order_number if order else payment.order_id} на {payment.amount} ₽ "
                f"оспорена через банк (chargeback).", order.user_id if order else None, external_id, provider,
            )
            return True
        if payment.status in (PaymentStatus.succeeded, PaymentStatus.refunded):
            return True  # Идемпотентность

        payment.raw_response = raw

        if outcome == "paid":
            # Расхождение суммы — аудит-лог. Заказ оплачивается на фикс. серверную сумму.
            if not self._amounts_match(amount, payment.amount):
                logger.error(
                    "%s order amount mismatch: webhook=%s expected=%s ext=%s",
                    provider, amount, payment.amount, external_id,
                )

            payment.status = PaymentStatus.succeeded
            payment.paid_at = datetime.now(timezone.utc)

            order_result = await self.db.execute(
                select(Order).where(Order.id == payment.order_id).with_for_update()
            )
            order = order_result.scalar_one_or_none()
            if order and order.status == OrderStatus.pending_payment:
                await self.order_svc.change_status(
                    order,
                    OrderStatus.paid,
                    changed_by_type="system",
                    reason=f"{provider.capitalize()}: оплачено",
                )
                await self._notify_user_payment_success(order)

        elif outcome in ("failed", "chargeback"):
            payment.status = PaymentStatus.cancelled
            # Платёж не прошёл — возвращаем часть, списанную с баланса (если была).
            order = (await self.db.execute(
                select(Order).where(Order.id == payment.order_id).with_for_update()
            )).scalar_one_or_none()
            if order and order.status in (OrderStatus.new, OrderStatus.pending_payment):
                await self.order_svc.release_balance_hold(order, "платёж отменён")

        return True

    async def _alert_chargeback(self, what: str, user_id, external_id: str, provider: str = "platega") -> None:
        """Сообщение персоналу об оспоренном платеже. Сбой отправки не мешает вебхуку."""
        from html import escape

        from shared.staff_notify import send_staff_async

        who = ""
        if user_id is not None:
            user = (await self.db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if user:
                who = f"\nПокупатель: {escape(user.display_name)} (ID {user.telegram_id}), баланс {user.balance} ₽"
        logger.error("%s CHARGEBACK: %s ext=%s user=%s", provider, what, external_id, user_id)
        try:
            await send_staff_async(
                self.db,
                f"<b>Chargeback</b>\n{escape(what)}{who}\nПлатёж {escape(provider.capitalize())}: <code>{escape(external_id)}</code>",
            )
        except Exception as exc:  # noqa: BLE001 — уведомление не должно ронять обработку вебхука
            logger.error("chargeback alert не отправлен: %s", exc)


    async def topup_platega(
        self, user: User, amount_rub: Decimal, method_value: str = "card",
        source: str = "miniapp",
    ) -> dict:
        """Создаёт транзакцию Platega для пополнения баланса.

        Заводит якорную запись BalanceTopup (сумма/пользователь фиксируются
        сервером). Зачисление — в handle_platega_webhook: находит запись по
        external_id и зачисляет ИМЕННО её сумму (не доверяя телу webhook).
        Идемпотентность — статус записи + unique (provider, external_payment_id)
        в _credit_balance_topup.
        """
        if not settings.PLATEGA_MERCHANT_ID or not settings.PLATEGA_SECRET:
            raise ValueError("Platega не настроена")
        code = PLATEGA_METHOD_CODES.get(method_value)
        if code is None:
            raise ValueError("Неподдерживаемый метод Platega")
        if amount_rub < Decimal("10"):
            raise ValueError("Минимальная сумма пополнения: 10 ₽")

        # Возврат на экран баланса той сборки, откуда пополняли
        # (сайт: /balance, miniapp: /app/balance, бот: чат бота).
        return_url, failed_url = _return_urls(source, "/balance", "topup=success", "topup=failed")
        payload = {
            "paymentMethod": code,
            "paymentDetails": {"amount": float(amount_rub), "currency": "RUB"},
            "description": f"Пополнение баланса — {settings.SHOP_NAME}",
            "return": return_url,
            "failedUrl": failed_url,
            "payload": f"topup:{user.id}",
            "metadata": {"userId": str(user.telegram_id)},
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.PLATEGA_BASE_URL.rstrip('/')}/transaction/process",
                json=payload,
                headers=await self._platega_headers(),
                timeout=15.0,
            )

        data = response.json() if response.content else {}
        redirect = data.get("redirect") or data.get("url")
        txid = data.get("transactionId") or data.get("id")
        external_id = str(txid) if txid else None
        if response.status_code not in (200, 201) or not redirect or not external_id:
            logger.warning(
                "Platega topup error user=%s HTTP=%s body=%s req=%s",
                user.id, response.status_code, response.text[:2000],
                {"paymentDetails": payload["paymentDetails"],
                 "paymentMethod": payload["paymentMethod"]},
            )
            raise ValueError("Не удалось создать платёж, попробуйте позже")

        # Якорь: source of truth по сумме/пользователю для webhook-зачисления.
        self.db.add(BalanceTopup(
            user_id=user.id,
            amount=amount_rub,
            provider="platega",
            external_id=external_id,
            status="pending",
        ))
        await self.db.flush()

        return {"redirect_url": redirect, "payment_id": external_id}

    async def _credit_balance_topup(
        self,
        user_id: uuid.UUID,
        amount: Decimal,
        provider: str,
        external_id: str,
    ) -> None:
        """
        Зачисляет пополнение баланса пользователю.

        Идемпотентен по паре (provider, external_payment_id): повторный вызов
        с тем же external_id ничего не делает. Защита от ретраев вебхука Platega.
        """
        from shared.models import BalanceTransaction
        from sqlalchemy.exc import IntegrityError

        existing = await self.db.execute(
            select(BalanceTransaction.id).where(
                BalanceTransaction.provider == provider,
                BalanceTransaction.external_payment_id == external_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            logger.info(
                "Idempotent skip: topup %s/%s already credited",
                provider, external_id,
            )
            return

        result = await self.db.execute(select(User).where(User.id == user_id).with_for_update())
        user = result.scalar_one_or_none()
        if not user:
            logger.warning("topup: user %s not found", user_id)
            return

        balance_before = user.balance
        user.balance += amount
        self.db.add(BalanceTransaction(
            user_id=user.id,
            amount=amount,
            balance_before=balance_before,
            balance_after=user.balance,
            type="top_up",
            description=f"Пополнение через {provider}",
            reference_id=user.id,
            provider=provider,
            external_payment_id=external_id,
        ))
        try:
            await self.db.flush()
        except IntegrityError:
            # Гонка между двумя параллельными ретраями webhook'а: первый успел
            # закоммитить, второй падает на unique constraint. Откатываем своё
            # изменение баланса и выходим — транзакция уже учтена.
            await self.db.rollback()
            logger.info(
                "Idempotent race: topup %s/%s lost insert race, skipped",
                provider, external_id,
            )
            return

        logger.info("Balance topup: user %s +%s RUB via %s (%s)", user_id, amount, provider, external_id)

        # Уведомление пользователю о пополнении
        from bot.utils.texts import texts
        from api.telegram_utils import send_tg_message
        await send_tg_message(
            user.telegram_id,
            texts.balance_topup_success(float(amount), float(user.balance)),
            email_path="/balance", email_button="Открыть баланс",
        )

    async def _notify_user_payment_success(self, order: Order) -> None:
        """Отправляет уведомление пользователю и добавляет системное сообщение в чат."""
        from sqlalchemy.orm import selectinload
        from bot.utils.texts import texts
        from api.telegram_utils import send_tg_message

        # Загружаем связь с пользователем и позициями заказа
        telegram_id: int | None = None
        items_str: str = ""
        order_with_user = None
        try:
            result = await self.db.execute(
                select(Order)
                .options(selectinload(Order.user), selectinload(Order.items))
                .where(Order.id == order.id)
            )
            order_with_user = result.scalar_one()
            telegram_id = order_with_user.user.telegram_id
            seen: list[str] = []
            for item in order_with_user.items:
                name = f"{item.game_name}, {item.product_name}" if item.game_name else item.product_name
                if name not in seen:
                    seen.append(name)
            items_str = "; ".join(seen)
        except Exception as exc:
            logger.warning("Не удалось загрузить пользователя заказа: %s", exc)

        if telegram_id is not None:
            order_url = f"{settings.MINIAPP_URL.rstrip('/')}/orders/{order.id}?success=1"
            reply_markup = {
                "inline_keyboard": [[
                    {
                        "text": "Открыть заказ",
                        "web_app": {"url": order_url},
                    }
                ]]
            }
            await send_tg_message(
                telegram_id,
                texts.order_paid(order.order_number),
                reply_markup=reply_markup,
                email_path=f"/orders/{order.id}", email_button="Открыть заказ",
            )

        # Системное сообщение в чат
        if telegram_id is not None:
            try:
                from api.services.chat_service import ChatService
                chat_svc = ChatService(self.db)
                await chat_svc.add_system_message(
                    telegram_id,
                    texts.chat_order_paid(
                        order.order_number,
                        float(order.total_amount),
                        items_str,
                        str(order.id),
                    ),
                )
                # Инструкции по каждому товару (если есть)
                seen_instructions: set[str] = set()
                for item in (order_with_user.items if order_with_user else []):
                    instruction = getattr(item, "instruction", None)
                    if instruction and instruction not in seen_instructions:
                        seen_instructions.add(instruction)
                        await chat_svc.add_system_message(
                            telegram_id,
                            texts.chat_order_instruction(item.product_name, instruction),
                        )
            except Exception as exc:
                logger.warning("Не удалось добавить системное сообщение в чат: %s", exc)
