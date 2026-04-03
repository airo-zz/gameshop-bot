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


async def _get_usdt_rate() -> Decimal:
    """Получает актуальный курс USDT/RUB из CoinGecko. При недоступности — fallback 90."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": "tether", "vs_currencies": "rub"},
            )
            data = response.json()
            rate = Decimal(str(data["tether"]["rub"]))
            return rate
    except Exception as e:
        logger.warning(
            "Не удалось получить курс USDT/RUB, используем fallback 90: %s", e
        )
        return Decimal("90")


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
            await self.order_svc.pay_with_balance(order, user)
            payment.status = PaymentStatus.succeeded
            payment.paid_at = datetime.now(timezone.utc)
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

        method = PaymentMethod.usdt if currency == "USDT" else PaymentMethod.ton
        payment = await self._create_payment_record(order, user, method)

        # Конвертируем RUB → crypto с актуальным курсом из CoinGecko (fallback 90)
        rate_rub_per_usdt = await _get_usdt_rate()
        crypto_amount = order.total_amount / rate_rub_per_usdt

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
            "paid_btn_url": f"https://t.me/{settings.SHOP_SUPPORT_USERNAME}",
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

    async def _notify_user_payment_success(self, order: Order) -> None:
        """Отправляет уведомление пользователю через aiogram Bot."""
        try:
            from aiogram import Bot
            from sqlalchemy.orm import selectinload
            from bot.utils.texts import texts

            result = await self.db.execute(
                select(Order)
                .options(selectinload(Order.user))
                .where(Order.id == order.id)
            )
            order_with_user = result.scalar_one()
            telegram_id = order_with_user.user.telegram_id
            text = texts.order_paid(order.order_number)

            bot = Bot(token=settings.BOT_TOKEN)
            try:
                await bot.send_message(telegram_id, text, parse_mode="HTML")
            finally:
                await bot.session.close()
        except Exception as exc:
            logger.warning("Не удалось отправить уведомление об оплате: %s", exc)
            # Уведомление не критично — не прерываем основной flow
