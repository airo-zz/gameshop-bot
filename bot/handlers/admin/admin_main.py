"""
bot/handlers/admin/admin_main.py
─────────────────────────────────────────────────────────────────────────────
Главное меню администратора.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

from shared.models import AdminUser, AdminRole
from bot.utils.texts import texts

router = Router(name="admin:main")

ROLE_EMOJI = {
    AdminRole.owner: "👑",
    AdminRole.admin: "⚙️",
    AdminRole.manager: "📊",
    AdminRole.operator: "🎧",
    AdminRole.content: "📝",
}


def get_admin_menu(admin: AdminUser) -> InlineKeyboardMarkup:
    """Меню с кнопками в зависимости от роли."""
    buttons = []

    if admin.has_permission("games.view"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="🎮 Игры и каталог", callback_data="admin:catalog:games"
                ),
            ]
        )

    if admin.has_permission("orders.view"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="📋 Заказы", callback_data="admin:orders:list"
                ),
                InlineKeyboardButton(
                    text="🔍 Найти заказ", callback_data="admin:orders:search"
                ),
            ]
        )

    if admin.has_permission("users.view"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="👥 Пользователи", callback_data="admin:users:list"
                ),
            ]
        )

    if admin.has_permission("discounts.*"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="💸 Скидки", callback_data="admin:discounts:list"
                ),
                InlineKeyboardButton(
                    text="🏷 Промокоды", callback_data="admin:promos:list"
                ),
            ]
        )

    if admin.has_permission("support.*"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="🆘 Тикеты", callback_data="admin:tickets:list"
                ),
            ]
        )

    if admin.has_permission("analytics.view"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="📊 Статистика", callback_data="admin:stats:main"
                ),
            ]
        )

    if admin.has_permission("*"):
        buttons.append(
            [
                InlineKeyboardButton(
                    text="⚙️ Настройки", callback_data="admin:settings:main"
                ),
                InlineKeyboardButton(
                    text="👮 Администраторы", callback_data="admin:admins:list"
                ),
            ]
        )

    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(CommandStart())
async def admin_start(message: Message, admin: AdminUser) -> None:
    role_emoji = ROLE_EMOJI.get(admin.role, "👤")
    await message.answer(
        texts.admin_panel_header(
            admin.first_name or "Admin",
            role_emoji,
            admin.role.value.capitalize(),
        ),
        reply_markup=get_admin_menu(admin),
    )


@router.callback_query(F.data == "admin:catalog:main")
async def admin_catalog_main(call: CallbackQuery, admin: AdminUser) -> None:
    await call.message.edit_text(
        texts.admin_catalog_header,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🎮 Игры", callback_data="admin:catalog:games"
                    )
                ],
                [
                    InlineKeyboardButton(
                        text="◀️ Главное меню", callback_data="admin:main"
                    )
                ],
            ]
        ),
    )
    await call.answer()


@router.callback_query(F.data == "admin:main")
async def admin_back_to_main(call: CallbackQuery, admin: AdminUser) -> None:
    role_emoji = ROLE_EMOJI.get(admin.role, "👤")
    await call.message.edit_text(
        texts.admin_panel_short(role_emoji, admin.role.value.capitalize()),
        reply_markup=get_admin_menu(admin),
    )
    await call.answer()


@router.callback_query(F.data == "admin:tickets:list")
async def admin_tickets_list_stub(call: CallbackQuery, admin: AdminUser) -> None:
    await call.answer("🆘 Управление тикетами — в разработке.", show_alert=True)


@router.callback_query(F.data == "admin:settings:main")
async def admin_settings_stub(call: CallbackQuery, admin: AdminUser) -> None:
    await call.answer("⚙️ Настройки — в разработке.", show_alert=True)


@router.callback_query(F.data == "admin:admins:list")
async def admin_admins_stub(call: CallbackQuery, admin: AdminUser) -> None:
    await call.answer("👮 Управление администраторами — в разработке.", show_alert=True)
