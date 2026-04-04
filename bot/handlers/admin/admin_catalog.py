"""
bot/handlers/admin/admin_catalog.py
─────────────────────────────────────────────────────────────────────────────
Управление каталогом через admin-бот:
  - Список игр / добавить / редактировать / вкл-выкл
  - Список категорий / добавить / редактировать
  - Список товаров / добавить / редактировать / цены / лоты

FSM-диалоги для каждого шага добавления.
─────────────────────────────────────────────────────────────────────────────
"""

import re
import uuid as _uuid

from aiogram import Bot, Router, F
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Game, Category, Product, ProductLot, DeliveryType, AdminUser
from bot.middlewares.admin_auth import require_permission

router = Router(name="admin:catalog")


# ── FSM States ────────────────────────────────────────────────────────────────


class AddGameFSM(StatesGroup):
    name = State()
    slug = State()
    description = State()
    image = State()
    confirm = State()


class EditGameFSM(StatesGroup):
    choose_field = State()
    enter_value = State()


class AddCategoryFSM(StatesGroup):
    game_id = State()
    name = State()
    slug = State()
    parent = State()
    image = State()
    confirm = State()


class AddProductFSM(StatesGroup):
    category_id = State()
    name = State()
    short_description = State()
    description = State()
    price = State()
    delivery_type = State()
    input_fields = State()
    stock = State()
    image = State()
    confirm = State()


class AddLotFSM(StatesGroup):
    product_id = State()
    name = State()
    price = State()
    original_price = State()
    quantity = State()
    badge = State()
    confirm = State()


# ── Helpers ───────────────────────────────────────────────────────────────────


def admin_back_btn(callback_data: str, text: str = "◀️ Назад") -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=callback_data)


def cancel_btn() -> InlineKeyboardButton:
    return InlineKeyboardButton(text="❌ Отмена", callback_data="admin:catalog:main")


def toggle_emoji(is_active: bool) -> str:
    return "✅" if is_active else "🔴"


# ── Games List ────────────────────────────────────────────────────────────────


@router.callback_query(F.data == "admin:catalog:games")
@require_permission("games.view")
async def admin_games_list(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    result = await db.execute(select(Game).order_by(Game.sort_order, Game.name))
    games = result.scalars().all()

    if not games:
        text = "🎮 <b>Игры</b>\n\nИгр пока нет."
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="➕ Добавить игру", callback_data="admin:game:add"
                    ),
                    admin_back_btn("admin:catalog:main"),
                ]
            ]
        )
    else:
        text = f"🎮 <b>Игры</b> ({len(games)} шт.)\n\nВыбери для управления:"
        buttons = []
        for game in games:
            buttons.append(
                [
                    InlineKeyboardButton(
                        text=f"{toggle_emoji(game.is_active)} {game.name}",
                        callback_data=f"admin:game:{game.id}",
                    )
                ]
            )
        buttons.append(
            [
                InlineKeyboardButton(
                    text="➕ Добавить игру", callback_data="admin:game:add"
                ),
                admin_back_btn("admin:catalog:main"),
            ]
        )
        keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await call.message.edit_text(text, reply_markup=keyboard)
    await call.answer()


# ── Game Detail ───────────────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:game:")
    & ~F.data.startswith("admin:game:add")
    & ~F.data.startswith("admin:game:toggle:")
    & ~F.data.startswith("admin:game:edit:")
    & ~F.data.startswith("admin:game:delete:")
    & ~F.data.startswith("admin:game:force_delete:")
)
@require_permission("games.view")
async def admin_game_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        game_id = _uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    # Количество категорий
    cat_result = await db.execute(select(Category).where(Category.game_id == game.id))
    categories_count = len(cat_result.scalars().all())

    text = (
        f"🎮 <b>{game.name}</b>\n\n"
        f"Slug: <code>{game.slug}</code>\n"
        f"Статус: {toggle_emoji(game.is_active)} {'Активна' if game.is_active else 'Скрыта'}\n"
        f"Категорий: {categories_count}\n"
        f"Описание: {(game.description or 'нет')[:100]}"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🔴 Скрыть" if game.is_active else "✅ Активировать",
                    callback_data=f"admin:game:toggle:{game.id}",
                ),
                InlineKeyboardButton(
                    text="✏️ Изменить", callback_data=f"admin:game:edit:{game.id}"
                ),
            ],
            [
                InlineKeyboardButton(
                    text=f"📂 Категории ({categories_count})",
                    callback_data=f"admin:categories:{game.id}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="🗑 Удалить", callback_data=f"admin:game:delete:{game.id}"
                ),
                admin_back_btn("admin:catalog:games"),
            ],
        ]
    )

    await call.message.edit_text(text, reply_markup=keyboard)
    from aiogram.exceptions import TelegramBadRequest
    try:
        await call.answer()
    except TelegramBadRequest:
        pass  # уже отвечено вызывающим хендлером


