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

S = settings  # Короткий псевдоним


class BotTexts:
    """Фабрика текстов. Все методы — property или функции с параметрами."""

    # ── Общие ─────────────────────────────────────────────────────────────────
    @property
    def shop_header(self) -> str:
        return f"{S.shop_name_emoji}"

    def greeting(self, first_name: str) -> str:
        return (
            f"👋 Привет, {escape(first_name)}!\n\n"
            f"Добро пожаловать в <b>{S.SHOP_NAME}</b> — {S.SHOP_TAGLINE}.\n\n"
            f"Выбери действие:"
        )

    def greeting_new_user(self, first_name: str, referral_bonus: float = 0) -> str:
        first_name = escape(first_name)
        bonus_text = (
            f"\n\n🎁 Тебе начислен бонус <b>{referral_bonus:.0f} ₽</b> за использование реферальной ссылки!"
            if referral_bonus > 0
            else ""
        )
        return (
            f"🎉 Добро пожаловать в <b>{S.SHOP_NAME}</b>!\n\n"
            f"{S.SHOP_TAGLINE}.\n\n"
            f"Здесь ты можешь быстро и безопасно купить игровой донат, "
            f"скины и многое другое.{bonus_text}\n\n"
            f"Используй кнопки ниже для навигации:"
        )

    # ── Каталог ───────────────────────────────────────────────────────────────
    @property
    def catalog_header(self) -> str:
        return f"🎮 <b>Каталог {S.SHOP_NAME}</b>\n\nВыбери игру:"

    @property
    def catalog_empty(self) -> str:
        return "😔 Каталог пуст. Скоро добавим товары!"

    def game_header(self, game_name: str) -> str:
        return f"🎮 <b>{game_name}</b>\n\nВыбери категорию:"

    def category_header(self, game_name: str, category_name: str) -> str:
        return f"🎮 {game_name} › <b>{category_name}</b>\n\nВыбери товар:"

    def product_card(
        self,
        name: str,
        description: str,
        price: float,
        stock: int | None,
        delivery_type: str,
        min_price: float | None = None,
        max_price: float | None = None,
    ) -> str:
        stock_text = (
            "♾ Неограничено"
            if stock is None
            else (f"✅ В наличии: {stock}" if stock > 0 else "❌ Нет в наличии")
        )
        delivery_text = {
            "auto": "⚡ Автоматически",
            "manual": "👤 Вручную (до 24ч)",
            "mixed": "📦 Зависит от лота",
        }.get(delivery_type, delivery_type)

        # Ценовой диапазон
        _min = min_price if min_price is not None else price
        _max = max_price if max_price is not None else price
        if _min != _max:
            price_text = f"от <b>{_min:.0f}</b> до <b>{_max:.0f} ₽</b>"
        else:
            price_text = f"<b>{_min:.0f} ₽</b>"

        return (
            f"<b>{name}</b>\n\n"
            f"{description}\n\n"
            f"💰 Цена: {price_text}\n"
            f"📦 Доставка: {delivery_text}\n"
            f"🗃 Наличие: {stock_text}"
        )

    # ── Корзина ───────────────────────────────────────────────────────────────
    @property
    def cart_empty(self) -> str:
        return (
            "🛒 Твоя корзина пуста.\n\n"
            f"Перейди в каталог {S.SHOP_NAME}, чтобы добавить товары."
        )

    def cart_summary(self, items_count: int, total: float, discount: float = 0) -> str:
        discount_text = f"\n💸 Скидка: <b>-{discount:.0f} ₽</b>" if discount > 0 else ""
        final = total - discount
        return (
            f"🛒 <b>Корзина</b> ({items_count} поз.)\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Сумма: {total:.0f} ₽\n"
            f"{discount_text}\n"
            f"<b>Итого: {final:.0f} ₽</b>"
        )

    @property
    def cart_promo_prompt(self) -> str:
        return "🏷 Введи промокод:"

    def cart_promo_applied(self, code: str, discount: float) -> str:
        return f"✅ Промокод <b>{code}</b> применён! Скидка: <b>{discount:.0f} ₽</b>"

    def cart_promo_invalid(self, reason: str = "") -> str:
        return f"❌ Промокод не действителен.{(' ' + reason) if reason else ''}"

    # ── Заказы ────────────────────────────────────────────────────────────────
    def order_created(self, order_number: str, total: float) -> str:
        return (
            f"✅ Заказ <b>{order_number}</b> создан!\n\n"
            f"💰 К оплате: <b>{total:.0f} ₽</b>\n\n"
            f"Выбери способ оплаты:"
        )

    def order_paid(self, order_number: str) -> str:
        return (
            f"💚 Оплата прошла успешно!\n\n"
            f"Заказ <b>{order_number}</b> принят в обработку.\n"
            f"Мы уведомим тебя о выполнении."
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
            f"{delivery_text}"
        )

    def order_cancelled(self, order_number: str, reason: str = "") -> str:
        reason_text = f"\n\nПричина: {reason}" if reason else ""
        return f"❌ Заказ <b>{order_number}</b> отменён.{reason_text}"

    def order_status_changed(self, order_number: str, new_status: str) -> str:
        status_emoji = {
            "pending_payment": "⏳",
            "paid": "💚",
            "processing": "⚙️",
            "clarification": "❓",
            "completed": "✅",
            "cancelled": "❌",
            "dispute": "⚠️",
        }.get(new_status, "📋")
        status_names = {
            "pending_payment": "Ожидает оплаты",
            "paid": "Оплачен",
            "processing": "В обработке",
            "clarification": "Требует уточнения",
            "completed": "Выполнен",
            "cancelled": "Отменён",
            "dispute": "Спор",
        }
        return (
            f"{status_emoji} Заказ <b>{order_number}</b>\n"
            f"Статус изменён: <b>{status_names.get(new_status, new_status)}</b>"
        )

    # ── Профиль ───────────────────────────────────────────────────────────────
    def profile(
        self,
        first_name: str,
        balance: float,
        orders_count: int,
        total_spent: float,
        loyalty_name: str,
        loyalty_emoji: str,
        referral_code: str,
    ) -> str:
        return (
            f"👤 <b>Профиль</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Имя: {escape(first_name)}\n"
            f"Баланс: <b>{balance:.2f} ₽</b>\n"
            f"Заказов: <b>{orders_count}</b>\n"
            f"Потрачено: <b>{total_spent:.0f} ₽</b>\n"
            f"Уровень: {loyalty_emoji} <b>{loyalty_name}</b>\n"
            f"Реферальный код: <code>{referral_code}</code>"
        )

    # ── Реферальная программа ─────────────────────────────────────────────────

    def referral_info(
        self,
        referral_code: str,
        ref_link: str,
        referrals_count: int,
    ) -> str:
        return (
            f"🎁 <b>Реферальная программа</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Приглашай друзей и получай бонусы за каждого!\n\n"
            f"👥 Приглашено: <b>{referrals_count}</b>\n"
            f"🔑 Твой код: <code>{referral_code}</code>\n\n"
            f"🔗 Твоя ссылка:\n"
            f"<code>{ref_link}</code>\n\n"
            f"Поделись ссылкой с друзьями — когда они совершат первую покупку, "
            f"ты получишь бонус на баланс!"
        )

    # ── Поддержка ─────────────────────────────────────────────────────────────
    @property
    def support_header(self) -> str:
        return (
            f"🆘 <b>Поддержка {S.SHOP_NAME}</b>\n\n"
            f"Опиши проблему — мы ответим в ближайшее время.\n"
            f"Также можно написать напрямую: {S.support_link}"
        )

    def ticket_created(self, ticket_id: str) -> str:
        return (
            f"✅ Обращение <b>#{ticket_id[:8]}</b> создано!\n"
            f"Обычно мы отвечаем в течение 1–4 часов.\n\n"
            f"Все ответы придут сюда, в бота."
        )

    def ticket_answered(self, operator_name: str, text: str) -> str:
        return f"💬 Ответ оператора <b>{operator_name}</b>:\n\n{text}"

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
        return "📋 У тебя пока нет заказов.\n\nПерейди в каталог и сделай первую покупку!"

    def orders_list_header(self, count: int) -> str:
        return f"📋 <b>Мои заказы</b> — последние {count}:"

    # ── Admin ─────────────────────────────────────────────────────────────────
    def admin_panel_header(
        self, first_name: str, role_emoji: str, role_name: str
    ) -> str:
        return (
            f"🎮 <b>Admin Panel — {S.SHOP_NAME}</b>\n\n"
            f"Привет, {escape(first_name)}!\n"
            f"Роль: {role_emoji} <b>{role_name}</b>\n\n"
            f"Выбери раздел:"
        )

    def admin_panel_short(self, role_emoji: str, role_name: str) -> str:
        return (
            f"🎮 <b>Admin Panel — {S.SHOP_NAME}</b>\n\n"
            f"Роль: {role_emoji} <b>{role_name}</b>"
        )

    @property
    def admin_catalog_header(self) -> str:
        return "🎮 <b>Управление каталогом</b>\n\nВыбери раздел:"

    # ── Главное меню клиента ──────────────────────────────────────────────────
    @property
    def choose_action(self) -> str:
        return "👇 Выбери действие:"

    @property
    def open_shop(self) -> str:
        return f"🎮 Открой <b>{S.SHOP_NAME}</b>:"

    def faq(self) -> str:
        return (
            f"❓ <b>FAQ — {S.SHOP_NAME}</b>\n\n"
            f"<b>Как быстро выдаётся товар?</b>\n"
            f"Автоматические товары — мгновенно после оплаты.\n"
            f"Ручные — в течение 1–24 часов.\n\n"
            f"<b>Какие способы оплаты?</b>\n"
            f"Баланс бота, банковская карта, USDT, TON.\n\n"
            f"<b>Что делать если товар не пришёл?</b>\n"
            f"Открой тикет в разделе «Поддержка».\n\n"
            f"<b>Есть ли скидки?</b>\n"
            f"Да! Программа лояльности Bronze → Silver → Gold → VIP.\n"
            f"Чем больше покупаешь — тем больше скидка.\n\n"
            f"<b>Как работает реферальная программа?</b>\n"
            f"Поделись своим кодом из профиля — получи бонус за каждого друга."
        )

    def help_text(self) -> str:
        return (
            f"🤖 <b>Команды {S.SHOP_NAME}</b>\n\n"
            f"/start — главное меню\n"
            f"/orders — мои заказы\n"
            f"/balance — мой баланс\n"
            f"/support — поддержка\n"
            f"/help — эта справка"
        )

    # ── Ошибки ────────────────────────────────────────────────────────────────
    @property
    def error_general(self) -> str:
        return (
            f"😔 Что-то пошло не так.\n\n"
            f"Попробуй позже или обратись в поддержку: {S.support_link}"
        )

    @property
    def error_payment_failed(self) -> str:
        return (
            "❌ Оплата не прошла.\n\n"
            "Попробуй другой способ оплаты или обратись в поддержку."
        )

    @property
    def error_out_of_stock(self) -> str:
        return "❌ К сожалению, товар закончился. Попробуй позже или выбери другой."

    @property
    def error_blocked(self) -> str:
        return f"🚫 Твой аккаунт заблокирован. Обратись в поддержку: {S.support_link}"


# Синглтон — импортируй и используй
texts = BotTexts()
