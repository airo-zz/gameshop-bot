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

from aiogram import Router, F
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Game, Category, AdminUser
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
)
@require_permission("games.view")
async def admin_game_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    game_id = call.data.split(":")[2]
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
    await call.answer()


# ── Toggle Game Active ────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin:game:toggle:"))
@require_permission("games.edit")
async def admin_game_toggle(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    game_id = call.data.split(":")[3]
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
async def admin_game_add_start(call: CallbackQuery, state: FSMContext) -> None:
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

    # Авто-генерация slug

    slug = re.sub(r"[^a-z0-9-]", "-", name.lower().replace(" ", "-"))
    slug = re.sub(r"-+", "-", slug).strip("-")

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
    message: Message, state: FSMContext, db: AsyncSession
) -> None:
    # Берём наибольшее фото
    photo = message.photo[-1]
    await state.update_data(image_url=photo.file_id)
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
    await db.commit()
    await db.refresh(game)

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
    game_id = call.data.split(":")[2]
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
async def admin_category_add_start(call: CallbackQuery, state: FSMContext) -> None:
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
    game_id = call.data.split(":")[3]
    game = await db.get(Game, game_id)
    if not game:
        await call.answer("Игра не найдена", show_alert=True)
        return

    await db.delete(game)
    await call.answer(f"🗑 Игра «{game.name}» удалена")
    await call.message.edit_text(
        f"✅ Игра <b>{game.name}</b> удалена.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[admin_back_btn("admin:catalog:games")]]
        ),
    )


# ── Category Detail (stub) ────────────────────────────────────────────────────


@router.callback_query(
    F.data.startswith("admin:category:")
    & ~F.data.startswith("admin:category:add:")
)
@require_permission("categories.view")
async def admin_category_detail(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    cat_id = call.data.split(":")[2]
    from shared.models import Category as Cat
    cat = await db.get(Cat, cat_id)
    if not cat:
        await call.answer("Категория не найдена", show_alert=True)
        return
    await call.message.edit_text(
        f"📂 <b>{cat.name}</b>\n\n"
        f"Статус: {toggle_emoji(cat.is_active)} {'Активна' if cat.is_active else 'Скрыта'}",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🔴 Скрыть" if cat.is_active else "✅ Активировать",
                        callback_data=f"admin:category:toggle:{cat.id}",
                    ),
                ],
                [admin_back_btn(f"admin:categories:{cat.game_id}")],
            ]
        ),
    )
    await call.answer()


@router.callback_query(F.data.startswith("admin:category:toggle:"))
@require_permission("categories.edit")
async def admin_category_toggle(
    call: CallbackQuery, db: AsyncSession, admin: AdminUser
) -> None:
    cat_id = call.data.split(":")[3]
    from shared.models import Category as Cat
    cat = await db.get(Cat, cat_id)
    if not cat:
        await call.answer("Не найдена", show_alert=True)
        return
    cat.is_active = not cat.is_active
    status = "активирована ✅" if cat.is_active else "скрыта 🔴"
    await call.answer(f"Категория {status}")
    await admin_category_detail(call, db, admin)


# ── Add Product (stub — сообщение что функция в разработке) ──────────────────


@router.callback_query(F.data.startswith("admin:product:add:"))
@require_permission("products.create")
async def admin_product_add_stub(
    call: CallbackQuery, admin: AdminUser
) -> None:
    await call.answer(
        "➕ Добавление товаров доступно через Mini App (этап 5).",
        show_alert=True,
    )


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