# ── Toggle Game Active ────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:game:toggle:"))
@require_permission("games.edit")
async def admin_game_toggle(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        game_id = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    game.is_active = not game.is_active
    await db.commit()

    status = "активирована ✅" if game.is_active else "скрыта 🔴"
    await call.answer(f"Игра {status}", show_alert=False)

    # Обновляем сообщение
    await admin_game_detail(call, db, admin)


# ── Add Game FSM ──────────────────────────────────────────────────────────────


@router.callback_query(F.data == "admin:game:add")
@require_permission("games.create")
async def admin_game_add_start(call: CallbackQuery, state: FSMContext, admin: AdminUser) -> None:
    await call.message.edit_text(
        "➕ <b>Добавление игры</b>\n\nШаг 1/4\n\nВведи <b>название</b> игры:\n"
        "<i>Пример: Brawl Stars</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[cancel_btn()]]),
    )
    await state.set_state(AddGameFSM.name)
    await call.answer()


@router.message(StateFilter(AddGameFSM.name))
async def admin_game_add_name(message: Message, state: FSMContext) -> None:
    name = message.text.strip()
    if len(name) < 2:
        await message.answer("❌ Название слишком короткое. Минимум 2 символа.")
        return

    # Авто-генерация slug (только a-z0-9, дефис)
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower().replace(" ", "-"))
    slug = re.sub(r"-+", "-", slug).strip("-")
    # Если имя полностью кириллическое/нелатинское — генерируем short UUID
    if not slug:
        slug = "game-" + _uuid.uuid4().hex[:8]

    await state.update_data(name=name, slug=slug)
    await message.answer(
        f"✅ Название: <b>{name}</b>\n\n"
        f"Шаг 2/4\n\nСлуг (URL-идентификатор):\n"
        f"Авто-генерация: <code>{slug}</code>\n\n"
        f"Отправь другой slug или нажми ✅ чтобы оставить авто:",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=f"✅ Оставить: {slug}",
                        callback_data="admin:game:add:slug_ok",
                    )
                ],
                [cancel_btn()],
            ]
        ),
    )
    await state.set_state(AddGameFSM.slug)


@router.callback_query(F.data == "admin:game:add:slug_ok", StateFilter(AddGameFSM.slug))
async def admin_game_add_slug_ok(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer()
    await _ask_game_description(call.message, state)


@router.message(StateFilter(AddGameFSM.slug))
async def admin_game_add_slug_custom(message: Message, state: FSMContext) -> None:

    slug = message.text.strip().lower()
    if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", slug):
        await message.answer(
            "❌ Неверный формат slug.\n"
            "Только строчные буквы, цифры и дефис. Пример: <code>brawl-stars</code>"
        )
        return
    await state.update_data(slug=slug)
    await _ask_game_description(message, state)


async def _ask_game_description(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await message.answer(
        "Шаг 3/4\n\nВведи <b>описание</b> игры (или пропусти):",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="⏭ Пропустить", callback_data="admin:game:add:skip_desc"
                    )
                ],
                [cancel_btn()],
            ]
        ),
    )
    await state.set_state(AddGameFSM.description)


@router.callback_query(
    F.data == "admin:game:add:skip_desc", StateFilter(AddGameFSM.description)
)
async def admin_game_skip_desc(call: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(description=None)
    await call.answer()
    await _ask_game_image(call.message, state)


@router.message(StateFilter(AddGameFSM.description))
async def admin_game_add_description(message: Message, state: FSMContext) -> None:
    await state.update_data(description=message.text.strip())
    await _ask_game_image(message, state)


async def _ask_game_image(message: Message, state: FSMContext) -> None:
    await message.answer(
        "Шаг 4/4\n\nОтправь <b>обложку игры</b> (фото) или пропусти:",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="⏭ Пропустить", callback_data="admin:game:add:skip_img"
                    )
                ],
                [cancel_btn()],
            ]
        ),
    )
    await state.set_state(AddGameFSM.image)


@router.callback_query(
    F.data == "admin:game:add:skip_img", StateFilter(AddGameFSM.image)
)
async def admin_game_skip_img(
    call: CallbackQuery, state: FSMContext, db: AsyncSession
) -> None:
    await state.update_data(image_url=None)
    await call.answer()
    await _confirm_game(call.message, state, db)


@router.message(StateFilter(AddGameFSM.image), F.photo)
async def admin_game_add_image(
    message: Message, state: FSMContext, db: AsyncSession, bot: Bot
) -> None:
    photo = message.photo[-1]
    try:
        file = await bot.get_file(photo.file_id)
        image_url = f"https://api.telegram.org/file/bot{bot.token}/{file.file_path}"
    except Exception:
        image_url = None
    await state.update_data(image_url=image_url)
    await _confirm_game(message, state, db)


