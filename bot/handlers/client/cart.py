"""
bot/handlers/client/cart.py
─────────────────────────────────────────────────────────────────────────────
Корзина клиента: просмотр, управление количеством, промокод, переход к оплате.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from api.services.cart_service import CartService
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit

router = Router(name="client:cart")


class PromoCodeFSM(StatesGroup):
    waiting_code = State()


# ── Клавиатура корзины ────────────────────────────────────────────────────────

def _cart_keyboard(items: list, has_promo: bool = False) -> InlineKeyboardMarkup:
    """
    Строит клавиатуру корзины.
    Для каждой позиции: [• Название ×qty | ➖ | ➕]
    Затем: Промокод, Оформить, Очистить.
    """
    buttons = []

    for item in items:
        product_name = item.product.name if item.product else "Товар"
        # Обрезаем длинные названия — callback_data ограничена 64 байтами
        item_id_short = str(item.id)[:8]
        name_display = product_name[:20] + "…" if len(product_name) > 20 else product_name
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"• {name_display} ×{item.quantity}",
                    callback_data=f"cart:item:{item_id_short}",
                ),
                InlineKeyboardButton(
                    text="➖",
                    callback_data=f"cart:qty:{item_id_short}:dec",
                ),
                InlineKeyboardButton(
                    text="➕",
                    callback_data=f"cart:qty:{item_id_short}:inc",
                ),
            ]
        )

    # Промокод
    promo_text = "🏷 Промокод ✅" if has_promo else "🏷 Промокод"
    buttons.append(
        [InlineKeyboardButton(text=promo_text, callback_data="cart:promo")]
    )

    # Оформить
    buttons.append(
        [InlineKeyboardButton(text="✅ Оформить заказ", callback_data="checkout:start")]
    )

    # Очистить
    buttons.append(
        [InlineKeyboardButton(text="🗑 Очистить", callback_data="cart:clear")]
    )

    buttons.append(
        [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main")]
    )

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _empty_cart_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🎮 Перейти в каталог", callback_data="catalog:main")]
        ]
    )


def _promo_cancel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отмена", callback_data="cart:promo:cancel")]
        ]
    )


# ── Построение текста корзины ─────────────────────────────────────────────────

async def _build_cart_text(cart, summary: dict) -> str:
    """Формирует текст корзины с позициями и итогами."""
    items_count = len(cart.items)
    lines = [f"🛒 <b>Корзина</b> ({items_count} поз.)\n━━━━━━━━━━━━━━━"]

    for item in cart.items:
        product_name = item.product.name if item.product else "Товар"
        # Ищем название лота из уже загруженных лотов продукта
        lot_suffix = ""
        if item.lot_id and item.product and hasattr(item.product, "lots"):
            matching_lot = next(
                (lot for lot in item.product.lots if lot.id == item.lot_id), None
            )
            if matching_lot:
                lot_suffix = f" ({matching_lot.name})"
        subtotal = float(item.price_snapshot) * item.quantity
        lines.append(
            f"• <b>{product_name}{lot_suffix}</b> ×{item.quantity} — {subtotal:.0f} ₽"
        )

    lines.append("━━━━━━━━━━━━━━━")

    discount = float(summary.get("discount_amount", 0))
    if discount > 0:
        promo_name = summary.get("promo_code", "")
        promo_label = f" ({promo_name})" if promo_name else ""
        lines.append(f"💸 Скидка{promo_label}: <b>-{discount:.0f} ₽</b>")

    total = float(summary.get("total", 0))
    lines.append(f"<b>Итого: {total:.0f} ₽</b>")

    return "\n".join(lines)


# ── Показ корзины ─────────────────────────────────────────────────────────────

async def _show_cart(
    event: Message | CallbackQuery,
    user: User,
    db: AsyncSession,
) -> None:
    cart_svc = CartService(db)
    cart = await cart_svc.get_or_create_cart(user)

    if cart.is_empty:
        text = texts.cart_empty
        keyboard = _empty_cart_keyboard()
    else:
        summary = await cart_svc.get_cart_summary(cart, user)
        text = await _build_cart_text(cart, summary)
        has_promo = bool(cart.promo_code_id)
        keyboard = _cart_keyboard(cart.items, has_promo=has_promo)

    if isinstance(event, CallbackQuery):
        await safe_edit(event.message, text, reply_markup=keyboard)
        await event.answer()
    else:
        await event.answer(text, reply_markup=keyboard, parse_mode="HTML")


# ── Handlers: просмотр корзины ────────────────────────────────────────────────

@router.message(Command("cart"))
@router.message(F.text == "🛒 Корзина")
async def cmd_cart(message: Message, user: User, db: AsyncSession) -> None:
    await _show_cart(message, user, db)


@router.callback_query(F.data == "cart:view")
async def cb_cart_view(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    await _show_cart(call, user, db)


# ── Handlers: изменение количества ───────────────────────────────────────────

async def _resolve_item_id(cart_svc: CartService, user: User, item_id_short: str):
    """Находит полный UUID позиции по первым 8 символам."""
    cart = await cart_svc.get_or_create_cart(user)
    for item in cart.items:
        if str(item.id).startswith(item_id_short):
            return cart, item
    return cart, None


@router.callback_query(F.data.startswith("cart:qty:"))
async def cb_cart_qty(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    # Формат: cart:qty:{item_id_short}:{inc|dec}
    parts = call.data.split(":")
    if len(parts) < 4:
        await call.answer("Ошибка", show_alert=True)
        return

    item_id_short = parts[2]
    action = parts[3]  # inc или dec

    cart_svc = CartService(db)
    cart, item = await _resolve_item_id(cart_svc, user, item_id_short)

    if not item:
        await call.answer("Позиция не найдена", show_alert=True)
        return

    if action == "inc":
        new_qty = item.quantity + 1
        await cart_svc.update_item(cart, item.id, new_qty)
        await db.commit()
        await call.answer(f"Количество: {new_qty}")
    elif action == "dec":
        if item.quantity <= 1:
            # Удаляем позицию
            await cart_svc.update_item(cart, item.id, 0)
            await db.commit()
            await call.answer("Позиция удалена из корзины")
        else:
            new_qty = item.quantity - 1
            await cart_svc.update_item(cart, item.id, new_qty)
            await db.commit()
            await call.answer(f"Количество: {new_qty}")

    # Перерисовываем корзину
    await _show_cart(call, user, db)


# ── Handlers: очистка корзины ─────────────────────────────────────────────────

@router.callback_query(F.data == "cart:clear")
async def cb_cart_clear(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    cart_svc = CartService(db)
    cart = await cart_svc.get_or_create_cart(user)
    if not cart.is_empty:
        await cart_svc.clear_cart(cart)
        await db.commit()
        await call.answer("🗑 Корзина очищена")
    else:
        await call.answer("Корзина уже пуста")

    await _show_cart(call, user, db)


# ── Промокод FSM ──────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cart:promo")
async def cb_cart_promo(
    call: CallbackQuery, state: FSMContext
) -> None:
    await state.set_state(PromoCodeFSM.waiting_code)
    await safe_edit(
        call.message,
        texts.cart_promo_prompt,
        reply_markup=_promo_cancel_keyboard(),
    )
    await call.answer()


@router.callback_query(F.data == "cart:promo:cancel")
async def cb_promo_cancel(
    call: CallbackQuery, user: User, db: AsyncSession, state: FSMContext
) -> None:
    await state.clear()
    await _show_cart(call, user, db)


@router.message(PromoCodeFSM.waiting_code)
async def fsm_promo_code_input(
    message: Message,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    code = (message.text or "").strip()
    if not code:
        await message.answer(
            "❌ Введи промокод:",
            reply_markup=_promo_cancel_keyboard(),
            parse_mode="HTML",
        )
        return

    cart_svc = CartService(db)
    cart = await cart_svc.get_or_create_cart(user)

    if cart.is_empty:
        await state.clear()
        await message.answer(texts.cart_empty, parse_mode="HTML")
        return

    result = await cart_svc.apply_promo(cart, user, code)
    await db.commit()

    if result.get("valid"):
        discount = float(result.get("discount", 0))
        await message.answer(
            texts.cart_promo_applied(code.upper(), discount),
            parse_mode="HTML",
        )
    else:
        reason = result.get("reason", "")
        await message.answer(
            texts.cart_promo_invalid(reason),
            parse_mode="HTML",
        )

    await state.clear()

    # Показываем обновлённую корзину
    summary = await cart_svc.get_cart_summary(cart, user)
    text = await _build_cart_text(cart, summary)
    has_promo = bool(cart.promo_code_id)
    keyboard = _cart_keyboard(cart.items, has_promo=has_promo)
    await message.answer(text, reply_markup=keyboard, parse_mode="HTML")
