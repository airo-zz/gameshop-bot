"""
bot/handlers/client/checkout.py
─────────────────────────────────────────────────────────────────────────────
Оформление и оплата заказа.
─────────────────────────────────────────────────────────────────────────────
"""

import html
import uuid

import structlog

from aiogram import Router, F
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.config import settings
from shared.models import CartItem, Order, OrderStatus, PaymentMethod, Product, User
from api.services.cart_service import CartService
from api.services.order_service import OrderService
from api.services.payment_service import PaymentService
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit

router = Router(name="client:checkout")
log = structlog.get_logger()


class CheckoutFSM(StatesGroup):
    collecting_fields = State()  # Сбор данных покупателя на уровне игры
    selecting_method = State()
    waiting_external = State()  # Ожидание внешней оплаты (карта / крипта)


# ── Клавиатуры ────────────────────────────────────────────────────────────────

def _payment_methods_keyboard(balance: float) -> InlineKeyboardMarkup:
    balance_label = f"💰 Балансом ({balance:.0f} ₽)"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=balance_label, callback_data="checkout:pay:balance")],
            # ЮKassa отключена до подключения платёжки — вернуть кнопку "Банковская карта" когда появятся креды
            [InlineKeyboardButton(text="₮ USDT TRC-20", callback_data="checkout:pay:usdt")],
            [InlineKeyboardButton(text="💎 TON", callback_data="checkout:pay:ton")],
            [InlineKeyboardButton(text="❌ Отменить заказ", callback_data="checkout:cancel")],
        ]
    )


def _insufficient_balance_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        # ЮKassa отключена до подключения платёжки — вернуть кнопку "Банковская карта" когда появятся креды
        [InlineKeyboardButton(text="₮ USDT TRC-20", callback_data="checkout:pay:usdt")],
        [InlineKeyboardButton(text="💎 TON", callback_data="checkout:pay:ton")],
        [InlineKeyboardButton(text="❌ Отменить заказ", callback_data="checkout:cancel")],
    ]
    if settings.MINIAPP_URL:
        buttons.insert(
            0,
            [
                InlineKeyboardButton(
                    text="💰 Пополнить баланс",
                    url=settings.MINIAPP_URL,
                )
            ],
        )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _external_payment_keyboard(redirect_url: str, order_id: str) -> InlineKeyboardMarkup:
    order_id_short = order_id[:8]
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="💳 Оплатить", url=redirect_url)],
            [
                InlineKeyboardButton(
                    text="✅ Я оплатил",
                    callback_data=f"checkout:check:{order_id_short}",
                )
            ],
            [InlineKeyboardButton(text="❌ Отменить заказ", callback_data="checkout:cancel")],
        ]
    )


def _order_success_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📋 Мои заказы", callback_data="orders:list")],
            [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main")],
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main", style="primary")],
        ]
    )


# ── Создание заказа ───────────────────────────────────────────────────────────

@router.callback_query(F.data == "checkout:start")
async def cb_checkout_start(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    """
    Создаём заказ из корзины при нажатии «Оформить заказ».
    Метод оплаты выбирается на следующем шаге — пока указываем balance как placeholder,
    заменим при фактической оплате.
    """
    cart_svc = CartService(db)
    cart = await cart_svc.get_or_create_cart(user)

    if cart.is_empty:
        await call.answer("🛒 Корзина пуста!", show_alert=True)
        return

    # Получаем промокод если есть
    promo_code_str: str | None = None
    if cart.promo_code_id:
        from shared.models import PromoCode
        promo_result = await db.execute(
            select(PromoCode).where(PromoCode.id == cart.promo_code_id)
        )
        promo = promo_result.scalar_one_or_none()
        promo_code_str = promo.code if promo else None

    # Поля покупателя на уровне игр в корзине — собираем перед созданием заказа
    queue = await _cart_field_queue(db, cart)
    await state.update_data(order_promo=promo_code_str, field_queue=queue, field_idx=0, collected={})

    if queue:
        await state.set_state(CheckoutFSM.collecting_fields)
        await _ask_checkout_field(call.message, queue[0], edit=True)
        await call.answer()
        return

    await _finalize_order(call.message, user, db, state)
    await call.answer()


# ── Сбор данных покупателя на уровне игры ─────────────────────────────────────

async def _cart_field_queue(db: AsyncSession, cart) -> list[dict]:
    """Плоская очередь полей всех игр корзины (по одному разу на игру)."""
    from shared.models.catalog import Category

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.category).selectinload(Category.game))
        .join(CartItem, CartItem.product_id == Product.id)
        .where(CartItem.cart_id == cart.id)
    )
    products = result.scalars().all()

    seen: dict[str, object] = {}
    for p in products:
        game = getattr(getattr(p, "category", None), "game", None)
        if game and str(game.id) not in seen:
            seen[str(game.id)] = game

    queue: list[dict] = []
    for gid, game in seen.items():
        for f in (getattr(game, "input_fields", None) or []):
            if not isinstance(f, dict):
                continue
            queue.append({
                "game_id": gid,
                "game_name": game.name,
                "key": f.get("key"),
                "label": f.get("label") or f.get("key") or "",
                "type": f.get("type", "text"),
                "options": f.get("options", []) or [],
                "required": bool(f.get("required")),
                "placeholder": f.get("placeholder", ""),
            })
    return queue