async def _confirm_game(message: Message, state: FSMContext, db: AsyncSession) -> None:
    data = await state.get_data()
    text = (
        f"📋 <b>Подтверждение</b>\n\n"
        f"Название: <b>{data['name']}</b>\n"
        f"Slug: <code>{data['slug']}</code>\n"
        f"Описание: {data.get('description') or '—'}\n"
        f"Обложка: {'✅ загружена' if data.get('image_url') else '—'}\n\n"
        f"Статус после создания: 🔴 Скрыта (активируешь вручную)\n\n"
        f"Создать игру?"
    )
    await message.answer(
        text,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="✅ Создать", callback_data="admin:game:add:save"
                    ),
                    InlineKeyboardButton(
                        text="❌ Отмена", callback_data="admin:catalog:games"
                    ),
                ]
            ]
        ),
    )
    await state.set_state(AddGameFSM.confirm)


@router.callback_query(F.data == "admin:game:add:save", StateFilter(AddGameFSM.confirm))
@require_permission("games.create")
async def admin_game_save(
    call: CallbackQuery, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    data = await state.get_data()

    # Проверяем уникальность slug
    existing = await db.execute(select(Game).where(Game.slug == data["slug"]))
    if existing.scalar_one_or_none():
        await call.answer(f"❌ Slug '{data['slug']}' уже занят!", show_alert=True)
        return

    game = Game(
        name=data["name"],
        slug=data["slug"],
        description=data.get("description"),
        image_url=data.get("image_url"),
        is_active=False,  # Создаём неактивной
    )
    db.add(game)
    try:
        await db.commit()
        await db.refresh(game)
    except Exception as e:
        await db.rollback()
        err_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        await call.answer(f"❌ Ошибка БД: {err_msg[:200]}", show_alert=True)
        return

    await state.clear()

    # Лог действия
    from bot.utils.admin_log import log_admin_action

    await log_admin_action(
        db,
        admin,
        "game.create",
        "game",
        game.id,
        after_data={"name": game.name, "slug": game.slug},
    )
    await db.commit()

    await call.message.edit_text(
        f"✅ Игра <b>{game.name}</b> создана!\n\n"
        f"Статус: 🔴 Скрыта\n"
        f"Активируй когда будешь готов.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="✅ Активировать сейчас",
                        callback_data=f"admin:game:toggle:{game.id}",
                    )
                ],
                [
                    InlineKeyboardButton(
                        text="📂 Добавить категории",
                        callback_data=f"admin:categories:{game.id}",
                    )
                ],
                [admin_back_btn("admin:catalog:games")],
            ]
        ),
    )
    await call.answer("✅ Игра создана!")


# ── Categories ────────────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:categories:"))
@require_permission("categories.view")
async def admin_categories_list(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        game_id = _uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    result = await db.execute(
        select(Category)
        .where(Category.game_id == game.id, Category.parent_id == None)
        .order_by(Category.sort_order, Category.name)
    )
    categories = result.scalars().all()

    text = f"📂 <b>Категории — {game.name}</b> ({len(categories)} шт.)\n\nВыбери для управления:"
    buttons = []
    for cat in categories:
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"{toggle_emoji(cat.is_active)} {cat.name}",
                    callback_data=f"admin:category:{cat.id}",
                )
            ]
        )

    buttons.append(
        [
            InlineKeyboardButton(
                text="➕ Добавить категорию",
                callback_data=f"admin:category:add:{game_id}",
            ),
            admin_back_btn(f"admin:game:{game_id}"),
        ]
    )

    await call.message.edit_text(
        text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons)
    )
    await call.answer()


# ── Add Category FSM ──────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:category:add:"))
@require_permission("categories.create")
async def admin_category_add_start(call: CallbackQuery, state: FSMContext, admin: AdminUser) -> None:
    game_id = call.data.split(":")[3]
    await state.update_data(game_id=game_id)
    await call.message.edit_text(
        "➕ <b>Добавление категории</b>\n\nВведи <b>название</b>:\n"
        "<i>Например: Гемы, Скины, Батл-пасс</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[cancel_btn()]]),
    )
    await state.set_state(AddCategoryFSM.name)
    await call.answer()


