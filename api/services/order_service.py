"""
api/services/order_service.py
─────────────────────────────────────────────────────────────────────────────
Бизнес-логика заказов:
  - Создание из корзины
  - Смена статуса (с валидацией конечного автомата)
  - Автоматическая выдача ключей
  - Обновление счётчиков пользователя
  - Начисление кэшбека
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.models import (
    BalanceTransaction, Cart, CartItem, Order, OrderDiscountLog,
    OrderItem, OrderStatus, OrderStatusHistory, PaymentMethod,
    Product, ProductKey, User,
)
from shared.models.order import ALLOWED_STATUS_TRANSITIONS
from api.services.discount_service import DiscountService, DiscountResult


class OrderService:

    def __init__(self, db: AsyncSession):
        self.db = db
        self.discount_svc = DiscountService(db)

    # ── Создание заказа ───────────────────────────────────────────────────────

    async def create_from_cart(
        self,
        user: User,
        cart: Cart,
        payment_method: str,
        promo_code_str: str | None = None,
    ) -> Order:
        """
        Создаёт заказ из корзины.
        1. Проверяет наличие товаров
        2. Рассчитывает скидки
        3. Создаёт Order + OrderItems
        4. Очищает корзину
        """
        if cart.is_empty:
            raise ValueError("Корзина пуста")

        # Загружаем товары с лотами
        items_with_products = await self._load_cart_items(cart)

        # Проверяем наличие
        for item, product in items_with_products:
            if product.stock is not None and product.stock < item.quantity:
                raise ValueError(f"Товар '{product.name}' недоступен в нужном количестве")

        # Считаем скидки
        discount_result = await self.discount_svc.calculate_cart_discounts(
            user, cart, promo_code_str
        )

        subtotal = cart.total
        total = max(Decimal("0"), subtotal - discount_result.total_discount)

        # Создаём заказ
        order = Order(
            order_number="",  # Генерирует триггер БД
            user_id=user.id,
            status=OrderStatus.new,
            subtotal=subtotal,
            discount_amount=discount_result.total_discount,
            total_amount=total,
            payment_method=PaymentMethod(payment_method),
            promo_code_id=(
                discount_result.promo_code.id
                if discount_result.promo_code else None
            ),
        )
        self.db.add(order)
        await self.db.flush()  # Получаем order.id и order.order_number от триггера

        # Создаём позиции заказа
        for item, product in items_with_products:
            lot_name = None
            if item.lot_id:
                lot = next((l for l in product.lots if l.id == item.lot_id), None)
                lot_name = lot.name if lot else None

            order_item = OrderItem(
                order_id=order.id,
                product_id=product.id,
                lot_id=item.lot_id,
                product_name=product.name,
                lot_name=lot_name,
                quantity=item.quantity,
                unit_price=item.price_snapshot,
                total_price=item.price_snapshot * item.quantity,
                input_data=item.input_data,
            )
            self.db.add(order_item)

            # Резервируем ключи для auto-выдачи
            if product.delivery_type.value in ("auto", "mixed"):
                await self._reserve_keys(product.id, item.lot_id, item.quantity)

        # Фиксируем скидки в лог
        for applied in discount_result.applied:
            self.db.add(OrderDiscountLog(
                order_id=order.id,
                discount_rule_id=applied.rule.id,
                applied_value=applied.amount,
                reason=applied.reason,
            ))

        # Записываем использование промокода
        if discount_result.promo_code:
            await self.discount_svc.record_promo_usage(
                discount_result.promo_code.id, user.id, order.id
            )

        # Пишем историю статусов
        self.db.add(OrderStatusHistory(
            order_id=order.id,
            from_status=None,
            to_status=OrderStatus.new,
            changed_by_type="system",
        ))

        # Очищаем корзину
        for item, _ in items_with_products:
            await self.db.delete(item)

        return order

    # ── Смена статуса ─────────────────────────────────────────────────────────

    async def change_status(
        self,
        order: Order,
        new_status: OrderStatus,
        changed_by_id: uuid.UUID | None = None,
        changed_by_type: str = "system",
        reason: str | None = None,
    ) -> Order:
        """Меняет статус заказа с валидацией конечного автомата."""
        if not order.can_transition_to(new_status):
            raise ValueError(
                f"Нельзя перейти из {order.status.value} в {new_status.value}"
            )

        old_status = order.status
        order.status = new_status
        now = datetime.now(timezone.utc)

        if new_status == OrderStatus.paid:
            order.paid_at = now
            # Запускаем выдачу для авто-товаров
            await self._auto_deliver(order)

        elif new_status == OrderStatus.processing:
            order.processing_started_at = now

        elif new_status == OrderStatus.completed:
            order.completed_at = now
            await self._update_user_stats(order)
            await self._apply_cashback(order)
            delivery_text = ""
            items_result = await self.db.execute(
                select(OrderItem).where(OrderItem.order_id == order.id)
            )
            for item in items_result.scalars().all():
                if item.delivery_data:
                    keys = item.delivery_data.get("keys", [])
                    if keys:
                        delivery_text = "\n".join(str(k) for k in keys)
                        break
            from bot.utils.texts import texts as _texts
            await self._notify_user(order, _texts.order_completed(order.order_number, delivery_text))

        elif new_status == OrderStatus.cancelled:
            order.cancelled_at = now
            await self._release_reserved_keys(order)
            from bot.utils.texts import texts as _texts
            await self._notify_user(order, _texts.order_cancelled(order.order_number))

        # Пишем историю
        self.db.add(OrderStatusHistory(
            order_id=order.id,
            from_status=old_status,
            to_status=new_status,
            changed_by_id=changed_by_id,
            changed_by_type=changed_by_type,
            reason=reason,
        ))

        return order

    # ── Оплата балансом ───────────────────────────────────────────────────────

    async def pay_with_balance(self, order: Order, user: User) -> Order:
        """Списывает с внутреннего баланса и переводит в paid.

        Блокирует строку User через SELECT FOR UPDATE, чтобы параллельные
        запросы не могли одновременно пройти проверку баланса (double-spend).
        """
        # Перечитываем user с блокировкой строки — гарантирует актуальный баланс
        locked_result = await self.db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )
        user = locked_result.scalar_one()

        if user.balance < order.total_amount:
            raise ValueError(
                f"Недостаточно средств. Баланс: {user.balance:.2f} ₽, "
                f"нужно: {order.total_amount:.2f} ₽"
            )

        balance_before = user.balance
        user.balance -= order.total_amount

        # Лог транзакции
        self.db.add(BalanceTransaction(
            user_id=user.id,
            amount=-order.total_amount,
            balance_before=balance_before,
            balance_after=user.balance,
            type="order_payment",
            description=f"Оплата заказа {order.order_number}",
            reference_id=order.id,
        ))

        return await self.change_status(
            order, OrderStatus.paid,
            changed_by_type="system",
            reason="Оплата внутренним балансом",
        )

    # ── Автовыдача ────────────────────────────────────────────────────────────

    async def _auto_deliver(self, order: Order) -> None:
        """Выдаёт ключи для товаров с delivery_type=auto."""
        result = await self.db.execute(
            select(OrderItem)
            .options(selectinload(OrderItem.product))
            .where(OrderItem.order_id == order.id)
        )
        items = result.scalars().all()

        # Фильтруем позиции с авто-выдачей
        auto_items = [
            item for item in items
            if item.product.delivery_type.value in ("auto", "mixed")
        ]

        # Для каждого auto-item ищем зарезервированные ключи по product_id/lot_id.
        # Ключи резервируются в _reserve_keys без order_item_id (он неизвестен до flush),
        # поэтому фильтруем по product_id + lot_id + is_used=True + order_item_id IS NULL.
        keys_by_item: dict[uuid.UUID, list[ProductKey]] = defaultdict(list)
        for item in auto_items:
            keys_result = await self.db.execute(
                select(ProductKey)
                .where(
                    ProductKey.product_id == item.product_id,
                    ProductKey.lot_id == item.lot_id,
                    ProductKey.is_used == True,
                    ProductKey.order_item_id.is_(None),
                )
                .limit(item.quantity)
                .with_for_update(skip_locked=True)
            )
            keys_by_item[item.id] = list(keys_result.scalars().all())

        all_delivered = True
        for item in items:
            if item.product.delivery_type.value not in ("auto", "mixed"):
                all_delivered = False
                continue

            keys = keys_by_item[item.id]

            if len(keys) >= item.quantity:
                # Привязываем ключи к позиции заказа и расшифровываем для выдачи
                from api.services.crypto_service import decrypt_key
                decrypted_keys = []
                for k in keys[: item.quantity]:
                    k.order_item_id = item.id
                    decrypted_keys.append(decrypt_key(k.key_value))
                item.delivery_data = {"keys": decrypted_keys}
                item.delivered_at = datetime.now(timezone.utc)
            else:
                all_delivered = False  # Ключей не хватает — нужна ручная выдача

        # Если все позиции доставлены — завершаем заказ
        if all_delivered:
            await self.change_status(
                order, OrderStatus.completed, changed_by_type="system",
                reason="Автоматическая выдача"
            )
        else:
            await self.change_status(
                order, OrderStatus.processing, changed_by_type="system",
                reason="Частичная/ручная выдача"
            )

    async def _reserve_keys(
        self,
        product_id: uuid.UUID,
        lot_id: uuid.UUID | None,
        quantity: int,
    ) -> None:
        """Резервирует ключи (помечает как used без order_item_id пока нет order_item).

        Выбрасывает ValueError если свободных ключей меньше чем нужно.
        """
        result = await self.db.execute(
            select(ProductKey)
            .where(
                ProductKey.product_id == product_id,
                ProductKey.lot_id == lot_id,
                ProductKey.is_used == False,
            )
            .limit(quantity)
            .with_for_update(skip_locked=True)
        )
        keys = result.scalars().all()
        if len(keys) < quantity:
            raise ValueError(
                f"Недостаточно ключей для выдачи: нужно {quantity}, доступно {len(keys)}"
            )
        for key in keys:
            key.is_used = True
            key.used_at = datetime.now(timezone.utc)

    async def _release_reserved_keys(self, order: Order) -> None:
        """Освобождает зарезервированные ключи при отмене заказа."""
        result = await self.db.execute(
            select(ProductKey).where(
                ProductKey.order_item_id.in_(
                    select(OrderItem.id).where(OrderItem.order_id == order.id)
                )
            )
        )
        for key in result.scalars().all():
            key.is_used = False
            key.used_at = None
            key.order_item_id = None

    # ── Статистика и кэшбек ───────────────────────────────────────────────────

    async def _update_user_stats(self, order: Order) -> None:
        """Обновляет total_spent, orders_count и уровень лояльности."""
        result = await self.db.execute(select(User).where(User.id == order.user_id))
        user = result.scalar_one()
        user.total_spent += order.total_amount
        user.orders_count += 1

        # Пересчёт уровня лояльности
        await self._recalculate_loyalty(user)

    async def _recalculate_loyalty(self, user: User) -> None:
        from shared.models import LoyaltyLevel
        result = await self.db.execute(
            select(LoyaltyLevel)
            .where(
                LoyaltyLevel.is_active == True,
                LoyaltyLevel.min_spent <= user.total_spent,
                LoyaltyLevel.min_orders <= user.orders_count,
            )
            .order_by(LoyaltyLevel.priority.desc())
            .limit(1)
        )
        new_level = result.scalar_one_or_none()
        if new_level and new_level.id != user.loyalty_level_id:
            user.loyalty_level_id = new_level.id

    async def _apply_cashback(self, order: Order) -> None:
        """Начисляет кэшбек на баланс согласно уровню лояльности."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.loyalty_level))
            .where(User.id == order.user_id)
        )
        user = result.scalar_one()
        if not user.loyalty_level or user.loyalty_level.cashback_percent <= 0:
            return

        cashback = order.total_amount * user.loyalty_level.cashback_percent / 100
        if cashback <= 0:
            return

        balance_before = user.balance
        user.balance += cashback
        self.db.add(BalanceTransaction(
            user_id=user.id,
            amount=cashback,
            balance_before=balance_before,
            balance_after=user.balance,
            type="cashback",
            description=f"Кэшбек {user.loyalty_level.cashback_percent}% за заказ {order.order_number}",
            reference_id=order.id,
        ))

    async def _notify_user(self, order: Order, text: str) -> None:
        """Отправляет уведомление пользователю через бота. Не критично — не прерывает flow."""
        try:
            from aiogram import Bot
            from shared.config import settings
            from sqlalchemy.orm import selectinload as _sil

            result = await self.db.execute(
                select(Order)
                .options(_sil(Order.user))
                .where(Order.id == order.id)
            )
            order_with_user = result.scalar_one_or_none()
            if not order_with_user:
                return

            telegram_id = order_with_user.user.telegram_id
            bot = Bot(token=settings.BOT_TOKEN)
            try:
                await bot.send_message(telegram_id, text, parse_mode="HTML")
            finally:
                await bot.session.close()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Не удалось отправить уведомление: %s", exc)

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _load_cart_items(
        self, cart: Cart
    ) -> list[tuple[CartItem, Product]]:
        result = await self.db.execute(
            select(CartItem)
            .options(selectinload(CartItem.product).selectinload(Product.lots))
            .where(CartItem.cart_id == cart.id)
        )
        items = result.scalars().all()
        return [(item, item.product) for item in items]

    async def get_user_orders(
        self,
        user_id: uuid.UUID,
        page: int = 0,
        page_size: int = 20,
    ) -> list[Order]:
        result = await self.db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
            .offset(page * page_size)
            .limit(page_size)
        )
        return result.scalars().all()
