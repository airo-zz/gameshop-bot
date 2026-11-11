"""
bot/utils/texts.py
─────────────────────────────────────────────────────────────────────────────
Все тексты бота в одном месте.
Название магазина подставляется из settings.SHOP_NAME.

Чтобы изменить название — меняешь SHOP_NAME в .env.
Все тексты обновятся автоматически при перезапуске.
─────────────────────────────────────────────────────────────────────────────
"""

from html import escape

from shared.config import settings
from shared.content import render_default

S = settings  # Короткий псевдоним


def rub(v: float) -> str:
    """1250 → «1 250 ₽» (неразрывные пробелы), копейки — только если есть."""
    v = float(v)
    if v == int(v):
        body = f"{int(v):,}".replace(",", "\u00a0")
    else:
        body = f"{v:,.2f}".replace(",", "\u00a0").replace(".", ",")
    return body + "\u00a0₽"


def table(rows: list[tuple], header: tuple | None = None, align_last_right: bool = True) -> str:
    """Таблица rich-сообщения: строки — кортежи ячеек (уже экранированный HTML).
    Последний столбец (суммы) — по правому краю. В обычном сообщении станет строками «a · b»."""
    def row(cells: tuple, tag: str) -> str:
        out = []
        for i, c in enumerate(cells):
            right = align_last_right and i == len(cells) - 1 and len(cells) > 1
            attr = ' align="right"' if right else ""
            out.append(f"<{tag}{attr}>{c}</{tag}>")
        return "<tr>" + "".join(out) + "</tr>"

    head = row(header, "th") if header else ""
    return "<table striped compact>" + head + "".join(row(r, "td") for r in rows) + "</table>"

# Лимиты пополнения баланса (совпадают с API: BalanceTopupRequest и UI)
TOPUP_MIN = 100
TOPUP_MAX = 100_000