@router.message(StateFilter(AddCategoryFSM.name))
async def admin_category_add_name(
    message: Message, state: FSMContext, db: AsyncSession
) -> None:
    name = message.text.strip()

    slug = re.sub(r"[^a-z0-9-]", "-", name.lower().replace(" ", "-"))
    slug = re.sub(r"-+", "-", slug).strip("-")

    await state.update_data(name=name, slug=slug)

    # Предлагаем выбрать родительскую категорию или пропустить
    data = await state.get_data()
    game_id = data["game_id"]
    result = await db.execute(
        select(Category)
        .where(Category.game_id == game_id, Category.parent_id == None)
        .order_by(Category.name)
    )
    parents = result.scalars().all()

    if parents:
        buttons = [
            [
                InlineKeyboardButton(
                    text="⏭ Без родителя (корневая)",
                    callback_data="admin:cat:add:no_parent",
                )
            ]
        ]
        for p in parents:
            buttons.append(
                [
                    InlineKeyboardButton(
                        text=f"📁 {p.name}",
                        callback_data=f"admin:cat:add:parent:{p.id}",
                    )
                ]
            )
        buttons.append([cancel_btn()])
        await message.answer(
            "Выбери <b>родительскую категорию</b> или оставь как корневую:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        )
        await state.set_state(AddCategoryFSM.parent)
    else:
        await state.update_data(parent_id=None)
        await _save_category(message, state, db)


@router.callback_query(
    F.data == "admin:cat:add:no_parent",
    StateFilter(AddCategoryFSM.parent),
)
async def admin_cat_no_parent(
    call: CallbackQuery, state: FSMContext, db: AsyncSession
) -> None:
    await state.update_data(parent_id=None)
    await call.answer()
    await _save_category(call.message, state, db)


@router.callback_query(
    F.data.startswith("admin:cat:add:parent:"),
    StateFilter(AddCategoryFSM.parent),
)
async def admin_cat_set_parent(
    call: CallbackQuery, state: FSMContext, db: AsyncSession
) -> None:
    parent_id = call.data.split(":")[4]
    await state.update_data(parent_id=parent_id)
    await call.answer()
    await _save_category(call.message, state, db)


# ── Edit Game (stub) ──────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:game:edit:"))
@require_permission("games.edit")
async def admin_game_edit_stub(
    call: CallbackQuery, admin: AdminUser
) -> None:
    await call.answer(
        "✏️ Редактирование игры — доступно через Mini App (этап 5).",
        show_alert=True,
    )


# ── Delete Game ───────────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:game:delete:"))
@require_permission("games.edit")
async def admin_game_delete(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        game_id = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    from shared.models import Category as Cat, Product, OrderItem
    product_count_result = await db.execute(
        select(func.count(Product.id))
        .join(Cat, Product.category_id == Cat.id)
        .where(Cat.game_id == game.id)
    )
    product_count = product_count_result.scalar_one()

    if product_count > 0:
        # Проверяем есть ли заказы с товарами этой игры
        orders_count_result = await db.execute(
            select(func.count(OrderItem.id))
            .join(Product, OrderItem.product_id == Product.id)
            .join(Cat, Product.category_id == Cat.id)
            .where(Cat.game_id == game.id)
        )
        orders_count = orders_count_result.scalar_one()
        if orders_count > 0:
            await call.answer(
                f"❌ Нельзя удалить — в игре {orders_count} позиций в заказах. "
                f"Удаление невозможно из-за истории заказов.",
                show_alert=True,
            )
            return
        # Есть товары, но нет заказов — предлагаем принудительное удаление
        await call.message.edit_text(
            f"⚠️ <b>Игра «{game.name}»</b>\n\n"
            f"В игре есть <b>{product_count} товаров</b>.\n"
            f"Они будут удалены вместе с игрой.\n\n"
            f"Подтвердить удаление?",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="🗑 Да, удалить всё",
                            callback_data=f"admin:game:force_delete:{game_id}",
                        ),
                    ],
                    [admin_back_btn(f"admin:game:{game_id}")],
                ]
            ),
        )
        await call.answer()
        return

    game_name = game.name
    await db.delete(game)
    await db.commit()
    await call.answer(f"🗑 Игра «{game_name}» удалена")
    await call.message.edit_text(
        f"✅ Игра <b>{game_name}</b> удалена.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[admin_back_btn("admin:catalog:games")]]
        ),
    )


# ── Force Delete Game ─────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:game:force_delete:"))
@require_permission("games.edit")
async def admin_game_force_delete(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        game_id = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID игры", show_alert=True)
        return
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    from shared.models import Category as Cat, Product

    # Удаляем все товары в категориях этой игры (лоты/ключи каскадятся на уровне БД)
    products_result = await db.execute(
        select(Product)
        .join(Cat, Product.category_id == Cat.id)
        .where(Cat.game_id == game.id)
    )
    products = products_result.scalars().all()
    for product in products:
        await db.delete(product)

    # Сбрасываем changes до удаления игры
    await db.flush()

    game_name = game.name
    await db.delete(game)
    await db.commit()

    await call.answer(f"🗑 Игра «{game_name}» и все товары удалены")
    await call.message.edit_text(
        f"✅ Игра <b>{game_name}</b> удалена вместе со всеми товарами.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[admin_back_btn("admin:catalog:games")]]
        ),
    )


# ── Category Detail (stub) ────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:category:")
    & ~F.data.startswith("admin:category:add:")
    & ~F.data.startswith("admin:category:toggle:")
)
@require_permission("categories.view")
async def admin_category_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        cat_id = _uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID категории", show_alert=True)
        return
    cat = await db.get(Category, cat_id)
    if not cat:
        await call.answer("Категория не найдена", show_alert=True)
        return

    products_result = await db.execute(
        select(func.count(Product.id)).where(Product.category_id == cat_id)
    )
    products_count = products_result.scalar_one()

    await call.message.edit_text(
        f"📂 <b>{cat.name}</b>\n\n"
        f"Товаров: {products_count}\n"
        f"Статус: {toggle_emoji(cat.is_active)} {'Активна' if cat.is_active else 'Скрыта'}",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🔴 Скрыть" if cat.is_active else "✅ Активировать",
                        callback_data=f"admin:category:toggle:{cat.id}",
                    ),
                ],
                [
                    InlineKeyboardButton(
                        text=f"📦 Товары ({products_count})",
                        callback_data=f"admin:products:{cat.id}",
                    ),
                ],
                [admin_back_btn(f"admin:categories:{cat.game_id}")],
            ]
        ),
    )
    from aiogram.exceptions import TelegramBadRequest
    try:
        await call.answer()
    except TelegramBadRequest:
        pass