async def _ask_checkout_field(message: Message, field: dict, edit: bool = False) -> None:
    label = html.escape(field["label"])
    game = html.escape(field["game_name"])
    if field["type"] == "select" and field["options"]:
        rows = [
            [InlineKeyboardButton(text=opt, callback_data=f"checkout:opt:{i}")]
            for i, opt in enumerate(field["options"])
        ]
        rows.append([InlineKeyboardButton(text="❌ Отменить заказ", callback_data="checkout:cancel")])
        kb = InlineKeyboardMarkup(inline_keyboard=rows)
        text = f"🎮 <b>{game}</b>\nВыберите: {label}"
    else:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отменить заказ", callback_data="checkout:cancel")]
        ])
        ph = f"\n<i>{html.escape(field['placeholder'])}</i>" if field.get("placeholder") else ""
        text = f"🎮 <b>{game}</b>\nВведите: {label}{ph}"

    if edit:
        await safe_edit(message, text, reply_markup=kb)
    else:
        await message.answer(text, reply_markup=kb, parse_mode="HTML")


async def _advance_field(
    message: Message, user: User, db: AsyncSession, state: FSMContext, value: str, edit: bool
) -> None:
    data = await state.get_data()
    queue: list[dict] = data["field_queue"]
    idx: int = data["field_idx"]
    collected: dict = data.get("collected", {})

    field = queue[idx]
    collected.setdefault(field["game_id"], {})[field["key"]] = value
    next_idx = idx + 1
    await state.update_data(collected=collected, field_idx=next_idx)

    if next_idx >= len(queue):
        await _finalize_order(message, user, db, state)
    else:
        await _ask_checkout_field(message, queue[next_idx], edit=edit)