class BotTexts:
    """Фабрика текстов. Все методы — property или функции с параметрами."""

    def greeting(self, first_name: str) -> str:
        return render_default("greeting", first_name=escape(first_name))

    def referral_bonus_received(self, amount: float, percent: float) -> str:
        value = f"{amount:.0f}" if amount == int(amount) else f"{amount:.2f}".replace(".", ",")
        return (
            f"🎁 Ваш друг сделал заказ — вам начислено <b>{value} ₽</b> на баланс "
            f"({percent:g}% от суммы заказа).\n"
            "Спасибо, что рекомендуете нас!"
        )

    def referral_discount_hint(self, percent: float) -> str:
        return (
            f"\n\n🎁 Вы пришли по приглашению — скидка <b>{percent:g}%</b> на первый заказ "
            "применится автоматически."
        )

    # ── Каталог ───────────────────────────────────────────────────────────────
    @property
    def catalog_header(self) -> str:
        return render_default("catalog_header")

    @property
    def services_header(self) -> str:
        return render_default("services_header")

    @property
    def catalog_empty(self) -> str:
        return render_default("catalog_empty")

    def game_header(self, game_name: str, description: str = "") -> str:
        desc = f"{escape(description[:500])}\n" if description else ""
        return f"<h2>{escape(game_name)}</h2>\n{desc}<footer>Выбери раздел ниже</footer>"

    def category_header(self, game_name: str, category_name: str) -> str:
        return f"<h2>{escape(category_name)}</h2>\n{escape(game_name)}"

    def product_card(
        self,
        name: str,
        description: str,
        price: float,
        stock: int | None,
        delivery_type: str,
        min_price: float | None = None,
        max_price: float | None = None,
        cart_total: float | None = None,
    ) -> str:
        delivery_text = {
            "auto": "⚡ Автоматически",
            "manual": "👤 Оператор в чате",
            "mixed": "📦 Зависит от товара",
        }.get(delivery_type, delivery_type)

        _min = min_price if min_price is not None else price
        rows = [("Цена", f"<b>{rub(_min)}</b>"), ("Выдача", delivery_text)]
        # Наличие показываем только если ограничено
        if stock is not None:
            rows.append(("Наличие", f"{stock} шт." if stock > 0 else "нет в наличии"))
        parts = [f"<h2>{escape(name)}</h2>"]
        if description:
            parts.append(escape(description))
        parts.append(table(rows))
        if cart_total is not None and cart_total > 0:
            parts.append(f"<footer>В корзине на {rub(cart_total)}</footer>")
        return "\n".join(parts)

    # ── Корзина ───────────────────────────────────────────────────────────────
    @property
    def cart_empty(self) -> str:
        return render_default("cart_empty")

    @property
    def cart_promo_prompt(self) -> str:
        return "🏷 Введи промокод:"

    def cart_promo_applied(self, code: str, discount: float) -> str:
        return f"✅ Промокод <b>{escape(code)}</b> применён! Скидка: <b>{discount:.0f} ₽</b>"

    def cart_promo_invalid(self, reason: str = "") -> str:
        return f"❌ Промокод не действителен.{(' ' + reason) if reason else ''}"

    def balance_topup_success(self, amount: float, new_balance: float) -> str:
        return (
            f"💰 <b>Баланс пополнен</b>\n\n"
            f"Зачислено: <b>+{amount:,.0f} ₽</b>\n"
            f"Текущий баланс: <b>{new_balance:,.0f} ₽</b>"
        )

    def balance_credited_by_admin(self, amount: float, new_balance: float, reason: str | None = None) -> str:
        reason_part = f"\n\nПричина: {escape(reason)}" if reason else ""
        return (
            f"💰 <b>Начисление баланса</b>\n\n"
            f"Администратор начислил вам <b>+{amount:,.0f} ₽</b>\n"
            f"Текущий баланс: <b>{new_balance:,.0f} ₽</b>"
            f"{reason_part}"
        )

    def order_paid(self, order_number: str) -> str:
        return (
            f"💚 Оплата прошла успешно!\n\n"
            f"Заказ <b>{order_number}</b> принят в обработку.\n"
            f"Мы уведомим тебя о выполнении."
        )

    def chat_order_paid(
        self,
        order_number: str,
        amount: float | None = None,
        items: str = "",
        order_id: str = "",
    ) -> str:
        amount_str = f"{int(amount):,} ₽".replace(",", "\u00a0") if amount else ""
        items_part = f" Товар: {items}." if items else ""
        text = (
            f"Заказ {order_number} на сумму {amount_str} успешно оплачен.{items_part}"
            f" Ожидайте, скоро оператор свяжется с вами."
        )
        if order_id:
            text += f"|oid={order_id}"
        return text

    def custom_lot_created(self, title: str, price: float) -> str:
        price_str = f"{int(price):,} ₽".replace(",", " ")
        return (
            f"🧾 <b>Вам выставлен индивидуальный лот</b>\n\n"
            f"{escape(title)}\n"
            f"Сумма: <b>{price_str}</b>\n\n"
            f"Откройте чат, чтобы оплатить."
        )

    def chat_order_instruction(self, product_name: str, instruction: str) -> str:
        return (
            f"Инструкция по получению ({escape(product_name)}):\n"
            f"{escape(instruction)}"
        )

    def order_completed(self, order_number: str, delivery_data: str = "") -> str:
        delivery_text = (
            f"\n\n📦 <b>Данные для получения:</b>\n{delivery_data}"
            if delivery_data
            else ""
        )
        return (
            f"🎉 Заказ <b>{order_number}</b> выполнен!\n"
            f"Спасибо за покупку в {S.SHOP_NAME}!"
            f"{delivery_text}\n\n"
            f"Будем благодарны за отзыв — это займёт полминуты."
        )

    btn_leave_review = "Оставить отзыв"

    def order_cancelled(self, order_number: str, reason: str = "") -> str:
        reason_text = f"\n\nПричина: {escape(reason)}" if reason else ""
        return f"❌ Заказ <b>{escape(order_number)}</b> отменён.{reason_text}"

    def order_status_changed(self, order_number: str, new_status: str) -> str:
        status_emoji = {
            "pending_payment": "⏳",
            "paid": "💚",
            "processing": "⚙️",
            "clarification": "❓",
            "completed": "✅",
            "cancelled": "❌",
            "refunded": "↩️",
        }.get(new_status, "📋")
        status_names = {
            "pending_payment": "Ожидает оплаты",
            "paid": "Оплачен",
            "processing": "В обработке",
            "clarification": "Требует уточнения",
            "completed": "Выполнен",
            "cancelled": "Отменён",
            "refunded": "Возврат",
        }
        return (
            f"{status_emoji} Заказ <b>{order_number}</b>\n"
            f"Статус изменён: <b>{status_names.get(new_status, new_status)}</b>"
        )

    def checkout_select_method(
        self, order_number: str, total: float, balance: float
    ) -> str:
        balance_text = "хватает" if balance >= total else f"не хватает {rub(total - balance)}"
        return (
            f"<h2>Заказ {escape(order_number)}</h2>\n"
            + table([("К оплате", f"<b>{rub(total)}</b>"), ("Баланс", f"{rub(balance)} · {balance_text}")])
            + "\n<footer>Выбери способ оплаты</footer>"
        )

    def payment_insufficient_balance(self, balance: float, needed: float) -> str:
        return (
            "<h2>Недостаточно средств</h2>\n"
            + table([("На балансе", rub(balance)), ("Нужно", rub(needed)),
                     ("Не хватает", f"<b>{rub(needed - balance)}</b>")])
        )

    def payment_waiting_external(
        self, method: str, amount: float, url: str
    ) -> str:
        method_names = {
            "sbp": "🏦 СБП",
            "card": "💳 Банковская карта",
            "crypto": "🪙 Криптовалюта",
        }
        method_label = method_names.get(method, method)
        return (
            f"<h2>Оплата: {method_label}</h2>\n"
            + table([("Сумма", f"<b>{rub(amount)}</b>")])
            + "\nНажми кнопку ниже для оплаты. После оплаты нажми «✅ Я оплатил»."
        )

    @staticmethod
    def pay_method_button(method: str, fee: float | None) -> str:
        """Кнопка способа оплаты с комиссией: «🏦 СБП · комиссия 0%»."""
        names = {"sbp": "🏦 СБП", "card": "💳 Банковская карта", "crypto": "🪙 Криптовалюта"}
        label = names.get(method, method)
        if fee is None:
            return label
        return f"{label} · комиссия {fee:g}%"

    # ── Пополнение баланса ─────────────────────────────────────────────────────
    @property
    def topup_choose_amount(self) -> str:
        return "<h2>Пополнение баланса</h2>\n<footer>Выбери сумму или укажи свою</footer>"

    @property
    def topup_enter_amount(self) -> str:
        return (f"<h2>Своя сумма</h2>\nНапиши сумму пополнения в рублях — от {TOPUP_MIN} "
                f"до {TOPUP_MAX:,} ₽.").replace(",", " ")

    @property
    def topup_bad_amount(self) -> str:
        return f"❌ Нужна целая сумма от {TOPUP_MIN} до {TOPUP_MAX:,} ₽. Попробуй ещё раз:".replace(",", " ")

    def topup_choose_method(self, amount: int) -> str:
        return (
            f"<h2>Пополнение на {rub(amount)}</h2>\n"
            "<footer>Выбери способ оплаты. Комиссия способа — на кнопке, "
            "она добавляется к сумме пополнения</footer>"
        )

    def topup_waiting(self, amount: int, method: str) -> str:
        method_names = {"sbp": "🏦 СБП", "card": "💳 карта", "crypto": "🪙 криптовалюта"}
        return (
            f"<h2>Пополнение на {rub(amount)}</h2>\n"
            f"Способ: {method_names.get(method, method)}\n\n"
            "Нажми «Оплатить» и заверши оплату на странице платёжной системы.\n"
            "<footer>Деньги зачислятся автоматически — бот пришлёт сообщение</footer>"
        )

    @property
    def topup_failed(self) -> str:
        return "Не удалось создать платёж. Попробуй другой способ или позже."

    # ── Инпут-поля (FSM) ──────────────────────────────────────────────────────
    def input_field_prompt(self, label: str, placeholder: str = "") -> str:
        hint = f"\n\n<i>Например: {placeholder}</i>" if placeholder else ""
        return f"✏️ <b>{label}</b>{hint}\n\nВведи значение:"

    def input_field_select_prompt(self, label: str) -> str:
        return f"🔽 <b>{label}</b>\n\nВыбери один из вариантов:"

    def input_field_saved(
        self, label: str, value: str, remaining: int
    ) -> str:
        remaining_text = (
            f"Осталось полей: <b>{remaining}</b>" if remaining > 0 else "Все поля заполнены!"
        )
        return (
            f"✅ <b>{escape(label)}</b>: <code>{escape(value)}</code>\n\n{remaining_text}"
        )

    # ── Избранное ─────────────────────────────────────────────────────────────
    @property
    def favorites_empty(self) -> str:
        return render_default("favorites_empty")

    def favorites_header(self, count: int) -> str:
        return f"<h2>Избранное · {count}</h2>"

    def favorite_added(self, product_name: str) -> str:
        return f"❤️ <b>{escape(product_name)}</b> добавлен в избранное!"

    def favorite_removed(self, product_name: str) -> str:
        return f"🗑 <b>{escape(product_name)}</b> убран из избранного."

    # ── Профиль ───────────────────────────────────────────────────────────────
    def profile(
        self,
        first_name: str,
        balance: float,
        orders_count: int,
        total_spent: float,
        loyalty_name: str,
        loyalty_emoji: str,
        referral_code: str = "",
        next_level_name: str | None = None,
        next_level_need: float | None = None,
    ) -> str:
        if next_level_name and next_level_need is not None and next_level_need > 0:
            progress_text = (
                f"\nПотрачено: <b>{total_spent:.0f} ₽</b> → "
                f"до {escape(next_level_name)} нужно ещё <b>{next_level_need:.0f} ₽</b>"
            )
        else:
            progress_text = f"\nПотрачено: <b>{total_spent:.0f} ₽</b>"

        return render_default(
            "profile",
            first_name=escape(first_name),
            balance=f"{balance:.2f}",
            orders_count=orders_count,
            loyalty_emoji=loyalty_emoji,
            loyalty_name=escape(loyalty_name),
            progress=progress_text,
        )

    # ── Реферальная программа ─────────────────────────────────────────────────

    def referral_info(
        self,
        ref_link: str,
        referrals_count: int,
        referral_code: str = "",
    ) -> str:
        return (
            "<h2>Приглашай друзей</h2>\n"
            "Получай процент с каждого заказа друга — на баланс. Другу — скидка на первый заказ.\n"
            + table([("Приглашено", f"<b>{referrals_count}</b>")])
            + f"\n<h4>Твоя ссылка</h4><p><code>{ref_link}</code></p>"
            "<footer>Нажми на ссылку, чтобы скопировать, или поделись кнопкой ниже</footer>"
        )

    # ── Поддержка ─────────────────────────────────────────────────────────────
    @property
    def support_header(self) -> str:
        return render_default("support_header")

    # ── Брошенная корзина ─────────────────────────────────────────────────────
    @staticmethod
    def _plural(n: int, one: str, few: str, many: str) -> str:
        if 11 <= n % 100 <= 19:
            return many
        r = n % 10
        if r == 1:
            return one
        if 2 <= r <= 4:
            return few
        return many

    def abandoned_cart_reminder(self, items_count: int, total: float) -> str:
        товар_word = self._plural(items_count, "товар", "товара", "товаров")
        return (
            f"🛒 В твоей корзине {items_count} {товар_word} в {S.SHOP_NAME}!\n\n"
            f"Итого: <b>{total:.0f} ₽</b>\n\n"
            f"Вернись и оформи заказ — товары ждут тебя! 👇"
        )

    # ── Заказы (клиент) ───────────────────────────────────────────────────────
    @property
    def orders_empty(self) -> str:
        return render_default("orders_empty")

    def orders_list_header(self, count: int) -> str:
        return "<h2>Мои заказы</h2>"

    # ── Главное меню клиента ──────────────────────────────────────────────────
    @property
    def choose_action(self) -> str:
        return render_default("choose_action")

    @property
    def open_shop(self) -> str:
        return f"🎮 Открой <b>{S.SHOP_NAME}</b>:"

    def faq(self) -> str:
        return render_default("faq")

    def help_text(self) -> str:
        return render_default("help_text")

    def info_text(self) -> str:
        return render_default("info_text")

    # ── Ошибки ────────────────────────────────────────────────────────────────
    @property
    def error_general(self) -> str:
        return (
            f"😔 Что-то пошло не так.\n\n"
            f"Попробуй позже или обратись в поддержку: @{S.SHOP_SUPPORT_USERNAME}"
        )

    @property
    def error_blocked(self) -> str:
        return f"🚫 Твой аккаунт заблокирован. Обратись в поддержку: @{S.SHOP_SUPPORT_USERNAME}"


# Синглтон — импортируй и используй
texts = BotTexts()
