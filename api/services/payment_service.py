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


# Platega paymentMethod-коды по нашему PaymentMethod.value.
# 2 = СБП QR + Sberpay, 11 = эквайринг карт, 13 = криптовалюта.
PLATEGA_METHOD_CODES: dict[str, int] = {
    "sbp": 2,
    "card": 11,
    "crypto": 13,
}


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
                "return_url": f"{settings.MINIAPP_URL.rstrip('/')}/orders/{order.id}?success=1",
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

    # ── 3. Platega (СБП / карта / крипта) ─────────────────────────────────────

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
    ) -> dict:
        """
        Создаёт транзакцию в Platega (POST /transaction/process) и возвращает
        ссылку на оплату. Подтверждение приходит через webhook (status=CONFIRMED).
        method_value — 'sbp' | 'card' | 'crypto'.
        """
        if not settings.PLATEGA_MERCHANT_ID or not settings.PLATEGA_SECRET:
            raise ValueError("Platega не настроена")
        code = PLATEGA_METHOD_CODES.get(method_value)
        if code is None:
            raise ValueError("Неподдерживаемый метод Platega")

        payment = await self._create_payment_record(
            order, user, PaymentMethod(method_value)
        )

        miniapp = settings.MINIAPP_URL.rstrip("/")
        payload = {
            "amount": float(order.total_amount),
            "currency": "RUB",
            "paymentMethod": code,
            "description": f"Заказ {order.order_number} — {settings.SHOP_NAME}",
            "returnUrl": f"{miniapp}/orders/{order.id}?success=1",
            "failedUrl": f"{miniapp}/orders/{order.id}",
            "payload": {
                "order_id": str(order.id),
                "payment_record_id": str(payment.id),
            },
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
        payment.external_id = str(data.get("id") or "")

        redirect = data.get("redirect")
        if response.status_code not in (200, 201) or not redirect:
            payment.status = PaymentStatus.failed
            reason = data.get("message") or data.get("error") or f"HTTP {response.status_code}"
            raise ValueError(f"Ошибка Platega: {reason}")

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

    async def handle_platega_webhook(self, payload: dict) -> bool:
        """
        Обработка webhook от Platega.
        Тело: {Id, amount, currency, status, paymentMethod, payload}.
        status ∈ CONFIRMED | CANCELED | PENDING | CHARGEBACKED.
        """
        external_id = str(payload.get("Id") or payload.get("id") or "")
        status = payload.get("status")
        meta = payload.get("payload") or {}
        if not external_id:
            return False

        # Пополнение баланса — транзакция не привязана к заказу (эхо payload).
        if isinstance(meta, dict) and meta.get("type") == "balance_topup":
            if status == "CONFIRMED":
                user_id_str = meta.get("user_id")
                amount_str = meta.get("amount_rub")
                if user_id_str and amount_str:
                    await self._credit_balance_topup(
                        uuid.UUID(user_id_str),
                        Decimal(amount_str),
                        "platega",
                        external_id,
                    )
            return True

        result = await self.db.execute(
            select(Payment).where(Payment.external_id == external_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            return False

        if payment.status == PaymentStatus.succeeded:
            return True  # Идемпотентность

        payment.raw_response = payload

        if status == "CONFIRMED":
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
                    reason="Platega: CONFIRMED",
                )
                await self._notify_user_payment_success(order)

        elif status in ("CANCELED", "CHARGEBACKED"):
            payment.status = PaymentStatus.cancelled

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

    async def topup_platega(
        self, user: User, amount_rub: Decimal, method_value: str = "card"
    ) -> dict:
        """Создаёт транзакцию Platega для пополнения баланса.

        Зачисление — в handle_platega_webhook по payload.type == 'balance_topup'.
        Payment-строка не создаётся (как и в topup_yukassa); идемпотентность
        зачисления обеспечивает _credit_balance_topup по (provider, external_id).
        """
        if not settings.PLATEGA_MERCHANT_ID or not settings.PLATEGA_SECRET:
            raise ValueError("Platega не настроена")
        code = PLATEGA_METHOD_CODES.get(method_value)
        if code is None:
            raise ValueError("Неподдерживаемый метод Platega")
        if amount_rub < Decimal("10"):
            raise ValueError("Минимальная сумма пополнения: 10 ₽")

        miniapp = settings.MINIAPP_URL.rstrip("/")
        payload = {
            "amount": float(amount_rub),
            "currency": "RUB",
            "paymentMethod": code,
            "description": f"Пополнение баланса — {settings.SHOP_NAME}",
            "returnUrl": f"{miniapp}?topup=success",
            "failedUrl": f"{miniapp}?topup=failed",
            "payload": {
                "type": "balance_topup",
                "user_id": str(user.id),
                "amount_rub": f"{amount_rub:.2f}",
            },
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.PLATEGA_BASE_URL.rstrip('/')}/transaction/process",
                json=payload,
                headers=await self._platega_headers(),
                timeout=15.0,
            )

        data = response.json() if response.content else {}
        redirect = data.get("redirect")
        if response.status_code not in (200, 201) or not redirect:
            reason = data.get("message") or data.get("error") or f"HTTP {response.status_code}"
            raise ValueError(f"Ошибка Platega: {reason}")

        return {"redirect_url": redirect, "payment_id": data.get("id")}

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
        с тем же external_id ничего не делает. Защита от ретраев webhook'а
        ЮKassa/CryptoBot.
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