@router.callback_query(F.data.startswith("admin:category:toggle:"))
@require_permission("categories.edit")
async def admin_category_toggle(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        cat_id = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID категории", show_alert=True)
        return
    cat = await db.get(Category, cat_id)
    if not cat:
        await call.answer("Не найдена", show_alert=True)
        return
    cat.is_active = not cat.is_active
    await db.commit()
    status = "активирована ✅" if cat.is_active else "скрыта 🔴"
    await call.answer(f"Категория {status}")

    # Refresh UI — подменяем call.data чтобы detail корректно распарсил id
    products_result = await db.execute(
        select(func.count(Product.id)).where(Product.category_id == cat_id)
    )
    products_count = products_result.scalar_one()
    from aiogram.exceptions import TelegramBadRequest
    try:
        await call.message.edit_text(
            f"📂 <b>{cat.name}</b>\n\n"
            f"Товаров: {products_count}\n"
            f"Статус: {toggle_emoji(cat.is_active)} {'Активна' if cat.is_active else 'Скрыта'}",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text="🔴 Скрыть" if cat.is_active else "✅ Активировать",
                    callback_data=f"admin:category:toggle:{cat.id}",
                )],
                [InlineKeyboardButton(
                    text=f"📦 Товары ({products_count})",
                    callback_data=f"admin:products:{cat.id}",
                )],
                [admin_back_btn(f"admin:categories:{cat.game_id}")],
            ]),
        )
    except TelegramBadRequest:
        pass


# ── Products List ─────────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:products:"))
@require_permission("products.view")
async def admin_products_list(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        cat_id = _uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID категории", show_alert=True)
        return
    cat = await db.get(Category, cat_id)
    if not cat:
        await call.answer("Категория не найдена", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .where(Product.category_id == cat_id)
        .order_by(Product.sort_order, Product.name)
    )
    products = result.scalars().all()

    text = f"📦 <b>Товары — {cat.name}</b> ({len(products)} шт.)"
    buttons = [
        [InlineKeyboardButton(
            text=f"{toggle_emoji(p.is_active)} {p.name} — {p.price} ₽",
            callback_data=f"admin:product:{p.id}",
        )]
        for p in products
    ]
    buttons.append([InlineKeyboardButton(
        text="➕ Добавить товар", callback_data=f"admin:product:add:{cat_id}",
    )])
    buttons.append([admin_back_btn(f"admin:category:{cat_id}")])
    await call.message.edit_text(
        text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons)
    )
    await call.answer()


# ── Add Product FSM ───────────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:product:add:")
    & ~F.data.startswith("admin:product:add:skip")
    & ~F.data.startswith("admin:product:add:delivery")
    & ~F.data.startswith("admin:product:add:save")
)
@require_permission("products.create")
async def admin_product_add_start(
    call: CallbackQuery, state: FSMContext, admin: AdminUser
) -> None:
    cat_id = call.data.split(":")[3]
    await state.update_data(category_id=cat_id)
    await call.message.edit_text(
        "➕ <b>Добавление товара</b>\n\nШаг 1/5\n\nВведи <b>название</b>:\n"
        "<i>Пример: Гемы Brawl Stars, Battle Pass Season 1</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[cancel_btn()]]),
    )
    await state.set_state(AddProductFSM.name)
    await call.answer()


@router.message(StateFilter(AddProductFSM.name))
async def admin_product_name(message: Message, state: FSMContext) -> None:
    name = message.text.strip()
    if len(name) < 2:
        await message.answer("❌ Слишком короткое название. Минимум 2 символа.")
        return
    await state.update_data(name=name)
    await message.answer(
        f"Название: <b>{name}</b>\n\nШаг 2/5\n\nВведи <b>краткое описание</b> или пропусти:\n"
        "<i>Пример: Внутриигровая валюта для Brawl Stars</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⏭ Пропустить", callback_data="admin:product:add:skip_sdesc")],
            [cancel_btn()],
        ]),
    )
    await state.set_state(AddProductFSM.short_description)


