"""
bot/handlers/admin/admin_stats.py
─────────────────────────────────────────────────────────────────────────────
Статистика и аналитика в admin-боте.

Разделы:
  - Обзор (выручка, заказы, пользователи)
  - Топ товаров
  - График по дням (ASCII-chart в Telegram)
  - Экспорт заказов в CSV
  - Брошенные корзины
─────────────────────────────────────────────────────────────────────────────
"""

import io
from datetime import datetime, timedelta, timezone

from aiogram import Router, F
from aiogram.types import (
    BufferedInputFile, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
)
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.analytics_service import AnalyticsService, FullAnalytics
from bot.middlewares.admin_auth import require_permission
from shared.models import AdminUser

router = Router(name="admin:stats")


# ── Helpers ───────────────────────────────────────────────────────────────────

def back_btn(data: str = "admin:main") -> InlineKeyboardButton:
    return InlineKeyboardButton(text="◀️ Назад", callback_data=data)


def sparkline(values: list[float], width: int = 7) -> str:
    """
    Мини-график из Unicode блоков.
    Пример: ▁▂▄▃▆▇█
    """
    blocks = "▁▂▃▄▅▆▇█"
    if not values or max(values) == 0:
        return "▁" * len(values)
    mn, mx = min(values), max(values)
    span = mx - mn or 1
    result = ""
    for v in values:
        idx = int((v - mn) / span * (len(blocks) - 1))
        result += blocks[idx]
    return result


def fmt_money(amount) -> str:
    return f"{float(amount):,.0f}".replace(",", " ") + " ₽"


def fmt_pct(value: float) -> str:
    return f"{value:.1f}%"


# ── Главная статистика ────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:stats:main")
@require_permission("analytics.view")
async def admin_stats_main(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    await call.answer("⏳ Загружаем статистику...")

    svc = AnalyticsService(db)
    stats: FullAnalytics = await svc.get_full_analytics()
    r = stats.revenue
    o = stats.orders
    u = stats.users

    # Строим sparkline из 7-дневной динамики выручки
    rev_values = [float(d.revenue) for d in stats.daily_7d]
    spark = sparkline(rev_values)

    text = (
        f"📊 <b>Статистика магазина</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"

        f"💰 <b>Выручка</b>\n"
        f"  Сегодня:   <b>{fmt_money(r.today)}</b>\n"
        f"  7 дней:    <b>{fmt_money(r.week)}</b>\n"
        f"  30 дней:   <b>{fmt_money(r.month)}</b>\n"
        f"  Всего:     <b>{fmt_money(r.total)}</b>\n"
        f"  Ср. чек:   {fmt_money(r.avg_order)}\n"
        f"  Динамика:  {spark}\n\n"

        f"📋 <b>Заказы</b> (всего: {o.total})\n"
        f"  ✅ Выполнено:    {o.completed}\n"
        f"  ⚙️ В работе:    {o.processing + o.paid}\n"
        f"  ⏳ Ожид. оплаты: {o.pending_payment}\n"
        f"  ❓ Уточнение:   {o.clarification}\n"
        f"  ⚠️ Споры:       {o.dispute}\n"
        f"  ❌ Отменено:    {o.cancelled}\n"
        f"  📈 Выполнение:  {fmt_pct(o.completion_rate)}\n\n"

        f"👥 <b>Пользователи</b> (всего: {u.total})\n"
        f"  Новых сегодня: {u.today}\n"
        f"  Новых за 7д:   {u.week}\n"
        f"  Новых за 30д:  {u.month}\n"
        f"  Активны за 7д: {u.active_week}\n"
        f"  Покупали:      {u.with_orders}\n"
        f"  Конверсия:     {fmt_pct(stats.conversion_rate)}\n\n"

        f"🛒 Брошенных корзин: {stats.abandoned_carts_count}"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🏆 Топ товаров",   callback_data="admin:stats:top_products"),
            InlineKeyboardButton(text="🎮 Топ игр",       callback_data="admin:stats:top_games"),
        ],
        [
            InlineKeyboardButton(text="📈 График 7 дней", callback_data="admin:stats:chart_7d"),
        ],
        [
            InlineKeyboardButton(text="📥 Экспорт CSV",   callback_data="admin:stats:export"),
            InlineKeyboardButton(text="🔄 Обновить",      callback_data="admin:stats:main"),
        ],
        [back_btn()],
    ])

    await call.message.edit_text(text, reply_markup=keyboard)


