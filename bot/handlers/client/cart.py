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

from shared.models import Cart, CartItem, User
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