@router.callback_query(F.data == "admin:product:add:skip_sdesc", StateFilter(AddProductFSM.short_description))
async def admin_product_skip_sdesc(call: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(short_description=None)
    await call.answer()
    await _ask_product_price(call.message, state)


@router.message(StateFilter(AddProductFSM.short_description))
async def admin_product_sdesc(message: Message, state: FSMContext) -> None:
    await state.update_data(short_description=message.text.strip())
    await _ask_product_price(message, state)


async def _ask_product_price(message: Message, state: FSMContext) -> None:
    await message.answer(
        "Шаг 3/5\n\nВведи <b>базовую цену</b> в рублях:\n"
        "<i>Если товар продаётся лотами — укажи минимальную цену лота.</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[cancel_btn()]]),
    )
    await state.set_state(AddProductFSM.price)


@router.message(StateFilter(AddProductFSM.price))
async def admin_product_price(message: Message, state: FSMContext) -> None:
    try:
        price = float(message.text.replace(",", "."))
        if price <= 0:
            raise ValueError
    except ValueError:
        await message.answer("❌ Введи корректную цену (положительное число)")
        return
    await state.update_data(price=price)
    await message.answer(
        "Шаг 4/5\n\n<b>Тип доставки</b>:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🤖 Авто (ключ/код из БД)", callback_data="admin:product:add:delivery:auto")],
            [InlineKeyboardButton(text="👤 Вручную (оператор выдаёт)", callback_data="admin:product:add:delivery:manual")],
            [cancel_btn()],
        ]),
    )
    await state.set_state(AddProductFSM.delivery_type)


@router.callback_query(F.data.startswith("admin:product:add:delivery:"), StateFilter(AddProductFSM.delivery_type))
async def admin_product_delivery(call: CallbackQuery, state: FSMContext) -> None:
    dtype = call.data.split(":")[4]
    await state.update_data(delivery_type=dtype)
    await call.answer()
    await message_ask_product_image(call.message, state)


async def message_ask_product_image(message: Message, state: FSMContext) -> None:
    await message.answer(
        "Шаг 5/5\n\nОтправь <b>изображение</b> товара или пропусти:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⏭ Пропустить", callback_data="admin:product:add:skip_img")],
            [cancel_btn()],
        ]),
    )
    await state.set_state(AddProductFSM.image)


@router.callback_query(F.data == "admin:product:add:skip_img", StateFilter(AddProductFSM.image))
async def admin_product_skip_img(call: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(image_url=None)
    await call.answer()
    await _confirm_product(call.message, state)


@router.message(StateFilter(AddProductFSM.image), F.photo)
async def admin_product_image(message: Message, state: FSMContext, bot: Bot) -> None:
    photo = message.photo[-1]
    try:
        file = await bot.get_file(photo.file_id)
        image_url = f"https://api.telegram.org/file/bot{bot.token}/{file.file_path}"
    except Exception:
        image_url = None
    await state.update_data(image_url=image_url)
    await _confirm_product(message, state)


async def _confirm_product(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    dtype_label = "🤖 Авто" if data.get("delivery_type") == "auto" else "👤 Вручную"
    text = (
        f"📋 <b>Подтверждение</b>\n\n"
        f"Название: <b>{data['name']}</b>\n"
        f"Краткое описание: {data.get('short_description') or '—'}\n"
        f"Цена: <b>{data['price']} ₽</b>\n"
        f"Доставка: {dtype_label}\n"
        f"Изображение: {'✅ загружено' if data.get('image_url') else '—'}\n\n"
        f"Статус после создания: 🔴 Скрыт\n\n"
        f"Создать товар?"
    )
    await message.answer(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="✅ Создать", callback_data="admin:product:add:save"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="admin:catalog:main"),
        ]]),
    )
    await state.set_state(AddProductFSM.confirm)


@router.callback_query(F.data == "admin:product:add:save", StateFilter(AddProductFSM.confirm))
@require_permission("products.create")
async def admin_product_save(
    call: CallbackQuery, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    from decimal import Decimal
    from bot.utils.admin_log import log_admin_action

    data = await state.get_data()
    await state.clear()

    images = [data["image_url"]] if data.get("image_url") else []
    product = Product(
        category_id=_uuid.UUID(data["category_id"]),
        name=data["name"],
        short_description=data.get("short_description"),
        price=Decimal(str(data["price"])),
        delivery_type=data.get("delivery_type", "manual"),
        images=images,
        is_active=False,
    )
    db.add(product)
    try:
        await db.commit()
        await db.refresh(product)
    except Exception as e:
        await db.rollback()
        err_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        await call.answer(f"❌ Ошибка БД: {err_msg[:200]}", show_alert=True)
        return

    await log_admin_action(
        db, admin, "product.create", "product", product.id,
        after_data={"name": product.name, "price": str(product.price)},
    )
    await db.commit()

    await call.message.edit_text(
        f"✅ Товар <b>{product.name}</b> создан!\n\n"
        f"Статус: 🔴 Скрыт. Добавь лоты с ценами, затем активируй.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ Добавить лот", callback_data=f"admin:lot:add:{product.id}")],
            [InlineKeyboardButton(text="✅ Активировать сейчас", callback_data=f"admin:product:toggle:{product.id}")],
            [admin_back_btn(f"admin:products:{data['category_id']}")],
        ]),
    )
    await call.answer("✅ Товар создан!")