@router.message(CheckoutFSM.collecting_fields)
async def fsm_checkout_field(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    data = await state.get_data()
    queue: list[dict] = data["field_queue"]
    field = queue[data["field_idx"]]

    if field["type"] == "select":
        await message.answer("Пожалуйста, выберите вариант кнопкой выше.")
        return

    value = (message.text or "").strip()
    if field["required"] and not value:
        await message.answer("❌ Поле обязательно для заполнения. Введите значение:")
        return
    await _advance_field(message, user, db, state, value, edit=False)


@router.callback_query(CheckoutFSM.collecting_fields, F.data.startswith("checkout:opt:"))
async def cb_checkout_field_opt(call: CallbackQuery, user: User, db: AsyncSession, state: FSMContext) -> None:
    data = await state.get_data()
    queue: list[dict] = data["field_queue"]
    field = queue[data["field_idx"]]
    try:
        opt_idx = int(call.data.split(":")[2])
    except (IndexError, ValueError):
        await call.answer()
        return
    options = field.get("options") or []
    if opt_idx >= len(options):
        await call.answer()
        return
    await _advance_field(call.message, user, db, state, options[opt_idx], edit=True)
    await call.answer()


async def _finalize_order(message: Message, user: User, db: AsyncSession, state: FSMContext) -> None:
    """Создаёт заказ с собранными данными и показывает выбор способа оплаты."""
    data = await state.get_data()
    promo_code_str = data.get("order_promo")
    collected = data.get("collected", {})

    cart_svc = CartService(db)
    order_svc = OrderService(db)
    cart = await cart_svc.get_or_create_cart(user)
    if cart.is_empty:
        await state.clear()
        await message.answer("🛒 Корзина пуста!")
        return

    try:
        order = await order_svc.create_from_cart(
            user=user,
            cart=cart,
            payment_method=None,
            promo_code_str=promo_code_str,
            input_data=collected,
        )
    except ValueError as exc:
        await state.clear()
        await message.answer(f"❌ {exc}")
        return

    await state.set_state(CheckoutFSM.selecting_method)
    await state.update_data(order_id=str(order.id))

    text = texts.checkout_select_method(
        order_number=order.order_number,
        total=float(order.total_amount),
        balance=float(user.balance),
    )
    await message.answer(
        text,
        reply_markup=_payment_methods_keyboard(float(user.balance)),
        parse_mode="HTML",
    )


# ── Оплата балансом ───────────────────────────────────────────────────────────

@router.callback_query(CheckoutFSM.selecting_method, F.data == "checkout:pay:balance")
async def cb_pay_balance(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    order_id = uuid.UUID(data["order_id"])

    order = await db.get(Order, order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    payment_svc = PaymentService(db)
    try:
        await payment_svc.pay_balance(order, user)
        await state.clear()

        await safe_edit(
            call.message,
            texts.order_paid(order.order_number),
            reply_markup=_order_success_keyboard(),
        )
        await call.answer("✅ Оплачено!")
    except ValueError:
        # БАГ 5 ИСПРАВЛЕН: обновляем объект user из БД — pay_with_balance
        # мог изменить состояние сессии до исключения.
        await db.refresh(user)
        needed = float(order.total_amount)
        balance = float(user.balance)
        await safe_edit(
            call.message,
            texts.payment_insufficient_balance(balance, needed),
            reply_markup=_insufficient_balance_keyboard(),
        )
        await call.answer("❌ Недостаточно средств", show_alert=True)


# ── Оплата картой (ЮKassa) ────────────────────────────────────────────────────

@router.callback_query(CheckoutFSM.selecting_method, F.data == "checkout:pay:card")
async def cb_pay_card(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    order_id = uuid.UUID(data["order_id"])

    order = await db.get(Order, order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    payment_svc = PaymentService(db)
    try:
        result = await payment_svc.pay_yukassa(order, user)
        # БАГ 3 ИСПРАВЛЕН: фиксируем реальный метод оплаты в заказе
        order.payment_method = PaymentMethod.card_yukassa
    except ValueError as exc:
        await call.answer(str(exc), show_alert=True)
        return

    redirect_url = result.get("redirect_url", "")
    if not redirect_url:
        await call.answer("Не удалось создать платёж", show_alert=True)
        return

    await state.set_state(CheckoutFSM.waiting_external)

    await safe_edit(
        call.message,
        texts.payment_waiting_external("card", float(order.total_amount), redirect_url),
        reply_markup=_external_payment_keyboard(redirect_url, str(order.id)),
    )
    await call.answer()


# ── Оплата USDT ───────────────────────────────────────────────────────────────

@router.callback_query(CheckoutFSM.selecting_method, F.data == "checkout:pay:usdt")
async def cb_pay_usdt(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    order_id = uuid.UUID(data["order_id"])

    order = await db.get(Order, order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    payment_svc = PaymentService(db)
    try:
        result = await payment_svc.pay_crypto(order, user, currency="USDT")
        # БАГ 3 ИСПРАВЛЕН: фиксируем реальный метод оплаты в заказе
        order.payment_method = PaymentMethod.usdt
    except ValueError as exc:
        await call.answer(str(exc), show_alert=True)
        return

    redirect_url = result.get("redirect_url", "")
    if not redirect_url:
        await call.answer("Не удалось создать инвойс", show_alert=True)
        return

    await state.set_state(CheckoutFSM.waiting_external)

    await safe_edit(
        call.message,
        texts.payment_waiting_external("usdt", float(order.total_amount), redirect_url),
        reply_markup=_external_payment_keyboard(redirect_url, str(order.id)),
    )
    await call.answer()


# ── Оплата TON ────────────────────────────────────────────────────────────────

@router.callback_query(CheckoutFSM.selecting_method, F.data == "checkout:pay:ton")
async def cb_pay_ton(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    order_id = uuid.UUID(data["order_id"])

    order = await db.get(Order, order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    payment_svc = PaymentService(db)
    try:
        result = await payment_svc.pay_crypto(order, user, currency="TON")
        # БАГ 3 ИСПРАВЛЕН: фиксируем реальный метод оплаты в заказе
        order.payment_method = PaymentMethod.ton
    except ValueError as exc:
        await call.answer(str(exc), show_alert=True)
        return

    redirect_url = result.get("redirect_url", "")
    if not redirect_url:
        await call.answer("Не удалось создать инвойс", show_alert=True)
        return

    await state.set_state(CheckoutFSM.waiting_external)

    await safe_edit(
        call.message,
        texts.payment_waiting_external("ton", float(order.total_amount), redirect_url),
        reply_markup=_external_payment_keyboard(redirect_url, str(order.id)),
    )
    await call.answer()


# ── Проверка статуса внешней оплаты ──────────────────────────────────────────

@router.callback_query(
    CheckoutFSM.waiting_external,
    F.data.startswith("checkout:check:"),
)
async def cb_checkout_check(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    """Пользователь нажал «Я оплатил» — проверяем статус в БД."""
    data = await state.get_data()
    order_id = uuid.UUID(data["order_id"])

    order = await db.get(Order, order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    status_labels = {
        OrderStatus.new: "⏳ Ожидает оплаты",
        OrderStatus.pending_payment: "⏳ Ожидает подтверждения",
        OrderStatus.paid: "💚 Оплачен",
        OrderStatus.processing: "⚙️ В обработке",
        OrderStatus.completed: "✅ Выполнен",
        OrderStatus.cancelled: "❌ Отменён",
    }

    if order.status in (OrderStatus.paid, OrderStatus.processing, OrderStatus.completed):
        await state.clear()
        # Финальное уведомление приходит от webhook через _notify_user_payment_success.
        # Здесь только удаляем платёжное сообщение, чтобы не было дубля.
        try:
            await call.message.delete()
        except Exception:
            pass
        await call.answer("✅ Оплата подтверждена!")
    else:
        status_text = status_labels.get(order.status, order.status.value)
        await call.answer(
            f"Статус: {status_text}\nОплата ещё не поступила. Попробуй позже.",
            show_alert=True,
        )


# ── Отмена заказа ─────────────────────────────────────────────────────────────

# БАГ 2 ИСПРАВЛЕН: добавлен StateFilter — хендлер срабатывает только в состояниях
# CheckoutFSM, не перехватывая FSM других модулей (PromoCodeFSM, InputFieldsFSM).
@router.callback_query(
    StateFilter(
        CheckoutFSM.collecting_fields,
        CheckoutFSM.selecting_method,
        CheckoutFSM.waiting_external,
    ),
    F.data == "checkout:cancel",
)
async def cb_checkout_cancel(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    order_id_str = data.get("order_id")
    order = None

    if order_id_str:
        try:
            order_id = uuid.UUID(order_id_str)
            order = await db.get(Order, order_id)
            if order and order.status not in (OrderStatus.cancelled, OrderStatus.completed):
                order_svc = OrderService(db)
                await order_svc.change_status(
                    order,
                    OrderStatus.cancelled,
                    changed_by_id=user.id,
                    changed_by_type="user",
                    reason="Отменён пользователем",
                )
        except Exception as e:
            log.warning("checkout.cancel_error", exc=str(e))
            await call.answer("Не удалось отменить заказ", show_alert=True)
            return

    await state.clear()

    await safe_edit(
        call.message,
        texts.order_cancelled(order.order_number) if order else "❌ Заказ отменён.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main")],
                [InlineKeyboardButton(text="🛒 Корзина", callback_data="cart:view")],
            ]
        ),
    )
    await call.answer("Заказ отменён")
