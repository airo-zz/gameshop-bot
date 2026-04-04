"""
bot/handlers/admin/admin_discounts.py
─────────────────────────────────────────────────────────────────────────────
Управление скидками и промокодами в admin-боте.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router, F
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery, Message,
    InlineKeyboardMarkup, InlineKeyboardButton,
)
import uuid as _uuid

from aiogram.exceptions import TelegramBadRequest
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AdminUser, DiscountRule, DiscountType, DiscountValueType, PromoCode
from bot.middlewares.admin_auth import require_permission
from bot.utils.admin_log import log_admin_action

router = Router(name="admin:discounts")


class AddPromoFSM(StatesGroup):
    code         = State()
    discount_type = State()   # percent / fixed
    value        = State()
    min_amount   = State()
    max_uses     = State()
    expires      = State()
    confirm      = State()


def back_btn(data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text="◀️ Назад", callback_data=data)


# ── Список промокодов ─────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:promos:list")
@require_permission("discounts.*")
async def admin_promos_list(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    result = await db.execute(
        select(PromoCode)
        .order_by(desc(PromoCode.created_at))
        .limit(20)
    )
    promos = result.scalars().all()

    if not promos:
        text = "🏷 <b>Промокоды</b>\n\nПромокодов пока нет."
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ Создать промокод", callback_data="admin:promo:add")],
            [back_btn("admin:main")],
        ])
    else:
        lines = ["🏷 <b>Промокоды</b>\n"]
        for p in promos:
            status = "✅" if p.is_available else "🔴"
            lines.append(
                f"{status} <code>{p.code}</code> — "
                f"{p.used_count}/{p.max_uses or '∞'} исп."
            )
        text = "\n".join(lines)

        promo_buttons = [
            [InlineKeyboardButton(
                text=f"{'✅' if p.is_available else '🔴'} {p.code}",
                callback_data=f"admin:promo:{p.id}",
            )]
            for p in promos
        ]
        promo_buttons.append([
            InlineKeyboardButton(text="➕ Создать промокод", callback_data="admin:promo:add"),
        ])
        promo_buttons.append([back_btn("admin:main")])
        keyboard = InlineKeyboardMarkup(inline_keyboard=promo_buttons)

    await call.message.edit_text(text, reply_markup=keyboard)
    await call.answer()


# ── Детали промокода ──────────────────────────────────────────────────────────

@router.callback_query(
    F.data.startswith("admin:promo:")
    & ~F.data.startswith("admin:promo:add")
    & ~F.data.startswith("admin:promo:toggle:")
    & ~F.data.startswith("admin:promo:type:")
    & ~F.data.startswith("admin:promo:minamount:")
    & ~F.data.startswith("admin:promo:maxuses:")
    & ~F.data.startswith("admin:promo:expires:")
)
@require_permission("discounts.*")
async def admin_promo_detail(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    promo_id_str = call.data.split(":")[2]
    try:
        promo_uuid = _uuid.UUID(promo_id_str)
    except ValueError:
        await call.answer("Некорректный ID промокода", show_alert=True)
        return

    result = await db.execute(
        select(PromoCode)
        .options(selectinload(PromoCode.discount_rule))
        .where(PromoCode.id == promo_uuid)
    )
    promo = result.scalar_one_or_none()
    if not promo:
        await call.answer("Не найден", show_alert=True)
        return

    rule = promo.discount_rule
    val_str = (
        f"{rule.discount_value}%"
        if rule.discount_value_type == DiscountValueType.percent
        else f"{rule.discount_value} ₽"
    )
    expires_str = promo.expires_at.strftime("%d.%m.%Y") if promo.expires_at else "∞"

    text = (
        f"🏷 <b>Промокод {promo.code}</b>\n\n"
        f"Скидка:     {val_str}\n"
        f"Мин. сумма: {rule.min_order_amount} ₽\n"
        f"Исп-ий:    {promo.used_count} / {promo.max_uses or '∞'}\n"
        f"Лимит/user: {promo.per_user_limit}\n"
        f"Истекает:   {expires_str}\n"
        f"Статус:     {'✅ Активен' if promo.is_available else '🔴 Неактивен'}"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🔴 Деактивировать" if promo.is_active else "✅ Активировать",
            callback_data=f"admin:promo:toggle:{promo.id}",
        )],
        [back_btn("admin:promos:list")],
    ])
    await call.message.edit_text(text, reply_markup=keyboard)
    try:
        await call.answer()
    except TelegramBadRequest:
        pass  # уже отвечено вызывающим хендлером


@router.callback_query(F.data.startswith("admin:promo:toggle:"))
@require_permission("discounts.*")
async def admin_promo_toggle(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    try:
        promo_uuid = _uuid.UUID(call.data.split(":")[3])
    except ValueError:
        await call.answer("Некорректный ID", show_alert=True)
        return
    result = await db.execute(
        select(PromoCode)
        .options(selectinload(PromoCode.discount_rule))
        .where(PromoCode.id == promo_uuid)
    )
    promo = result.scalar_one_or_none()
    if not promo:
        await call.answer("Не найден", show_alert=True)
        return

    promo.is_active = not promo.is_active
    await log_admin_action(
        db, admin,
        f"promo.{'activate' if promo.is_active else 'deactivate'}",
        "promo_code", promo.id,
    )
    await call.answer(f"{'✅ Активирован' if promo.is_active else '🔴 Деактивирован'}")
    await admin_promo_detail(call, db, admin)


# ── Создание промокода (FSM) ──────────────────────────────────────────────────

@router.callback_query(F.data == "admin:promo:add")
@require_permission("discounts.*")
async def admin_promo_add_start(call: CallbackQuery, state: FSMContext) -> None:
    await call.message.edit_text(
        "➕ <b>Создание промокода</b>\n\n"
        "Шаг 1/6\n\n"
        "Введи <b>текст промокода</b> (только латиница и цифры):\n"
        "<i>Пример: SUMMER30</i>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="❌ Отмена", callback_data="admin:promos:list")
        ]]),
    )
    await state.set_state(AddPromoFSM.code)
    await call.answer()


@router.message(StateFilter(AddPromoFSM.code))
async def admin_promo_code_input(message: Message, state: FSMContext) -> None:
    import re
    code = message.text.strip().upper()
    if not re.match(r"^[A-Z0-9_-]{2,32}$", code):
        await message.answer(
            "❌ Неверный формат. Только латиница, цифры, дефис, подчёркивание. 2–32 символа."
        )
        return
    await state.update_data(code=code)
    await message.answer(
        f"Код: <code>{code}</code>\n\n"
        f"Шаг 2/6\n\nТип скидки:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="% Процент от суммы", callback_data="admin:promo:type:percent")],
            [InlineKeyboardButton(text="₽ Фиксированная сумма", callback_data="admin:promo:type:fixed")],
        ]),
    )
    await state.set_state(AddPromoFSM.discount_type)


@router.callback_query(F.data.startswith("admin:promo:type:"), StateFilter(AddPromoFSM.discount_type))
async def admin_promo_type(call: CallbackQuery, state: FSMContext) -> None:
    dtype = call.data.split(":")[3]
    await state.update_data(discount_type=dtype)
    label = "процент (например: 15)" if dtype == "percent" else "сумму в рублях (например: 100)"
    await call.message.edit_text(
        f"Шаг 3/6\n\nВведи <b>{label}</b>:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="❌ Отмена", callback_data="admin:promos:list")
        ]]),
    )
    await state.set_state(AddPromoFSM.value)
    await call.answer()


@router.message(StateFilter(AddPromoFSM.value))
async def admin_promo_value(message: Message, state: FSMContext) -> None:
    try:
        val = float(message.text.replace(",", "."))
        if val <= 0:
            raise ValueError
    except ValueError:
        await message.answer("❌ Введи корректное число")
        return

    data = await state.get_data()
    if data["discount_type"] == "percent" and val > 100:
        await message.answer("❌ Процент не может быть больше 100")
        return

    await state.update_data(value=val)
    await message.answer(
        "Шаг 4/6\n\nМинимальная сумма заказа (или 0 для любой):",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="0 — Любая сумма", callback_data="admin:promo:minamount:0")
        ]]),
    )
    await state.set_state(AddPromoFSM.min_amount)


@router.callback_query(F.data.startswith("admin:promo:minamount:"), StateFilter(AddPromoFSM.min_amount))
async def admin_promo_minamount_skip(call: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(min_amount=0)
    await call.answer()
    await _ask_max_uses(call.message, state)


@router.message(StateFilter(AddPromoFSM.min_amount))
async def admin_promo_minamount(message: Message, state: FSMContext) -> None:
    try:
        val = float(message.text.replace(",", "."))
    except ValueError:
        await message.answer("❌ Введи число")
        return
    await state.update_data(min_amount=val)
    await _ask_max_uses(message, state)


async def _ask_max_uses(message, state: FSMContext) -> None:
    await message.answer(
        "Шаг 5/6\n\nМаксимальное количество использований (или без лимита):",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="∞ Без лимита", callback_data="admin:promo:maxuses:none")
        ]]),
    )
    await state.set_state(AddPromoFSM.max_uses)


@router.callback_query(F.data == "admin:promo:maxuses:none", StateFilter(AddPromoFSM.max_uses))
async def admin_promo_maxuses_none(call: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(max_uses=None)
    await call.answer()
    await _ask_expires(call.message, state)


@router.message(StateFilter(AddPromoFSM.max_uses))
async def admin_promo_maxuses(message: Message, state: FSMContext) -> None:
    try:
        val = int(message.text)
        if val <= 0:
            raise ValueError
    except ValueError:
        await message.answer("❌ Введи целое положительное число")
        return
    await state.update_data(max_uses=val)
    await _ask_expires(message, state)


async def _ask_expires(message, state: FSMContext) -> None:
    await message.answer(
        "Шаг 6/6\n\nСрок действия (в формате ДД.ММ.ГГГГ) или без ограничений:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="∞ Без срока", callback_data="admin:promo:expires:none")
        ]]),
    )
    await state.set_state(AddPromoFSM.expires)


@router.callback_query(F.data == "admin:promo:expires:none", StateFilter(AddPromoFSM.expires))
async def admin_promo_expires_none(call: CallbackQuery, state: FSMContext, db: AsyncSession, admin: AdminUser) -> None:
    await state.update_data(expires=None)
    await call.answer()
    await _confirm_and_save_promo(call.message, state, db, admin)


@router.message(StateFilter(AddPromoFSM.expires))
async def admin_promo_expires(message: Message, state: FSMContext, db: AsyncSession, admin: AdminUser) -> None:
    from datetime import datetime
    try:
        dt = datetime.strptime(message.text.strip(), "%d.%m.%Y")
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    except ValueError:
        await message.answer("❌ Неверный формат даты. Используй ДД.ММ.ГГГГ")
        return
    await state.update_data(expires=dt.isoformat())
    await _confirm_and_save_promo(message, state, db, admin)


async def _confirm_and_save_promo(
    message, state: FSMContext, db: AsyncSession, admin: AdminUser
) -> None:
    from decimal import Decimal
    from datetime import datetime, timezone

    data = await state.get_data()
    await state.clear()

    dtype  = data["discount_type"]
    val    = data["value"]
    code   = data["code"]
    min_a  = data.get("min_amount", 0)
    max_u  = data.get("max_uses")
    exp    = datetime.fromisoformat(data["expires"]) if data.get("expires") else None

    # Создаём DiscountRule
    rule = DiscountRule(
        name=f"Промокод {code}",
        type=DiscountType.promo,
        discount_value_type=(
            DiscountValueType.percent if dtype == "percent" else DiscountValueType.fixed
        ),
        discount_value=Decimal(str(val)),
        min_order_amount=Decimal(str(min_a)),
        stackable=False,
        priority=50,
        ends_at=exp,
    )
    db.add(rule)
    await db.flush()

    # Создаём PromoCode
    promo = PromoCode(
        code=code,
        discount_rule_id=rule.id,
        max_uses=max_u,
        per_user_limit=1,
        expires_at=exp,
    )
    db.add(promo)
    await db.flush()

    await log_admin_action(
        db, admin, "promo.create", "promo_code", promo.id,
        after_data={"code": code, "value": val, "type": dtype},
    )

    val_str = f"{val}%" if dtype == "percent" else f"{val} ₽"
    await message.answer(
        f"✅ Промокод создан!\n\n"
        f"Код:     <code>{code}</code>\n"
        f"Скидка:  {val_str}\n"
        f"Лимит:   {max_u or '∞'} исп.\n"
        f"Истекает: {exp.strftime('%d.%m.%Y') if exp else '∞'}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🏷 К промокодам", callback_data="admin:promos:list")
        ]]),
    )
