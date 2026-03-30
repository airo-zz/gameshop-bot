"""
bot/utils/texts.py
─────────────────────────────────────────────────────────────────────────────
Все тексты бота в одном месте.
Название магазина подставляется из settings.SHOP_NAME.

Чтобы изменить название — меняешь SHOP_NAME в .env.
Все тексты обновятся автоматически при перезапуске.
─────────────────────────────────────────────────────────────────────────────
"""

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
            f"👋 Привет, {first_name}!\n\n"
            f"Добро пожаловать в <b>{S.SHOP_NAME}</b> — {S.SHOP_TAGLINE}.\n\n"
            f"Выбери действие:"
        )

    def greeting_new_user(self, first_name: str, referral_bonus: float = 0) -> str:
        bonus_text = (
            f"\n\n🎁 Тебе начислен бонус <b>{referral_bonus:.0f} ₽</b> за использование реферальной ссылки!"
            if referral_bonus > 0 else ""
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
        self, name: str, description: str, price: float,
        stock: int | None, delivery_type: str
    ) -> str:
        stock_text = "♾ Неограничено" if stock is None else (
            f"✅ В наличии: {stock}" if stock > 0 else "❌ Нет в наличии"
        )
        delivery_text = {
            "auto": "⚡ Автоматически",
            "manual": "👤 Вручную (до 24ч)",
            "mixed": "📦 Зависит от лота",
        }.get(delivery_type, delivery_type)

        return (
            f"<b>{name}</b>\n\n"
            f"{description}\n\n"
            f"💰 Цена: от <b>{price:.0f} ₽</b>\n"
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
        discount_text = (
            f"\n💸 Скидка: <b>-{discount:.0f} ₽</b>" if discount > 0 else ""
        )
        final = total - discount
        return (
            f"🛒 <b>Корзина</b> ({items_count} поз.)\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Сумма: {total:.0f} ₽"
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
        delivery_text = f"\n\n📦 <b>Данные для получения:</b>\n{delivery_data}" if delivery_data else ""
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
        self, first_name: str, balance: float, orders_count: int,
        total_spent: float, loyalty_name: str, loyalty_emoji: str,
        referral_code: str,
    ) -> str:
        return (
            f"👤 <b>Профиль</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Имя: {first_name}\n"
            f"Баланс: <b>{balance:.2f} ₽</b>\n"
            f"Заказов: <b>{orders_count}</b>\n"
            f"Потрачено: <b>{total_spent:.0f} ₽</b>\n"
            f"Уровень: {loyalty_emoji} <b>{loyalty_name}</b>\n"
            f"Реферальный код: <code>{referral_code}</code>"
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
            f"Оператор ответит в ближайшее время.\n\n"
            f"Все ответы придут сюда, в бота."
        )

    def ticket_answered(self, operator_name: str, text: str) -> str:
        return (
            f"💬 Ответ оператора <b>{operator_name}</b>:\n\n"
            f"{text}"
        )

    # ── Брошенная корзина ─────────────────────────────────────────────────────
    def abandoned_cart_reminder(self, items_count: int, total: float) -> str:
        return (
            f"🛒 Ты забыл(а) {items_count} товар(а) в корзине {S.SHOP_NAME}!\n\n"
            f"Итого: <b>{total:.0f} ₽</b>\n\n"
            f"Вернись и оформи заказ — товары ждут тебя! 👇"
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
        return f"🚫 Ваш аккаунт заблокирован. Обратитесь в поддержку: {S.support_link}"


# Синглтон — импортируй и используй
texts = BotTexts()