# ── Product Detail ─────────────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:product:")
    & ~F.data.startswith("admin:product:add")
    & ~F.data.startswith("admin:product:toggle:")
)
@require_permission("products.view")
async def admin_product_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        product_id = _uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID товара", show_alert=True)
        return

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.lots))
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        await call.answer("Товар не найден", show_alert=True)
        return

    await _render_product_detail(call.message, product)
    from aiogram.exceptions import TelegramBadRequest
    try:
        await call.answer()
    except TelegramBadRequest:
        pass


async def _render_product_detail(message: Message, product: Product) -> None:
    dtype_label = "🤖 Авто" if product.delivery_type == DeliveryType.auto else "👤 Вручную"
    text = (
        f"📦 <b>{product.name}</b>\n\n"
        f"Цена: {product.price} ₽\n"
        f"Доставка: {dtype_label}\n"
        f"Статус: {toggle_emoji(product.is_active)} {'Активен' if product.is_active else 'Скрыт'}"
    )
    lot_buttons = [
        [InlineKeyboardButton(
            text=f"{toggle_emoji(l.is_active)} {l.name} — {l.price} ₽",
            callback_data=f"admin:lot:{l.id}",
        )]
        for l in product.lots
    ]
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🔴 Скрыть" if product.is_active else "✅ Активировать",
            callback_data=f"admin:product:toggle:{product.id}",
        )],
        *lot_buttons,
        [InlineKeyboardButton(text="➕ Добавить лот", callback_data=f"admin:lot:add:{product.id}")],
        [admin_back_btn(f"admin:products:{product.category_id}")],
    ])
    await message.edit_text(text, reply_markup=keyboard)


@router.callback_query(F.data.startswith("admin:product:toggle:"))
@require_permission("products.edit")
async def admin_product_toggle(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        product_id = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID товара", show_alert=True)
        return
    product = await db.get(Product, product_id)
    if not product:
        await call.answer("Товар не найден", show_alert=True)
        return
    product.is_active = not product.is_active
    await db.commit()
    status = "активирован ✅" if product.is_active else "скрыт 🔴"
    await call.answer(f"Товар {status}")

    result = await db.execute(
        select(Product).options(selectinload(Product.lots)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    from aiogram.exceptions import TelegramBadRequest
    try:
        await _render_product_detail(call.message, product)
    except TelegramBadRequest:
        pass


# ── Add Lot FSM ────────────────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:lot:add:")
    & ~F.data.startswith("admin:lot:add:skip")
    & ~F.data.startswith("admin:lot:add:badge")
)
@require_permission("products.edit")
async def admin_lot_add_start(
    call: CallbackQuery, state: FSMContext, admin: AdminUser
) -> None:
    product_id = call.data.split(":")[3]
    await state.update_data(product_id=product_id)
    await call.message.edit_text(
        "➕ <b>Добавление лота</b>\n\nШаг 1/4\n\nВведи <b>название лота</b>:\n"
        "<i>Пример: 80 гемов, 170 гемов, Battle Pass</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[cancel_btn()]]),
    )
    await state.set_state(AddLotFSM.name)
    await call.answer()


@router.message(StateFilter(AddLotFSM.name))
async def admin_lot_name(message: Message, state: FSMContext) -> None:
    name = message.text.strip()
    if not name:
        await message.answer("❌ Введи название лота")
        return
    await state.update_data(name=name)
    await message.answer(
        f"Лот: <b>{name}</b>\n\nШаг 2/4\n\nВведи <b>цену</b> в рублях:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[cancel_btn()]]),
    )
    await state.set_state(AddLotFSM.price)


@router.message(StateFilter(AddLotFSM.price))
async def admin_lot_price(message: Message, state: FSMContext) -> None:
    try:
        price = float(message.text.replace(",", "."))
        if price <= 0:
            raise ValueError
    except ValueError:
        await message.answer("❌ Введи корректную цену")
        return
    await state.update_data(price=price)
    await message.answer(
        "Шаг 3/4\n\nВведи <b>старую цену</b> (перечёркнутая в UI) или пропусти:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⏭ Без старой цены", callback_data="admin:lot:add:skip_orig")],
            [cancel_btn()],
        ]),
    )
    await state.set_state(AddLotFSM.original_price)


@router.callback_query(F.data == "admin:lot:add:skip_orig", StateFilter(AddLotFSM.original_price))
async def admin_lot_skip_orig(call: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(original_price=None)
    await call.answer()
    await _ask_lot_badge(call.message, state)


@router.message(StateFilter(AddLotFSM.original_price))
async def admin_lot_orig_price(message: Message, state: FSMContext) -> None:
    try:
        price = float(message.text.replace(",", "."))
        if price <= 0:
            raise ValueError
    except ValueError:
        await message.answer("❌ Введи корректную цену")
        return
    await state.update_data(original_price=price)
    await _ask_lot_badge(message, state)


async def _ask_lot_badge(message: Message, state: FSMContext) -> None:
    await message.answer(
        "Шаг 4/4\n\n<b>Бейдж</b> (ярлык на лоте) или пропусти:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="🔥 ХИТ", callback_data="admin:lot:add:badge:ХИТ"),
                InlineKeyboardButton(text="💰 ВЫГОДНО", callback_data="admin:lot:add:badge:ВЫГОДНО"),
            ],
            [
                InlineKeyboardButton(text="🆕 NEW", callback_data="admin:lot:add:badge:NEW"),
                InlineKeyboardButton(text="⏭ Без бейджа", callback_data="admin:lot:add:badge:none"),
            ],
        ]),
    )
    await state.set_state(AddLotFSM.badge)


