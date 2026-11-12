"""
bot/handlers/client/catalog.py
─────────────────────────────────────────────────────────────────────────────
Каталог игр и товаров. FSM для сбора input_fields перед добавлением в корзину.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from decimal import Decimal
from html import escape

from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from sqlalchemy import select, func as sa_func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Game, Category, Product, Cart, CartItem, User
from shared.config import settings
from api.services.cart_service import CartService
from aiogram.exceptions import TelegramBadRequest

from bot.utils.texts import texts
from bot.utils.helpers import safe_edit, render_screen
from bot.utils.rich import send_screen
from bot.utils.widgets import SendWidget, category_widget_html, widgets_enabled
from shared.content import get_photo_url, get_text, resolve_photo_url

router = Router(name="client:catalog")


class InputFieldsFSM(StatesGroup):
    collecting = State()


# ── Вспомогательные функции клавиатур ─────────────────────────────────────────

def _cart_button(cart_total: float | None) -> list[InlineKeyboardButton] | None:
    if cart_total and cart_total > 0:
        return [InlineKeyboardButton(
            text=f"🛒 Корзина: {cart_total:.0f} ₽",
            callback_data="cart:view",
        )]
    return None


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


# ── Списки: страницы по 2 кнопки в ряд ───────────────────────────────────────
# Telegram принимает не больше 100 кнопок в сообщении — весь каталог (80+ игр)
# одной клавиатурой не открывался. Теперь игры листаются страницами, самые
# продаваемые первыми; найти любую можно поиском (или просто написать название).

GAMES_PAGE = 16       # 8 рядов по 2
PRODUCTS_PAGE = 20    # товаров раздела на странице (у SWGOH их ~150)
CATEGORIES_PAGE = 20  # разделов игры на странице (у украшений Discord ~100 коллекций)


def _rows(buttons: list[InlineKeyboardButton], per_row: int = 2) -> list[list[InlineKeyboardButton]]:
    return [buttons[i:i + per_row] for i in range(0, len(buttons), per_row)]


def _pager(prefix: str, page: int, pages: int) -> list[InlineKeyboardButton] | None:
    """◀️ 2/6 ▶️ — листание; на краях стрелка ведёт по кругу."""
    if pages <= 1:
        return None
    return [
        InlineKeyboardButton(text="◀️", callback_data=f"{prefix}{(page - 1) % pages}"),
        InlineKeyboardButton(text=f"{page + 1} / {pages}", callback_data="noop"),
        InlineKeyboardButton(text="▶️", callback_data=f"{prefix}{(page + 1) % pages}"),
    ]


def _short(name: str, limit: int = 28) -> str:
    return name if len(name) <= limit else name[: limit - 1].rstrip() + "…"


async def _catalog_games(db: AsyncSession, services: bool) -> list[Game]:
    """Игры (донат) или сервисы, у которых есть что купить; самые продаваемые первыми.
    Ключи игр в боте не показываем — они на сайте."""
    from api.services.home_service import game_min_prices

    cond = Game.type == "service" if services else or_(Game.type.is_(None), Game.type == "game")
    games = list((await db.execute(select(Game).where(Game.is_active == True, cond))).scalars().all())
    in_stock = await game_min_prices(db)
    games = [g for g in games if g.id in in_stock]
    # в боте — по алфавиту (на сайте и в мини-аппе свой порядок)
    games.sort(key=lambda g: g.name.lower().replace("ё", "е"))
    return games


async def show_games_list(
    event: Message | CallbackQuery,
    db: AsyncSession,
    state: FSMContext | None = None,
    services: bool = False,
    page: int = 0,
) -> None:
    games = await _catalog_games(db, services)
    kind = "services" if services else "main"
    if services:
        header_text = await get_text(db, "services_header")
        photo_url = await get_photo_url(db, "catalog_services")
    else:
        header_text = await get_text(db, "catalog_header")
        photo_url = await get_photo_url(db, "catalog_games")

    menu_row = [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")]
    if not games:
        text = await get_text(db, "catalog_empty")
        keyboard = InlineKeyboardMarkup(inline_keyboard=[menu_row])
    else:
        pages = (len(games) + GAMES_PAGE - 1) // GAMES_PAGE
        page = max(0, min(page, pages - 1))
        chunk = games[page * GAMES_PAGE:(page + 1) * GAMES_PAGE]
        rows = [[InlineKeyboardButton(text="🔍 Найти по названию", callback_data="catalog:search")]]
        rows += _rows([InlineKeyboardButton(text=_short(g.name), callback_data=f"catalog:game:{g.id}")
                       for g in chunk])
        pager = _pager(f"catalog:{kind}:p:", page, pages)
        if pager:
            rows.append(pager)
        other = (InlineKeyboardButton(text="🎮 Донат в игры", callback_data="catalog:main") if services
                 else InlineKeyboardButton(text="🔧 Сервисы", callback_data="catalog:services"))
        rows.append([other, *menu_row])
        text = header_text
        keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

    await render_screen(event, state, text, photo_url=photo_url, reply_markup=keyboard)


# ── Handlers: навигация по каталогу ──────────────────────────────────────────

@router.callback_query(F.data == "noop")
async def cb_noop(call: CallbackQuery) -> None:
    await call.answer()


@router.callback_query(F.data == "catalog:main")
@router.callback_query(F.data == "open_catalog")
async def cb_catalog_main(call: CallbackQuery, db: AsyncSession, state: FSMContext) -> None:
    await show_games_list(call, db, state=state)


@router.callback_query(F.data == "catalog:services")
async def cb_catalog_services(call: CallbackQuery, db: AsyncSession, state: FSMContext) -> None:
    await show_games_list(call, db, state=state, services=True)


@router.callback_query(F.data.regexp(r"^catalog:(main|services):p:\d+$"))
async def cb_catalog_page(call: CallbackQuery, db: AsyncSession, state: FSMContext) -> None:
    _, kind, _, page = call.data.split(":")
    await show_games_list(call, db, state=state, services=kind == "services", page=int(page))


# ── Поиск по названию ────────────────────────────────────────────────────────

class SearchFSM(StatesGroup):
    query = State()


def _norm(s: str) -> str:
    return " ".join("".join(ch if ch.isalnum() else " " for ch in (s or "").lower().replace("ё", "е")).split())


async def search_games(db: AsyncSession, query: str, limit: int = 16) -> list[Game]:
    """Донат и сервисы по названию и другим названиям из админки («Геншин», «стим»)."""
    q = _norm(query)
    if len(q) < 2:
        return []
    games = await _catalog_games(db, False) + await _catalog_games(db, True)
    found = []
    for g in games:
        names = [_norm(g.name)] + [_norm(a) for a in (g.seo_aliases or "").replace(";", ",").replace("\n", ",").split(",")]
        if any(n.startswith(q) for n in names if n):
            found.append((0, g))
        elif any(q in n for n in names if n):
            found.append((1, g))
    found.sort(key=lambda x: x[0])
    return [g for _, g in found][:limit]


async def show_search_results(message: Message, db: AsyncSession, state: FSMContext, query: str) -> None:
    games = await search_games(db, query)
    back = [InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")]
    if games:
        text = (f"<h2>Поиск: «{escape(query[:40])}»</h2>\nНашлось: <b>{len(games)}</b>\n"
                "<footer>Выбери игру или напиши другое название</footer>")
        rows = _rows([InlineKeyboardButton(text=_short(g.name), callback_data=f"catalog:game:{g.id}")
                      for g in games])
    else:
        text = (f"<h2>Поиск: «{escape(query[:40])}»</h2>\nНичего не нашлось.\n\n"
                "Попробуй иначе — например, «genshin» или «стим». Нет нужной игры — "
                "напиши в поддержку, соберём заказ индивидуально.")
        rows = [[InlineKeyboardButton(text="🆘 Поддержка", callback_data="support:main")]]
    rows.append(back)
    await state.set_state(SearchFSM.query)
    await send_screen(message.bot, message.chat.id, text, reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@router.callback_query(F.data == "catalog:search")
async def cb_catalog_search(call: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(SearchFSM.query)
    await safe_edit(
        call.message,
        "<h2>Поиск</h2>\nНапиши название игры или сервиса — например, <i>Genshin</i>, <i>PUBG</i> или <i>Steam</i>.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
            InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
        ]]),
    )
    await call.answer()


# ── Игра → разделы ───────────────────────────────────────────────────────────

async def render_game(call: CallbackQuery, game: Game, db: AsyncSession, page: int = 0) -> None:
    categories = list((await db.execute(
        select(Category)
        .where(Category.game_id == game.id, Category.is_active == True, Category.parent_id == None)
    )).scalars().all())
    categories.sort(key=lambda c: c.name.lower().replace("ё", "е"))   # в боте — по алфавиту
    if not categories:
        await call.answer("Нет доступных разделов", show_alert=True)
        return

    pages = (len(categories) + CATEGORIES_PAGE - 1) // CATEGORIES_PAGE
    page = max(0, min(page, pages - 1))
    chunk = categories[page * CATEGORIES_PAGE:(page + 1) * CATEGORIES_PAGE]
    # Короткие названия — по 2 в ряд, длинные — по одному
    btns = [InlineKeyboardButton(text=_short(cat.name, 40), callback_data=f"catalog:cat:{cat.id}") for cat in chunk]
    rows = _rows(btns, 2 if all(len(c.name) <= 18 for c in chunk) else 1)
    pager = _pager(f"catalog:gamep:{game.id}:", page, pages)
    if pager:
        rows.append(pager)
    back_cb = "catalog:services" if game.type == "service" else "catalog:main"
    rows.append([
        InlineKeyboardButton(text="◀️ Назад", callback_data=back_cb),
        InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
    ])
    await render_screen(
        call, None, texts.game_header(game.name, (game.description or "").strip()),
        photo_url=resolve_photo_url(game.banner_url), reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
    )


@router.callback_query(F.data.startswith("catalog:game:"))
async def cb_catalog_game(call: CallbackQuery, db: AsyncSession, state: FSMContext) -> None:
    try:
        game_id = uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return
    if await state.get_state() == SearchFSM.query.state:
        await state.set_state(None)   # из результатов поиска — дальше обычная навигация
    await render_game(call, game, db)


@router.callback_query(F.data.startswith("catalog:gamep:"))
async def cb_catalog_game_page(call: CallbackQuery, db: AsyncSession) -> None:
    try:
        _, _, gid, page = call.data.split(":")
        game = await db.get(Game, uuid.UUID(gid))
        page_n = int(page)
    except ValueError:
        await call.answer("Ошибка", show_alert=True)
        return
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return
    await render_game(call, game, db, page=page_n)


@router.callback_query(F.data.in_({"menu:stars", "menu:steam"}))
async def cb_menu_shortcut(call: CallbackQuery, db: AsyncSession) -> None:
    """Быстрые кнопки главного меню: звёзды/Premium (игра Telegram) и Steam."""
    slug = "telegram" if call.data == "menu:stars" else "steam"
    game = (await db.execute(select(Game).where(Game.slug == slug, Game.is_active == True))).scalar_one_or_none()
    if not game:
        await call.answer("Раздел временно недоступен", show_alert=True)
        return
    await render_game(call, game, db)


# ── Раздел → товары (страницами) ─────────────────────────────────────────────

async def category_products(db: AsyncSession, category_id: uuid.UUID) -> list[Product]:
    """Товары раздела в порядке показа. Виджет ссылается на них по номерам —
    список и запрос виджета должны строиться одной функцией."""
    return list((await db.execute(
        select(Product)
        .where(Product.category_id == category_id, Product.is_active == True)
        .order_by(Product.sort_order.asc(), Product.name.asc(), Product.id.asc())
    )).scalars().all())


def widget_keyboard(category_id: uuid.UUID, game_id: uuid.UUID, cart_total: float | None) -> InlineKeyboardMarkup:
    """Кнопки под виджетом раздела: корзина, список (если виджет не виден), назад."""
    rows = []
    if cart_total:
        rows.append([InlineKeyboardButton(text=f"🛒 Корзина: {cart_total:.0f} ₽", callback_data="cart:view",
                                          style="success")])
    rows.append([InlineKeyboardButton(text="📋 Списком", callback_data=f"catalog:catlist:{category_id}")])
    rows.append([
        InlineKeyboardButton(text="◀️ Назад", callback_data=f"catalog:game:{game_id}"),
        InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def _send_category_widget(call: CallbackQuery, category: Category, game: Game | None,
                                products: list[Product], cart_total: float | None) -> bool:
    """Раздел виджетом: подпись (название, описание) над ним, выбор и «В корзину» — внутри."""
    html = category_widget_html(category.id, products)
    if html is None:
        return False
    game_name = game.name if game else ""
    caption = f"<b>{escape(category.name)}</b>" + (f" · {escape(game_name)}" if game_name else "")
    desc = (category.description or (game.description if game else None) or "").strip()
    if desc:
        caption += f"\n\n{escape(desc[:700])}"
    try:
        await call.bot(SendWidget(
            chat_id=call.message.chat.id, html=html, caption=caption, parse_mode="HTML",
            show_caption_above_media=True, allow_queries=True,
            reply_markup=widget_keyboard(category.id, category.game_id, cart_total),
        ))
    except TelegramBadRequest:
        return False
    try:
        await call.message.delete()
    except TelegramBadRequest:
        pass
    return True


async def _render_category(
    call: CallbackQuery,
    category_id: uuid.UUID,
    db: AsyncSession,
    user: User,
    toast: str | None = None,
    page: int = 0,
    focus_product: uuid.UUID | None = None,
    as_list: bool = False,
) -> None:
    """Товары раздела: виджетом (выбор в сообщении), иначе — страницами кнопок,
    клик по товару = добавить в корзину."""
    category = await db.get(Category, category_id)
    if not category:
        await call.answer("Раздел не найден", show_alert=True)
        return

    products = await category_products(db, category_id)
    if not products:
        await call.answer("Нет доступных товаров", show_alert=True)
        return

    cart = await CartService(db).get_or_create_cart(user)
    cart_total = float(cart.total) if not cart.is_empty else None
    qty_map: dict = {}
    for it in cart.items:
        qty_map[it.product_id] = qty_map.get(it.product_id, 0) + it.quantity

    game = await db.get(Game, category.game_id)
    game_name = game.name if game else "Игра"

    if widgets_enabled() and not as_list:
        if await _send_category_widget(call, category, game, products, cart_total):
            await call.answer(toast or "")
            return

    if len(products) == 1:
        return await _show_product(call, products[0].id, db, cart=cart)

    pages = (len(products) + PRODUCTS_PAGE - 1) // PRODUCTS_PAGE
    if focus_product is not None:   # после «в корзину» — остаёмся на странице этого товара
        idx = next((i for i, p in enumerate(products) if p.id == focus_product), 0)
        page = idx // PRODUCTS_PAGE
    page = max(0, min(page, pages - 1))

    buttons = []
    for p in products[page * PRODUCTS_PAGE:(page + 1) * PRODUCTS_PAGE]:
        q = qty_map.get(p.id, 0)
        label = f"{p.name} — {float(p.price):.0f} ₽"
        if p.is_out_of_stock:
            label += " · нет в наличии"
        elif q:
            label += f" · в корзине {q}"
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"catalog:qadd:{p.id}")])

    pager = _pager(f"catalog:catp:{category_id}:", page, pages)
    if pager:
        buttons.append(pager)
    cart_row = _cart_button(cart_total)
    if cart_row:
        buttons.append(cart_row + [InlineKeyboardButton(text="🗑 Убрать раздел", callback_data=f"catalog:cat:reset:{category_id}")])
    buttons.append([
        InlineKeyboardButton(text=f"◀️ {_short(game_name, 20)}", callback_data=f"catalog:game:{category.game_id}"),
        InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main"),
    ])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    header = texts.category_header(game_name, category.name)
    desc = (category.description or (game.description if game else None) or "").strip()
    if desc:
        header = f"{header}\n\n{escape(desc[:600])}"
    header += "\n<footer>Нажми на товар — он добавится в корзину</footer>"

    await render_screen(call, None, header, reply_markup=keyboard, answer_text=toast or "")


@router.callback_query(F.data.startswith("catalog:cat:reset:"))
async def cb_catalog_cat_reset(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    try:
        category_id = uuid.UUID(call.data.split(":")[3])
    except (IndexError, ValueError):
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
    await _render_category(call, category_id, db, user, as_list=True,
                           toast=f"🗑 Убрано из корзины: {removed}" if removed else "В корзине нет товаров из этого раздела")


@router.callback_query(F.data.startswith("catalog:cat:"))
async def cb_catalog_category(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    try:
        category_id = uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID раздела", show_alert=True)
        return
    await _render_category(call, category_id, db, user)


@router.callback_query(F.data.startswith("catalog:catlist:"))
async def cb_catalog_category_list(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    """Раздел списком кнопок — если виджет не отображается (старое приложение Telegram)."""
    try:
        category_id = uuid.UUID(call.data.split(":")[2])
    except (IndexError, ValueError):
        await call.answer("Ошибка", show_alert=True)
        return
    await _render_category(call, category_id, db, user, as_list=True)


@router.callback_query(F.data.startswith("catalog:catp:"))
async def cb_catalog_category_page(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    try:
        _, _, cid, page = call.data.split(":")
        category_id, page_n = uuid.UUID(cid), int(page)
    except ValueError:
        await call.answer("Ошибка", show_alert=True)
        return
    await _render_category(call, category_id, db, user, page=page_n, as_list=True)


@router.callback_query(F.data.startswith("catalog:qadd:"))
async def cb_catalog_quick_add(call: CallbackQuery, db: AsyncSession, user: User) -> None:
    """Клик по товару в списке — добавляет 1 шт в корзину и обновляет список."""
    try:
        product_id = uuid.UUID(call.data.split(":")[2])
    except (IndexError, ValueError):
        await call.answer("Ошибка", show_alert=True)
        return

    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.is_active == True)
    )).scalar_one_or_none()
    if not product:
        await call.answer("❌ Товар недоступен", show_alert=True)
        return
    if product.is_out_of_stock:
        await call.answer("❌ Нет в наличии", show_alert=True)
        return

    try:
        await _persist_cart_item(db, user, product, {})
        await db.commit()
    except Exception:
        await db.rollback()
        await call.answer("Ошибка при добавлении в корзину", show_alert=True)
        return

    await _render_category(call, product.category_id, db, user, toast=f"✅ {product.name} — в корзине",
                           focus_product=product.id, as_list=True)


async def _show_product(
    call: CallbackQuery,
    product_id: uuid.UUID,
    db: AsyncSession,
    user: User | None = None,
    answer_text: str = "",
    cart=None,
) -> None:
    """Показывает карточку товара."""
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        await call.answer("Товар не найден", show_alert=True)
        return

    cart_total = float(cart.total) if cart and not cart.is_empty else None

    text = texts.product_card(
        name=product.name,
        description=product.description or "",
        price=float(product.price),
        stock=product.stock,
        delivery_type=product.delivery_type.value,
        min_price=float(product.price),
        max_price=float(product.price),
        cart_total=cart_total,
    )

    def _qty() -> int:
        if not cart:
            return 0
        for item in cart.items:
            if item.product_id == product.id:
                return item.quantity
        return 0

    buttons = []
    qty = _qty()
    qty_text = f" (×{qty})" if qty > 0 else ""
    is_blocked = product.is_out_of_stock or (product.stock is not None and product.stock == 0)

    if not is_blocked:
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"🛒 В корзину — {float(product.price):.0f} ₽{qty_text}",
                    callback_data=f"cart:add:{product.id}",
                    style="success",
                )
            ]
        )
    else:
        buttons.append(
            [InlineKeyboardButton(text="Нет в наличии", callback_data="noop")]
        )

    buttons.append([InlineKeyboardButton(text="🛒 Корзина", callback_data="cart:view")])

    product_count = await db.scalar(
        select(sa_func.count(Product.id)).where(
            Product.category_id == product.category_id,
            Product.is_active == True,
        )
    )
    if product_count == 1 and product.category_id:
        category = await db.get(Category, product.category_id)
        back_cb = f"catalog:game:{category.game_id}" if category else "catalog:main"
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
    try:
        product_id = uuid.UUID(parts[2])
    except (IndexError, ValueError):
        await call.answer("Ошибка: некорректные данные товара", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .where(Product.id == product_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        await call.answer("❌ Товар недоступен", show_alert=True)
        return

    if product.is_out_of_stock:
        await call.answer("❌ Товар недоступен (нет в наличии)", show_alert=True)
        return

    input_fields: list[dict] = product.input_fields or []

    if not input_fields:
        await _add_to_cart(call, user, db, product, input_data={})
        return

    # Есть поля — запускаем FSM
    await state.set_state(InputFieldsFSM.collecting)
    await state.update_data(
        product_id=str(product_id),
        fields=input_fields,
        current_idx=0,
        collected={},
    )

    await _ask_field(call.message, input_fields[0], edit=True)
    await call.answer()


def _field_prompt(field: dict) -> tuple[str, InlineKeyboardMarkup]:
    label: str = field.get("label", "Поле")
    options: list[str] = field.get("options", [])
    if field.get("type", "text") == "select" and options:
        return texts.input_field_select_prompt(label), _select_field_keyboard(options)
    return texts.input_field_prompt(label, field.get("placeholder", "")), _cancel_fsm_keyboard()


async def start_fields_from_widget(bot, chat_id: int, state: FSMContext, product: Product,
                                   fields: list[dict], units: int) -> None:
    """Товар выбран в виджете, но нужны данные покупателя — спрашиваем их в чате."""
    units = max(1, min(units, CartService._max_quantity(product)))
    await state.set_state(InputFieldsFSM.collecting)
    await state.update_data(product_id=str(product.id), fields=fields, current_idx=0,
                            collected={}, units=units)
    text, keyboard = _field_prompt(fields[0])
    await bot.send_message(chat_id, text, reply_markup=keyboard, parse_mode="HTML")


async def _ask_field(
    message: Message,
    field: dict,
    edit: bool = False,
) -> None:
    text, keyboard = _field_prompt(field)

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
    data = await state.get_data()
    fields: list[dict] = data["fields"]
    current_idx: int = data["current_idx"]
    collected: dict = data["collected"]

    current_field = fields[current_idx]

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

    await message.answer(
        texts.input_field_saved(current_field["label"], value, remaining),
        parse_mode="HTML",
    )

    if next_idx >= len(fields):
        await state.clear()
        product_id = uuid.UUID(data["product_id"])

        result = await db.execute(
            select(Product)
            .where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()

        if not product:
            await message.answer("❌ Товар не найден.", parse_mode="HTML")
            return

        await _add_to_cart_message(message, user, db, product, input_data=collected,
                                   quantity=int(data.get("units") or 1))
    else:
        await state.update_data(current_idx=next_idx, collected=collected)
        await _ask_field(message, fields[next_idx], edit=False)


@router.callback_query(InputFieldsFSM.collecting, F.data.startswith("field:select:"))
async def fsm_collect_select_field(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    state: FSMContext,
) -> None:
    value = call.data[len("field:select:"):]
    data = await state.get_data()
    fields: list[dict] = data["fields"]
    current_idx: int = data["current_idx"]
    collected: dict = data["collected"]

    current_field = fields[current_idx]
    collected[current_field["key"]] = value
    next_idx = current_idx + 1

    await call.answer(f"✅ Выбрано: {value}")

    if next_idx >= len(fields):
        await state.clear()
        product_id = uuid.UUID(data["product_id"])

        result = await db.execute(
            select(Product)
            .where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()

        if not product:
            await safe_edit(call.message, "❌ Товар не найден.")
            return

        await _add_to_cart(call, user, db, product, input_data=collected,
                           quantity=int(data.get("units") or 1))
    else:
        await state.update_data(current_idx=next_idx, collected=collected)
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
    input_data: dict,
    quantity: int = 1,
) -> None:
    """Сохраняет позицию в корзине (создаёт или увеличивает qty). Не делает commit."""
    price = Decimal(str(product.price))

    cart_result = await db.execute(select(Cart).where(Cart.user_id == user.id))
    cart = cart_result.scalar_one_or_none()
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        await db.flush()

    existing_result = await db.execute(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.product_id == product.id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.quantity += quantity
        existing.price_snapshot = price
        if input_data:
            existing.input_data = input_data
    else:
        item = CartItem(
            cart_id=cart.id,
            product_id=product.id,
            quantity=quantity,
            price_snapshot=price,
            input_data=input_data,
        )
        db.add(item)


async def _add_to_cart(
    call: CallbackQuery,
    user: User,
    db: AsyncSession,
    product: Product,
    input_data: dict,
    quantity: int = 1,
) -> None:
    """Добавляет товар в корзину и перерисовывает карточку товара."""
    try:
        await _persist_cart_item(db, user, product, input_data, quantity)
        await db.commit()
    except Exception:
        await db.rollback()
        await call.answer("Ошибка при добавлении в корзину", show_alert=True)
        return

    cart = await CartService(db).get_or_create_cart(user)
    toast = f"✅ {product.name} — в корзине!"

    await _show_product(call, product.id, db, cart=cart, answer_text=toast)


async def _add_to_cart_message(
    message: Message,
    user: User,
    db: AsyncSession,
    product: Product,
    input_data: dict,
    quantity: int = 1,
) -> None:
    """Добавляет товар в корзину после FSM и отправляет подтверждение новым сообщением."""
    try:
        await _persist_cart_item(db, user, product, input_data, quantity)
        await db.commit()
    except Exception:
        await db.rollback()
        await message.answer(texts.error_general, parse_mode="HTML")
        return

    cart = await CartService(db).get_or_create_cart(user)
    cart_total = float(cart.total)
    cart_btn = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=f"🛒 Корзина: {cart_total:.0f} ₽", callback_data="cart:view"),
        InlineKeyboardButton(text="🎮 Каталог", callback_data="catalog:main"),
    ]])
    await message.answer(
        f"✅ <b>{escape(product.name)}</b> — в корзине!",
        reply_markup=cart_btn,
        parse_mode="HTML",
    )


# ── Кнопка магазина в reply-клавиатуре ───────────────────────────────────────

@router.message(F.text == "🛍 reDonate")
async def btn_shop(message: Message, db: AsyncSession, state: FSMContext) -> None:
    from aiogram.types import WebAppInfo

    if settings.MINIAPP_URL:
        await render_screen(
            message,
            state,
            texts.open_shop,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=f"🛍 Открыть {settings.SHOP_NAME}",
                            web_app=WebAppInfo(url=settings.MINIAPP_URL),
                        )
                    ],
                    [InlineKeyboardButton(text="🏠 Меню", callback_data="menu:main")],
                ]
            ),
        )
    else:
        await show_games_list(message, db, state=state)