# ── Топ товаров ───────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:stats:top_products")
@require_permission("analytics.view")
async def admin_stats_top_products(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    svc = AnalyticsService(db)
    stats = await svc.get_full_analytics()

    if not stats.top_products:
        await call.answer("Нет данных о продажах", show_alert=True)
        return

    lines = ["🏆 <b>Топ товаров по продажам</b>\n"]
    medals = ["🥇", "🥈", "🥉"] + ["  "] * 20

    for i, p in enumerate(stats.top_products[:10]):
        medal = medals[i]
        lines.append(
            f"{medal} <b>{p.name[:35]}</b>\n"
            f"     {p.orders_count} заказов · {fmt_money(p.revenue)}\n"
        )

    await call.message.edit_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="◀️ К статистике", callback_data="admin:stats:main")
        ]])
    )
    await call.answer()


# ── Топ игр ───────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:stats:top_games")
@require_permission("analytics.view")
async def admin_stats_top_games(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    svc = AnalyticsService(db)
    stats = await svc.get_full_analytics()

    if not stats.top_games:
        await call.answer("Нет данных", show_alert=True)
        return

    lines = ["🎮 <b>Топ игр по продажам</b>\n"]
    for i, g in enumerate(stats.top_games):
        lines.append(
            f"{i+1}. <b>{g['name']}</b>\n"
            f"   {g['orders']} заказов · {fmt_money(g['revenue'])}\n"
        )

    await call.message.edit_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="◀️ К статистике", callback_data="admin:stats:main")
        ]])
    )
    await call.answer()


# ── График 7 дней (ASCII) ─────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:stats:chart_7d")
@require_permission("analytics.view")
async def admin_stats_chart(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    svc = AnalyticsService(db)
    stats = await svc.get_full_analytics()
    daily = stats.daily_7d

    if not daily:
        await call.answer("Нет данных", show_alert=True)
        return

    # Строим ASCII bar chart для выручки
    max_rev = max(float(d.revenue) for d in daily) or 1
    bar_height = 8

    lines = ["📈 <b>Динамика за 7 дней</b>\n<code>"]

    # Рисуем бары снизу вверх
    for row in range(bar_height, 0, -1):
        line = ""
        for d in daily:
            fill_height = int(float(d.revenue) / max_rev * bar_height)
            if fill_height >= row:
                line += "██ "
            else:
                line += "   "
        lines.append(line)

    # Ось X
    lines.append("─" * (len(daily) * 3))
    date_row = "  ".join(d.date for d in daily)
    lines.append(date_row)
    lines.append("</code>\n")

    # Таблица значений
    lines.append("<b>День       Выручка   Заказы  Новые</b>")
    for d in daily:
        lines.append(
            f"{d.date}  "
            f"{fmt_money(d.revenue):>10}  "
            f"{d.orders:>5}  "
            f"{d.new_users:>5}"
        )

    # Итого за период
    total_rev = sum(float(d.revenue) for d in daily)
    total_ord = sum(d.orders for d in daily)
    total_usr = sum(d.new_users for d in daily)
    lines.append(f"\n<b>Итого:  {fmt_money(total_rev)}  {total_ord} зак.  {total_usr} польз.</b>")

    await call.message.edit_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="◀️ К статистике", callback_data="admin:stats:main")
        ]])
    )
    await call.answer()


# ── Экспорт CSV ───────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin:stats:export")
@require_permission("analytics.view")
async def admin_stats_export(call: CallbackQuery, db: AsyncSession, admin: AdminUser) -> None:
    await call.answer("⏳ Генерируем CSV...")

    svc = AnalyticsService(db)
    csv_data = await svc.export_orders_csv()

    filename = f"orders_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.csv"
    file = BufferedInputFile(
        csv_data.encode("utf-8-sig"),   # utf-8-sig = BOM для Excel
        filename=filename,
    )

    await call.message.answer_document(
        document=file,
        caption=f"📥 Экспорт завершённых заказов\n📅 {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M')} UTC",
    )

    await call.message.edit_reply_markup(
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="◀️ К статистике", callback_data="admin:stats:main")
        ]])
    )