@router.callback_query(F.data.startswith("admin:lot:add:badge:"), StateFilter(AddLotFSM.badge))
async def admin_lot_badge(
    call: CallbackQuery, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    badge_val = call.data.split(":")[4]
    badge = None if badge_val == "none" else badge_val
    await state.update_data(badge=badge)
    await call.answer()
    await _save_lot(call, state, db, admin)


async def _save_lot(
    call: CallbackQuery, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    from decimal import Decimal
    from bot.utils.admin_log import log_admin_action

    data = await state.get_data()
    await state.clear()

    lot = ProductLot(
        product_id=_uuid.UUID(data["product_id"]),
        name=data["name"],
        price=Decimal(str(data["price"])),
        original_price=Decimal(str(data["original_price"])) if data.get("original_price") else None,
        quantity=1,
        badge=data.get("badge"),
        is_active=True,
    )
    db.add(lot)
    try:
        await db.commit()
        await db.refresh(lot)
    except Exception as e:
        await db.rollback()
        err_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        await call.answer(f"❌ Ошибка БД: {err_msg[:200]}", show_alert=True)
        return

    await log_admin_action(
        db, admin, "lot.create", "product_lot", lot.id,
        after_data={"name": lot.name, "price": str(lot.price)},
    )
    await db.commit()

    orig_str = f" (было {data['original_price']} ₽)" if data.get("original_price") else ""
    badge_str = f" [{lot.badge}]" if lot.badge else ""
    await call.message.edit_text(
        f"✅ Лот добавлен!\n\n"
        f"<b>{lot.name}</b> — {lot.price} ₽{orig_str}{badge_str}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ Ещё лот", callback_data=f"admin:lot:add:{data['product_id']}")],
            [admin_back_btn(f"admin:product:{data['product_id']}")],
        ]),
    )


# ── Lot Detail ─────────────────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:lot:")
    & ~F.data.startswith("admin:lot:add:")
    & ~F.data.startswith("admin:lot:toggle:")
)
@require_permission("products.view")
async def admin_lot_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        lot_id = _uuid.UUID(call.data.split(":")[2])
    except ValueError:
        await call.answer("Некорректный ID лота", show_alert=True)
        return
    lot = await db.get(ProductLot, lot_id)
    if not lot:
        await call.answer("Лот не найден", show_alert=True)
        return

    await _render_lot_detail(call.message, lot)
    from aiogram.exceptions import TelegramBadRequest
    try:
        await call.answer()
    except TelegramBadRequest:
        pass


async def _render_lot_detail(message: Message, lot: ProductLot) -> None:
    orig_str = f"\nСтарая цена: {lot.original_price} ₽" if lot.original_price else ""
    badge_str = f"\nБейдж: {lot.badge}" if lot.badge else ""
    text = (
        f"📦 <b>Лот: {lot.name}</b>\n\n"
        f"Цена: {lot.price} ₽{orig_str}{badge_str}\n"
        f"Статус: {toggle_emoji(lot.is_active)} {'Активен' if lot.is_active else 'Скрыт'}"
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🔴 Скрыть" if lot.is_active else "✅ Активировать",
            callback_data=f"admin:lot:toggle:{lot.id}",
        )],
        [admin_back_btn(f"admin:product:{lot.product_id}")],
    ])
    await message.edit_text(text, reply_markup=keyboard)


@router.callback_query(F.data.startswith("admin:lot:toggle:"))
@require_permission("products.edit")
async def admin_lot_toggle(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    try:
        lot_id = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID лота", show_alert=True)
        return
    lot = await db.get(ProductLot, lot_id)
    if not lot:
        await call.answer("Лот не найден", show_alert=True)
        return
    lot.is_active = not lot.is_active
    await db.commit()
    status = "активирован ✅" if lot.is_active else "скрыт 🔴"
    await call.answer(f"Лот {status}")
    from aiogram.exceptions import TelegramBadRequest
    try:
        await _render_lot_detail(call.message, lot)
    except TelegramBadRequest:
        pass


async def _save_category(message: Message, state: FSMContext, db: AsyncSession) -> None:
    data = await state.get_data()

    cat = Category(
        game_id=data["game_id"],
        parent_id=data.get("parent_id"),
        name=data["name"],
        slug=data["slug"],
        is_active=True,
    )
    db.add(cat)
    await db.commit()
    await state.clear()

    await message.answer(
        f"✅ Категория <b>{cat.name}</b> создана!\n\nТеперь добавь товары:",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="➕ Добавить товар",
                        callback_data=f"admin:product:add:{cat.id}",
                    )
                ],
                [admin_back_btn(f"admin:categories:{data['game_id']}")],
            ]
        ),
    )
