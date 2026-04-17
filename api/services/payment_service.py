"""
api/services/payment_service.py
─────────────────────────────────────────────────────────────────────────────
Расширяемая система оплаты.
Каждый провайдер — отдельный метод. Добавление нового = новый метод.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import settings
from shared.models import (
    Order,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    User,
)
from api.services.order_service import OrderService

logger = logging.getLogger(__name__)


COINGECKO_IDS = {
    "USDT": "tether",
    "TON": "the-open-network",
    "BTC": "bitcoin",
    "ETH": "ethereum",
}

FALLBACK_RATES_RUB = {
    "USDT": Decimal("90"),
    "TON": Decimal("250"),
    "BTC": Decimal("8500000"),
    "ETH": Decimal("250000"),
}


async def _get_crypto_rate_rub(currency: str) -> Decimal:
    """Получает актуальный курс CRYPTO/RUB из CoinGecko."""
    coin_id = COINGECKO_IDS.get(currency)
    fallback = FALLBACK_RATES_RUB.get(currency, Decimal("90"))
    if not coin_id:
        return fallback
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": coin_id, "vs_currencies": "rub"},
            )
            data = response.json()
            rate = Decimal(str(data[coin_id]["rub"]))
            return rate
    except Exception as e:
        logger.warning(
            "Не удалось получить курс %s/RUB, fallback %s: %s", currency, fallback, e
        )
        return fallback


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
        payment = Payment(
            order_id=order.id,
            user_id=user.id,
            method=method,
            status=PaymentStatus.pending,
            amount=order.total_amount,
            currency="RUB",
            idempotency_key=self._make_idempotency_key(order.id, method.value),
        )
        self.db.add(payment)
        await self.db.flush()
        return payment

    # ── 1. Баланс ─────────────────────────────────────────────────────────────

    async def pay_balance(self, order: Order, user: User) -> dict:
        """Моментальная оплата с внутреннего баланса."""
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

    # ── 2. ЮKassa ─────────────────────────────────────────────────────────────

    async def pay_yukassa(self, order: Order, user: User) -> dict:
        """
        Создаёт платёж в ЮKassa и возвращает URL для оплаты.
        Подтверждение придёт через webhook.
        """
        if not settings.YUKASSA_SHOP_ID or not settings.YUKASSA_SECRET_KEY:
            raise ValueError("ЮKassa не настроена")

        payment = await self._create_payment_record(
            order, user, PaymentMethod.card_yukassa
        )

        payload = {
            "amount": {
                "value": f"{order.total_amount:.2f}",
                "currency": "RUB",
            },
            "confirmation": {
                "type": "redirect",
                "return_url": f"{settings.MINIAPP_URL}?order={order.order_number}&status=success",
            },
            "description": f"Заказ {order.order_number} в {settings.SHOP_NAME}",
            "metadata": {
                "order_id": str(order.id),
                "payment_record_id": str(payment.id),
            },
            "capture": True,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.yookassa.ru/v3/payments",
                json=payload,
                auth=(settings.YUKASSA_SHOP_ID, settings.YUKASSA_SECRET_KEY),
                headers={"Idempotence-Key": payment.idempotency_key},
                timeout=10.0,
            )

        data = response.json()
        payment.raw_response = data
        payment.external_id = data.get("id")

        if response.status_code != 200:
            payment.status = PaymentStatus.failed
            raise ValueError(
                f"Ошибка ЮKassa: {data.get('description', 'Unknown error')}"
            )

        confirm_url = data.get("confirmation", {}).get("confirmation_url")

        # Переводим заказ в ожидание оплаты
        await self.order_svc.change_status(
            order,
            OrderStatus.pending_payment,
            changed_by_type="system",
            reason="ЮKassa платёж создан",
        )

        return {
            "success": False,
            "payment_id": str(payment.id),
            "redirect_url": confirm_url,
        }

    # ── 3. CryptoBot (USDT / TON) ─────────────────────────────────────────────

    async def pay_crypto(
        self,
        order: Order,
        user: User,
        currency: str = "USDT",
    ) -> dict:
        """
        Создаёт инвойс через CryptoBot API (t.me/CryptoBot).
        Поддерживает USDT, TON, BTC и другие.
        """
        if not settings.CRYPTOBOT_TOKEN:
            raise ValueError("CryptoBot не настроен")

        payment = await self._create_payment_record(order, user, PaymentMethod.crypto)

        # Конвертируем RUB → crypto с актуальным курсом конкретной монеты
        rate_rub = await _get_crypto_rate_rub(currency)
        crypto_amount = order.total_amount / rate_rub

        base_url = (
            "https://pay.crypt.bot/api"
            if settings.CRYPTOBOT_NETWORK == "mainnet"
            else "https://testnet-pay.crypt.bot/api"
        )

        payload = {
            "asset": currency,
            "amount": str(crypto_amount.quantize(Decimal("0.000001"))),
            "description": f"Заказ {order.order_number} — {settings.SHOP_NAME}",
            "payload": str(order.id),
            "paid_btn_name": "openBot",
            "paid_btn_url": f"https://t.me/{settings.BOT_USERNAME}",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/createInvoice",
                json=payload,
                headers={"Crypto-Pay-API-Token": settings.CRYPTOBOT_TOKEN},
                timeout=10.0,
            )

        data = response.json()
        payment.raw_response = data

        if not data.get("ok"):
            payment.status = PaymentStatus.failed
            raise ValueError(f"Ошибка CryptoBot: {data.get('error', 'Unknown')}")

        invoice = data["result"]
        payment.external_id = str(invoice.get("invoice_id"))

        await self.order_svc.change_status(
            order,
            OrderStatus.pending_payment,
            changed_by_type="system",
            reason=f"{currency} инвойс создан",
        )

        return {
            "success": False,
            "payment_id": str(payment.id),
            "redirect_url": invoice.get("pay_url"),
            "crypto_amount": str(crypto_amount),
            "crypto_currency": currency,
        }

    # ── Webhook обработчик ────────────────────────────────────────────────────

    async def handle_yukassa_webhook(self, payload: dict) -> bool:
        """
        Обработка webhook от ЮKassa.
        Возвращает True если обработано успешно.
        """
        event_type = payload.get("event")
        payment_data = payload.get("object", {})

        external_id = payment_data.get("id")
        if not external_id:
            return False

        # Находим платёж
        result = await self.db.execute(
            select(Payment).where(Payment.external_id == external_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            # Проверяем: возможно, это пополнение баланса (не привязано к заказу)
            meta = payment_data.get("metadata", {})
            if meta.get("type") == "balance_topup" and event_type == "payment.succeeded":
                user_id_str = meta.get("user_id")
                amount_str = meta.get("amount_rub")
                if user_id_str and amount_str:
                    await self._credit_balance_topup(
                        uuid.UUID(user_id_str),
                        Decimal(amount_str),
                        "yukassa",
                        external_id,
                    )
                return True
            return False

        # Идемпотентность — уже обработан
        if payment.status == PaymentStatus.succeeded:
            return True

        payment.raw_response = payload

        if event_type == "payment.succeeded":
            payment.status = PaymentStatus.succeeded
            payment.paid_at = datetime.now(timezone.utc)

            # Переводим заказ в paid
            order_result = await self.db.execute(
                select(Order).where(Order.id == payment.order_id)
            )
            order = order_result.scalar_one_or_none()
            if order and order.status == OrderStatus.pending_payment:
                await self.order_svc.change_status(
                    order,
                    OrderStatus.paid,
                    changed_by_type="system",
                    reason="ЮKassa: payment.succeeded",
                )
                # Уведомляем пользователя через бот
                await self._notify_user_payment_success(order)

        elif event_type == "payment.canceled":
            payment.status = PaymentStatus.cancelled

        return True

    async def handle_cryptobot_webhook(self, payload: dict) -> bool:
        """Обработка webhook от CryptoBot."""
        invoice_id = str(payload.get("invoice_id", ""))
        status = payload.get("status")
        payload_str = payload.get("payload", "")

        # Топап-инвойс: payload начинается с "topup:"
        if str(payload_str).startswith("topup:") and status == "paid":
            parts = str(payload_str).split(":")
            # parts: ["topup", user_id, amount_rub]
            if len(parts) == 3:
                await self._credit_balance_topup(
                    uuid.UUID(parts[1]),
                    Decimal(parts[2]),
                    "cryptobot",
                    str(payload.get("invoice_id", "")),
                )
            return True

        result = await self.db.execute(
            select(Payment).where(Payment.external_id == invoice_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            return False

        if payment.status == PaymentStatus.succeeded:
            return True  # Идемпотентность

        payment.raw_response = payload

        if status == "paid":
            payment.status = PaymentStatus.succeeded
            payment.paid_at = datetime.now(timezone.utc)

            order_result = await self.db.execute(
                select(Order).where(Order.id == payment.order_id)
            )
            order = order_result.scalar_one_or_none()
            if order and order.status == OrderStatus.pending_payment:
                await self.order_svc.change_status(
                    order,
                    OrderStatus.paid,
                    changed_by_type="system",
                    reason="CryptoBot: invoice paid",
                )
                await self._notify_user_payment_success(order)

        return True

    async def topup_yukassa(self, user: User, amount: Decimal) -> dict:
        """Создаёт платёж ЮKassa для пополнения баланса."""
        if not settings.YUKASSA_SHOP_ID or not settings.YUKASSA_SECRET_KEY:
            raise ValueError("ЮKassa не настроена")
        if amount < Decimal("10"):
            raise ValueError("Минимальная сумма пополнения: 10 ₽")

        idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"topup:{user.id}:{amount}:{datetime.now(timezone.utc).date()}"))

        payload = {
            "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
            "confirmation": {
                "type": "redirect",
                "return_url": f"{settings.MINIAPP_URL}?topup=success",
            },
            "description": f"Пополнение баланса — {settings.SHOP_NAME}",
            "metadata": {
                "type": "balance_topup",
                "user_id": str(user.id),
                "amount_rub": f"{amount:.2f}",
            },
            "capture": True,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.yookassa.ru/v3/payments",
                json=payload,
                auth=(settings.YUKASSA_SHOP_ID, settings.YUKASSA_SECRET_KEY),
                headers={"Idempotence-Key": idempotency_key},
                timeout=10.0,
            )

        data = response.json()
        if response.status_code != 200:
            raise ValueError(f"Ошибка ЮKassa: {data.get('description', 'Unknown error')}")

        confirm_url = data.get("confirmation", {}).get("confirmation_url")
        return {"redirect_url": confirm_url, "payment_id": data.get("id")}

    async def topup_crypto(self, user: User, amount_rub: Decimal, currency: str = "USDT") -> dict:
        """Создаёт инвойс CryptoBot для пополнения баланса."""
        if not settings.CRYPTOBOT_TOKEN:
            raise ValueError("CryptoBot не настроен")
        if amount_rub < Decimal("10"):
            raise ValueError("Минимальная сумма пополнения: 10 ₽")

        rate_rub = await _get_crypto_rate_rub(currency)
        crypto_amount = amount_rub / rate_rub

        base_url = (
            "https://pay.crypt.bot/api"
            if settings.CRYPTOBOT_NETWORK == "mainnet"
            else "https://testnet-pay.crypt.bot/api"
        )

        topup_payload = f"topup:{user.id}:{amount_rub:.2f}"

        payload = {
            "asset": currency,
            "amount": str(crypto_amount.quantize(Decimal("0.000001"))),
            "description": f"Пополнение баланса — {settings.SHOP_NAME}",
            "payload": topup_payload,
            "paid_btn_name": "openBot",
            "paid_btn_url": f"https://t.me/{settings.BOT_USERNAME}",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/createInvoice",
                json=payload,
                headers={"Crypto-Pay-API-Token": settings.CRYPTOBOT_TOKEN},
                timeout=10.0,
            )

        data = response.json()
        if not data.get("ok"):
            raise ValueError(f"Ошибка CryptoBot: {data.get('error', 'Unknown')}")

        invoice = data["result"]
        return {
            "pay_url": invoice.get("pay_url") or invoice.get("bot_invoice_url"),
            "invoice_id": invoice.get("invoice_id"),
        }

    async def _credit_balance_topup(
        self,
        user_id: uuid.UUID,
        amount: Decimal,
        provider: str,
        external_id: str,
    ) -> None:
        """Зачисляет пополнение баланса пользователю."""
        from shared.models import BalanceTransaction
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
        ))
        logger.info("Balance topup: user %s +%s RUB via %s (%s)", user_id, amount, provider, external_id)

    async def _notify_user_payment_success(self, order: Order) -> None:
        """Отправляет уведомление пользователю через aiogram Bot и добавляет системное сообщение в чат."""
        from sqlalchemy.orm import selectinload
        from bot.utils.texts import texts

        # Загружаем связь с пользователем один раз
        telegram_id: int | None = None
        try:
            result = await self.db.execute(
                select(Order)
                .options(selectinload(Order.user))
                .where(Order.id == order.id)
            )
            order_with_user = result.scalar_one()
            telegram_id = order_with_user.user.telegram_id
        except Exception as exc:
            logger.warning("Не удалось загрузить пользователя заказа: %s", exc)

        # Telegram уведомление
        if telegram_id is not None:
            try:
                from api.bot_instance import get_bot
                bot = get_bot()
                await bot.send_message(telegram_id, texts.order_paid(order.order_number), parse_mode="HTML")
            except Exception as exc:
                logger.warning("Не удалось отправить уведомление об оплате: %s", exc)

        # Системное сообщение в чат
        if telegram_id is not None:
            try:
                from api.services.chat_service import ChatService
                chat_svc = ChatService(self.db)
                await chat_svc.add_system_message(telegram_id, texts.chat_order_paid(order.order_number, float(order.total_amount)))
            except Exception as exc:
                logger.warning("Не удалось добавить системное сообщение в чат: %s", exc)
