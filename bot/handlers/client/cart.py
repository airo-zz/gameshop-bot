"""
bot/handlers/client/cart.py
─────────────────────────────────────────────────────────────────────────────
Корзина клиента: просмотр, очистка, переход к оформлению.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

import uuid
from decimal import Decimal

from shared.models import Cart, CartItem, User, Product, ProductLot
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit

router = Router(name="client:cart")


def _cart_keyboard(has_items: bool) -> InlineKeyboardMarkup:
    buttons = []
    if has_items:
        buttons.append(
            [
                InlineKeyboardButton(
                    text="🗑 Очистить корзину", callback_data="cart:clear"
                )
            ]
        )
        buttons.append(
            [
                InlineKeyboardButton(
                    text="🎮 Каталог", callback_data="catalog:main"
                )
            ]
        )
    else:
        buttons.append(
            [
                InlineKeyboardButton(
                    text="🎮 Перейти в каталог", callback_data="catalog:main"
                )
            ]
        )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def _get_cart(user: User, db: AsyncSession) -> Cart | None:
    result = await db.execute(
        select(Cart)
        .options(selectinload(Cart.items).selectinload(CartItem.product))
        .where(Cart.user_id == user.id)
    )
    return result.scalar_one_or_none()


async def _show_cart(
    event: Message | CallbackQuery,
    user: User,
    db: AsyncSession,
) -> None:
    cart = await _get_cart(user, db)

    if not cart or cart.is_empty:
        text = texts.cart_empty
        keyboard = _cart_keyboard(has_items=False)
    else:
        lines = [f"🛒 <b>Корзина</b> ({cart.items_count} поз.)\n━━━━━━━━━━━━━━━"]
        for item in cart.items:
            product_name = item.product.name if item.product else str(item.product_id)
            lines.append(
                f"• <b>{product_name}</b> × {item.quantity} — "
                f"{float(item.subtotal):.0f} ₽"
            )
        total = float(cart.total)
        lines.append(f"\n<b>Итого: {total:.0f} ₽</b>")
        text = "\n".join(lines)
        keyboard = _cart_keyboard(has_items=True)

    if isinstance(event, CallbackQuery):
        await safe_edit(event.message, text, reply_markup=keyboard)
        await event.answer()
    else:
        await event.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.message(Command("cart"))
@router.message(F.text == "🛒 Корзина")
async def cmd_cart(message: Message, user: User, db: AsyncSession) -> None:
    await _show_cart(message, user, db)


@router.callback_query(F.data == "cart:view")
async def cb_cart_view(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    await _show_cart(call, user, db)


@router.callback_query(F.data.startswith("cart:add:"))
async def cb_cart_add(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    parts = call.data.split(":")
    # Формат: cart:add:{product_id} или cart:add:{product_id}:{lot_id}
    try:
        product_id = uuid.UUID(parts[2])
        lot_id = uuid.UUID(parts[3]) if len(parts) > 3 else None
    except (IndexError, ValueError):
        await call.answer("Ошибка: некорректные данные товара", show_alert=True)
        return

    product = await db.get(Product, product_id)
    if not product or not product.is_active:
        await call.answer("❌ Товар недоступен", show_alert=True)
        return

    lot: ProductLot | None = None
    if lot_id:
        lot = await db.get(ProductLot, lot_id)
        if not lot or not lot.is_active:
            await call.answer("❌ Вариант товара недоступен", show_alert=True)
            return

    price = Decimal(str(lot.price if lot else product.price))

    # Получаем или создаём корзину
    result = await db.execute(select(Cart).where(Cart.user_id == user.id))
    cart = result.scalar_one_or_none()
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        await db.flush()

    # Проверяем, есть ли уже такой товар+лот в корзине
    existing_result = await db.execute(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.product_id == product_id,
            CartItem.lot_id == lot_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.quantity += 1
        existing.price_snapshot = price
    else:
        item = CartItem(
            cart_id=cart.id,
            product_id=product_id,
            lot_id=lot_id,
            quantity=1,
            price_snapshot=price,
            input_data={},
        )
        db.add(item)

    await db.commit()

    lot_name = f" ({lot.name})" if lot else ""
    await call.answer(f"✅ {product.name}{lot_name} добавлен в корзину!")


@router.callback_query(F.data == "cart:clear")
async def cb_cart_clear(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    cart = await _get_cart(user, db)
    if cart and not cart.is_empty:
        for item in cart.items:
            await db.delete(item)
        cart.promo_code_id = None
        await db.commit()
        await call.answer("🗑 Корзина очищена")
    else:
        await call.answer("Корзина уже пуста")

    await _show_cart(call, user, db)
