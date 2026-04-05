"""
bot/handlers/client/catalog.py
─────────────────────────────────────────────────────────────────────────────
Каталог игр и товаров. FSM для сбора input_fields перед добавлением в корзину.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from decimal import Decimal

from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select, func as sa_func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Game, Category, Product, ProductLot, Cart, CartItem, User
from shared.config import settings
from api.services.cart_service import CartService
from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, nav_edit

router = Router(name="client:catalog")


class InputFieldsFSM(StatesGroup):
    collecting = State()


# ── Вспомогательные функции клавиатур ─────────────────────────────────────────

def _cart_button(cart_total: float | None) -> list[InlineKeyboardButton] | None:
    """Возвращает строку с кнопкой корзины если сумма > 0, иначе None."""
    if cart_total and cart_total > 0:
        return [InlineKeyboardButton(
            text=f"🛒 Корзина: {cart_total:.0f} ₽",
            callback_data="cart:view",
            style="success",
        )]
    return None


def _games_keyboard(games: list[Game]) -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(
                text=game.name,
                callback_data=f"catalog:game:{game.id}",
            )
        ]
        for game in games
    ]
    buttons.append(
        [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")]
    )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _cancel_fsm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отмена", callback_data="fsm:cancel")],
            [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
        ]
    )


def _select_field_keyboard(options: list[str]) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text=opt, callback_data=f"field:select:{opt}")]
        for opt in options
    ]
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data="fsm:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# ── Показ списка игр ──────────────────────────────────────────────────────────

async def show_games_list(
    event: Message | CallbackQuery,
    db: AsyncSession,
    state: FSMContext | None = None,
    services: bool = False,
) -> None:
    """Показывает список игр (services=False) или сервисов (services=True)."""
    if services:
        result = await db.execute(
            select(Game)
            .where(Game.is_active == True, Game.tags.contains(["service"]))
            .order_by(Game.sort_order.asc(), Game.name.asc())
        )
    else:
        result = await db.execute(
            select(Game)
            .where(Game.is_active == True, ~Game.tags.contains(["service"]))
            .order_by(Game.sort_order.asc(), Game.name.asc())
        )
    games = list(result.scalars().all())

    if services:
        header_text = f"🔧 <b>Сервисы {settings.SHOP_NAME}</b>\n\nВыбери сервис:"
        back_btn = InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")
    else:
        header_text = texts.catalog_header
        back_btn = InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")

    if not games:
        text = texts.catalog_empty
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[back_btn]])
    else:
        buttons = [
            [InlineKeyboardButton(text=game.name, callback_data=f"catalog:game:{game.id}")]
            for game in games
        ]
        buttons.append([back_btn])
        text = header_text
        keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    if isinstance(event, CallbackQuery):
        await safe_edit(event.message, text, reply_markup=keyboard)
        await event.answer()
    else:
        if state is not None:
            await nav_edit(event, state, text, reply_markup=keyboard)
        else:
            await event.answer(text, reply_markup=keyboard, parse_mode="HTML")


# ── Handlers: навигация по каталогу ──────────────────────────────────────────

@router.callback_query(F.data == "catalog:main")
@router.callback_query(F.data == "open_catalog")
async def cb_catalog_main(call: CallbackQuery, db: AsyncSession) -> None:
    await show_games_list(call, db)


@router.callback_query(F.data == "catalog:services")
async def cb_catalog_services(call: CallbackQuery, db: AsyncSession) -> None:
    await show_games_list(call, db, services=True)


@router.callback_query(F.data.startswith("catalog:game:"))
async def cb_catalog_game(call: CallbackQuery, db: AsyncSession) -> None:
    game_id_str = call.data.split(":")[2]
    try:
        game_id = uuid.UUID(game_id_str)
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return

    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    result = await db.execute(
        select(Category)
        .where(
            Category.game_id == game_id,
            Category.is_active == True,
            Category.parent_id == None,
        )
        .order_by(Category.sort_order.asc(), Category.name.asc())
    )
    categories = list(result.scalars().all())

    if not categories:
        await call.answer("Нет доступных категорий", show_alert=True)
        return

    buttons = [
        [InlineKeyboardButton(text=cat.name, callback_data=f"catalog:cat:{cat.id}")]
        for cat in categories
    ]
    buttons.append(
        [
            InlineKeyboardButton(text="◀️ Каталог", callback_data="catalog:main"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
        ]
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await safe_edit(call.message, texts.game_header(game.name), reply_markup=keyboard)
    await call.answer()


@router.callback_query(F.data.startswith("catalog:cat:"))
async def cb_catalog_category(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    category_id_str = call.data.split(":")[2]
    try:
        category_id = uuid.UUID(category_id_str)
    except ValueError:
        await call.answer("Некорректный ID категории", show_alert=True)
        return

    category = await db.get(Category, category_id)
    if not category:
        await call.answer("Категория не найдена", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .where(Product.category_id == category_id, Product.is_active == True)
        .order_by(Product.sort_order.asc(), Product.name.asc())
    )
    products = list(result.scalars().all())

    if not products:
        await call.answer("Нет доступных товаров", show_alert=True)
        return

    cart = await CartService(db).get_or_create_cart(user)
    cart_total = float(cart.total) if not cart.is_empty else None

    # Если товар один — открываем сразу, без промежуточного экрана выбора
    # back_to указывает на уровень игры, чтобы не зациклиться на этой же категории
    if len(products) == 1:
        return await _show_product(call, products[0].id, db, cart=cart)

    game = await db.get(Game, category.game_id)
    game_name = game.name if game else "Игра"

    buttons = [
        [InlineKeyboardButton(text=p.name, callback_data=f"catalog:product:{p.id}")]
        for p in products
    ]
    cart_row = _cart_button(cart_total)
    if cart_row:
        buttons.append(cart_row)
    if cart_total:
        buttons.append([InlineKeyboardButton(
            text="🗑 Сброс",
            callback_data=f"catalog:cat:reset:{category_id}",
            style="danger",
        )])
    buttons.append(
        [
            InlineKeyboardButton(
                text=f"◀️ {game_name}", callback_data=f"catalog:game:{category.game_id}"
            ),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
        ]
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await safe_edit(
        call.message,
        texts.category_header(game_name, category.name),
        reply_markup=keyboard,
    )
    await call.answer()


@router.callback_query(F.data.startswith("catalog:cat:reset:"))
async def cb_catalog_cat_reset(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    """Удаляет из корзины все товары, принадлежащие данному разделу."""
    category_id_str = call.data.split(":")[3]
    try:
        category_id = uuid.UUID(category_id_str)
    except ValueError:
        await call.answer("Ошибка", show_alert=True)
        return

    cart_svc = CartService(db)
    cart = await cart_svc.get_or_create_cart(user)

    removed = 0
    for item in list(cart.items):
        if item.product and item.product.category_id == category_id:
            await cart_svc.update_item(cart, item.id, 0)
            removed += 1

    if removed:
        await db.commit()
        await call.answer(f"🗑 Убрано {removed} поз. из раздела")
    else:
        await call.answer("В корзине нет товаров из этого раздела")

    # Перерисовываем экран категории
    call.data = f"catalog:cat:{category_id}"
    await cb_catalog_category(call, db, user)


async def _show_product(
    call: CallbackQuery,
    product_id: uuid.UUID,
    db: AsyncSession,
    user: User | None = None,
    answer_text: str = "",
    cart=None,
) -> None:
    """Показывает карточку товара. Используется из cb_catalog_product и cb_catalog_category."""
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots), selectinload(Product.category))
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        await call.answer("Товар не найден", show_alert=True)
        return

    active_lots = [lot for lot in product.lots if lot.is_active]
    prices = [float(lot.price) for lot in active_lots] if active_lots else [float(product.price)]

    cart_total = float(cart.total) if cart and not cart.is_empty else None

    text = texts.product_card(
        name=product.name,
        description=product.description or "",
        price=float(product.price),
        stock=product.stock,
        delivery_type=product.delivery_type.value,
        min_price=min(prices),
        max_price=max(prices),
        cart_total=cart_total,
    )

    # Количество данного лота / товара уже в корзине
    def _lot_qty(lot_id) -> int:
        if not cart:
            return 0
        for item in cart.items:
            if item.product_id == product.id and item.lot_id == lot_id:
                return item.quantity
        return 0

    buttons = []
    if active_lots:
        for lot in active_lots:
            badge = f" [{lot.badge}]" if lot.badge else ""
            qty = _lot_qty(lot.id)
            qty_text = f" (×{qty})" if qty > 0 else ""
            buttons.append(
                [
                    InlineKeyboardButton(
                        text=f"{lot.name} — {float(lot.price):.0f} ₽{badge}{qty_text}",
                        callback_data=f"cart:add:{product.id}:{str(lot.id)[:8]}",
                    )
                ]
            )
    else:
        qty = _lot_qty(None)
        qty_text = f" (×{qty})" if qty > 0 else ""
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"В корзину — {float(product.price):.0f} ₽{qty_text}",
                    callback_data=f"cart:add:{product.id}",
                )
            ]
        )

    cart_row = _cart_button(cart_total)
    if cart_row:
        buttons.append(cart_row)

    # Автоматически вычисляем куда вести кнопку «Назад»:
    # если в категории только этот товар — идём на уровень игры, иначе на категорию
    product_count = await db.scalar(
        select(sa_func.count(Product.id)).where(
            Product.category_id == product.category_id,
            Product.is_active == True,
        )
    )
    if product_count == 1 and product.category:
        back_cb = f"catalog:game:{product.category.game_id}"
    else:
        back_cb = f"catalog:cat:{product.category_id}"

    buttons.append(
        [
            InlineKeyboardButton(text="◀️ Назад", callback_data=back_cb),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
        ]
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await safe_edit(call.message, text, reply_markup=keyboard)
    await call.answer(answer_text)


@router.callback_query(F.data.startswith("catalog:product:"))
async def cb_catalog_product(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    product_id_str = call.data.split(":")[2]
    try:
        product_id = uuid.UUID(product_id_str)
    except ValueError:
        await call.answer("Некорректный ID товара", show_alert=True)
        return
    cart = await CartService(db).get_or_create_cart(user)
    await _show_product(call, product_id, db, cart=cart)


# ── FSM: сбор input_fields ────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("cart:add:"))
async def cb_cart_add_with_fields(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    """
    Перехватывает cart:add перед обычным обработчиком корзины.
    Если у товара есть input_fields — запускает FSM. Иначе — добавляет сразу.
    """
    parts = call.data.split(":")
    # Формат: cart:add:{product_id} или cart:add:{product_id}:{lot_prefix8}
    try:
        product_id = uuid.UUID(parts[2])
        lot_prefix = parts[3] if len(parts) > 3 else None
    except (IndexError, ValueError):
        await call.answer("Ошибка: некорректные данные товара", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots))
        .where(Product.id == product_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        await call.answer("❌ Товар недоступен", show_alert=True)
        return

    lot: ProductLot | None = None
    if lot_prefix:
        # lot_id передаётся как первые 8 символов UUID для соблюдения лимита 64 байт
        from sqlalchemy import cast, String as SAString
        lot_result = await db.execute(
            select(ProductLot).where(
                ProductLot.product_id == product_id,
                cast(ProductLot.id, SAString).like(f"{lot_prefix}%"),
            )
        )
        lot = lot_result.scalar_one_or_none()
        if not lot or not lot.is_active:
            await call.answer("❌ Вариант товара недоступен", show_alert=True)
            return

    input_fields: list[dict] = product.input_fields or []

    if not input_fields:
        # Нет полей — добавляем сразу в корзину
        await _add_to_cart(call, user, db, product, lot, input_data={})
        return

    # Есть поля — запускаем FSM
    await state.set_state(InputFieldsFSM.collecting)
    await state.update_data(
        product_id=str(product_id),
        lot_id=str(lot.id) if lot else None,
        fields=input_fields,
        current_idx=0,
        collected={},
    )

    await _ask_field(call.message, input_fields[0], edit=True)
    await call.answer()


async def _ask_field(
    message: Message,
    field: dict,
    edit: bool = False,
) -> None:
    """Показывает запрос на ввод одного поля."""
    label: str = field.get("label", "Поле")
    field_type: str = field.get("type", "text")
    placeholder: str = field.get("placeholder", "")
    options: list[str] = field.get("options", [])

    if field_type == "select" and options:
        text = texts.input_field_select_prompt(label)
        keyboard = _select_field_keyboard(options)
    else:
        text = texts.input_field_prompt(label, placeholder)
        keyboard = _cancel_fsm_keyboard()

    if edit:
        await safe_edit(message, text, reply_markup=keyboard)
    else:
        await message.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.message(InputFieldsFSM.collecting)
async def fsm_collect_text_field(
    message: Message,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    """Принимает текстовый ввод поля."""
    data = await state.get_data()
    fields: list[dict] = data["fields"]
    current_idx: int = data["current_idx"]
    collected: dict = data["collected"]

    current_field = fields[current_idx]

    # Валидация: если поле required и ввод пустой
    value = (message.text or "").strip()
    if current_field.get("required", False) and not value:
        await message.answer(
            "❌ Это поле обязательно для заполнения. Введи значение:",
            reply_markup=_cancel_fsm_keyboard(),
            parse_mode="HTML",
        )
        return

    collected[current_field["key"]] = value
    next_idx = current_idx + 1
    remaining = len(fields) - next_idx

    # Показываем подтверждение
    await message.answer(
        texts.input_field_saved(current_field["label"], value, remaining),
        parse_mode="HTML",
    )

    if next_idx >= len(fields):
        # Все поля собраны — добавляем в корзину
        await state.clear()
        product_id = uuid.UUID(data["product_id"])
        lot_id = uuid.UUID(data["lot_id"]) if data.get("lot_id") else None

        result = await db.execute(
            select(Product)
            .options(selectinload(Product.lots))
            .where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()
        lot = await db.get(ProductLot, lot_id) if lot_id else None

        if not product:
            await message.answer("❌ Товар не найден.", parse_mode="HTML")
            return

        await _add_to_cart_message(message, user, db, product, lot, input_data=collected)
    else:
        # Следующее поле
        await state.update_data(current_idx=next_idx, collected=collected)
        await _ask_field(message, fields[next_idx], edit=False)


@router.callback_query(InputFieldsFSM.collecting, F.data.startswith("field:select:"))
async def fsm_collect_select_field(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    """Принимает выбор варианта из select-поля."""
    value = call.data[len("field:select:"):]
    data = await state.get_data()
    fields: list[dict] = data["fields"]
    current_idx: int = data["current_idx"]
    collected: dict = data["collected"]

    current_field = fields[current_idx]
    collected[current_field["key"]] = value
    next_idx = current_idx + 1
    remaining = len(fields) - next_idx

    await call.answer(f"✅ Выбрано: {value}")

    if next_idx >= len(fields):
        await state.clear()
        product_id = uuid.UUID(data["product_id"])
        lot_id = uuid.UUID(data["lot_id"]) if data.get("lot_id") else None

        result = await db.execute(
            select(Product)
            .options(selectinload(Product.lots))
            .where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()
        lot = await db.get(ProductLot, lot_id) if lot_id else None

        if not product:
            await safe_edit(call.message, "❌ Товар не найден.")
            return

        await _add_to_cart(call, user, db, product, lot, input_data=collected)
    else:
        await state.update_data(current_idx=next_idx, collected=collected)
        # ЗАМЕЧАНИЕ 8 ИСПРАВЛЕНО: вместо safe_edit + _ask_field(edit=False) (два сообщения)
        # редактируем текущее сообщение сразу в следующий вопрос через edit=True.
        await _ask_field(call.message, fields[next_idx], edit=True)


@router.callback_query(F.data == "fsm:cancel")
async def fsm_cancel(call: CallbackQuery, state: FSMContext) -> None:
    current = await state.get_state()
    if current is not None:
        await state.clear()
        await safe_edit(
            call.message,
            "❌ Действие отменено.",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
                        InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
                    ]
                ]
            ),
        )
        await call.answer("Отменено")
    else:
        await call.answer()


# ── Добавление в корзину ──────────────────────────────────────────────────────

async def _persist_cart_item(
    db: AsyncSession,
    user: User,
    product: Product,
    lot: ProductLot | None,
    input_data: dict,
) -> None:
    """Сохраняет позицию в корзине (создаёт или увеличивает qty). Не делает commit."""
    price = Decimal(str(lot.price if lot else product.price))

    cart_result = await db.execute(select(Cart).where(Cart.user_id == user.id))
    cart = cart_result.scalar_one_or_none()
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        await db.flush()

    lot_id = lot.id if lot else None
    existing_result = await db.execute(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.product_id == product.id,
            CartItem.lot_id == lot_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.quantity += 1
        existing.price_snapshot = price
        if input_data:
            existing.input_data = input_data
    else:
        item = CartItem(
            cart_id=cart.id,
            product_id=product.id,
            lot_id=lot_id,
            quantity=1,
            price_snapshot=price,
            input_data=input_data,
        )
        db.add(item)


async def _add_to_cart(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    product: Product,
    lot: ProductLot | None,
    input_data: dict,
) -> None:
    """Добавляет товар в корзину и перерисовывает карточку товара с актуальной суммой корзины."""
    try:
        await _persist_cart_item(db, user, product, lot, input_data)
        await db.commit()
    except Exception:
        await db.rollback()
        await call.answer("Ошибка при добавлении в корзину", show_alert=True)
        return

    # Получаем актуальную корзину (с позициями) для отображения количества и суммы
    cart = await CartService(db).get_or_create_cart(user)

    lot_name = f" ({lot.name})" if lot else ""
    toast = f"✅ {product.name}{lot_name} — в корзине!"

    # Перерисовываем карточку товара — можно сразу добавить ещё
    await _show_product(call, product.id, db, cart=cart, answer_text=toast)


async def _add_to_cart_message(
    message: Message,
    user: User,
    db: AsyncSession,
    product: Product,
    lot: ProductLot | None,
    input_data: dict,
) -> None:
    """Добавляет товар в корзину после FSM и отправляет подтверждение новым сообщением."""
    try:
        await _persist_cart_item(db, user, product, lot, input_data)
        await db.commit()
    except Exception:
        await db.rollback()
        await message.answer(texts.error_general, parse_mode="HTML")
        return

    lot_name = f" ({lot.name})" if lot else ""
    cart = await CartService(db).get_or_create_cart(user)
    cart_total = float(cart.total)
    cart_btn = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=f"🛒 Корзина: {cart_total:.0f} ₽", callback_data="cart:view"),
        InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
    ]])
    await message.answer(
        f"✅ <b>{product.name}{lot_name}</b> — в корзине!",
        reply_markup=cart_btn,
        parse_mode="HTML",
    )


# ── Кнопка магазина в reply-клавиатуре ───────────────────────────────────────

@router.message(F.text == "🛍 reDonate")
async def btn_shop(message: Message, db: AsyncSession, state: FSMContext) -> None:
    from aiogram.types import WebAppInfo

    if settings.MINIAPP_URL:
        await nav_edit(
            message,
            state,
            texts.open_shop,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=f"🛍 Открыть {settings.SHOP_NAME}",
                            web_app=WebAppInfo(url=settings.MINIAPP_URL),
                            style="primary",
                        )
                    ],
                    [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
                ]
            ),
        )
    else:
        await show_games_list(message, db, state=state)
