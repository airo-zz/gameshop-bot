"""
api/services/cart_service.py — управление корзиной
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.config import settings
from shared.models import Cart, CartItem, Product, User


class CartService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_cart(self, user: User) -> Cart:
        """Возвращает корзину пользователя или создаёт новую."""
        cart = await self._load_cart(user.id)

        if cart is None:
            cart = Cart(
                user_id=user.id,
                expires_at=datetime.now(timezone.utc)
                + timedelta(hours=settings.CART_PRICE_RESERVE_HOURS),
            )
            self.db.add(cart)
            await self.db.flush()
            # После flush загружаем объект через тот же запрос с selectinload,
            # чтобы cart.items была eagerly-loaded коллекцией, а не lazy-атрибутом.
            # Без этого любое обращение к cart.items в async-контексте
            # вызывает MissingGreenlet.
            cart = await self._load_cart(user.id)

        return cart

    async def _load_cart(self, user_id: uuid.UUID) -> Cart | None:
        """Загружает корзину со всеми нужными relationship через selectinload.

        populate_existing=True нужен потому что session_factory использует
        expire_on_commit=False — без этого SQLAlchemy возвращает стale-объект
        из identity map после commit вместо свежих данных из БД.
        """
        result = await self.db.execute(
            select(Cart)
            .options(
                selectinload(Cart.items)
                .selectinload(CartItem.product)
                .selectinload(Product.lots)
            )
            .where(Cart.user_id == user_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def add_item(
        self,
        cart: Cart,
        product_id: uuid.UUID,
        lot_id: uuid.UUID | None,
        quantity: int,
        input_data: dict,
    ) -> CartItem:
        """Добавляет товар в корзину (или увеличивает количество)."""
        # Проверяем товар
        result = await self.db.execute(
            select(Product)
            .options(selectinload(Product.lots))
            .where(Product.id == product_id, Product.is_active == True)
        )
        product = result.scalar_one_or_none()
        if not product:
            raise ValueError("Товар не найден или недоступен")

        # Определяем цену
        price = product.price
        if lot_id:
            lot = next((l for l in product.lots if l.id == lot_id), None)
            if not lot:
                raise ValueError("Лот не найден")
            price = lot.price

        # Проверяем наличие
        if product.stock is not None and product.stock < quantity:
            raise ValueError("Недостаточно товара в наличии")

        # Ищем существующую позицию
        existing = next(
            (
                item
                for item in cart.items
                if item.product_id == product_id and item.lot_id == lot_id
            ),
            None,
        )

        if existing:
            existing.quantity += quantity
            existing.input_data = input_data  # Обновляем данные
            self._extend_cart_expiry(cart)
            return existing

        item = CartItem(
            cart_id=cart.id,
            product_id=product_id,
            lot_id=lot_id,
            quantity=quantity,
            price_snapshot=price,
            input_data=input_data,
        )
        self.db.add(item)
        await self.db.flush()  # Получаем item.id сразу, не ждём commit
        self._extend_cart_expiry(cart)
        return item

    async def update_item(
        self,
        cart: Cart,
        item_id: uuid.UUID,
        quantity: int,
    ) -> CartItem | None:
        """
        Обновляет количество позиции.
        quantity=0 — удаляет позицию.
        """
        item = next((i for i in cart.items if i.id == item_id), None)
        if not item:
            raise ValueError("Позиция не найдена в корзине")

        if quantity == 0:
            await self.db.delete(item)
            return None

        item.quantity = quantity
        self._extend_cart_expiry(cart)
        return item

    async def clear_cart(self, cart: Cart) -> None:
        """Полностью очищает корзину."""
        for item in cart.items:
            await self.db.delete(item)
        cart.promo_code_id = None

    async def apply_promo(self, cart: Cart, user: User, code: str) -> dict:
        """Применяет промокод к корзине."""
        from api.services.discount_service import DiscountService

        svc = DiscountService(self.db)
        result = await svc.validate_promo_code(code, user.id, cart.total)

        if not result["valid"]:
            return result

        # Ищем промокод
        from shared.models import PromoCode

        promo_result = await self.db.execute(
            select(PromoCode).where(PromoCode.code == code.upper())
        )
        promo = promo_result.scalar_one_or_none()
        if promo:
            cart.promo_code_id = promo.id

        return result

    async def get_cart_summary(self, cart: Cart, user: User) -> dict:
        """Считает итоги корзины с учётом скидок."""
        from api.services.discount_service import DiscountService

        subtotal = cart.total
        promo_code_str = None
        if cart.promo_code_id:
            from shared.models import PromoCode

            promo_result = await self.db.execute(
                select(PromoCode).where(PromoCode.id == cart.promo_code_id)
            )
            promo = promo_result.scalar_one_or_none()
            promo_code_str = promo.code if promo else None

        discount_result = await DiscountService(self.db).calculate_cart_discounts(
            user, cart, promo_code_str
        )

        return {
            "subtotal": subtotal,
            "discount_amount": discount_result.total_discount,
            "total": max(Decimal("0"), subtotal - discount_result.total_discount),
            "promo_code": promo_code_str,
            "applied_discounts": [
                {"name": a.rule.name, "amount": a.amount, "reason": a.reason}
                for a in discount_result.applied
            ],
        }

    def _extend_cart_expiry(self, cart: Cart) -> None:
        """Продлевает резервирование цены при изменении корзины."""
        cart.expires_at = datetime.now(timezone.utc) + timedelta(
            hours=settings.CART_PRICE_RESERVE_HOURS
        )
