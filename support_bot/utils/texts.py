"""
support_bot/utils/texts.py
─────────────────────────────────────────────────────────────────────────────
Все тексты и константы кнопок бота поддержки.
─────────────────────────────────────────────────────────────────────────────
"""

from shared.config import settings

S = settings

# ── Константы кнопок (используются в F.text == texts.BTN_*) ─────────────────

BTN_CREATE = "Создать обращение"
BTN_MY_TICKETS = "Мои обращения"
BTN_CONTINUE = "Продолжить обращение"
BTN_NEW = "Новое обращение"
BTN_EXIT_CHAT = "Выйти из чата"
BTN_NO_ORDER = "Без привязки к заказу"
BTN_BACK = "Назад"


class SupportBotTexts:

    # ── Главное меню ─────────────────────────────────────────────────────────

    @property
    def welcome(self) -> str:
        return (
            f"<b>Поддержка {S.SHOP_NAME}</b>\n\n"
            f"Привет! Чем можем помочь?\n\n"
            f"Создайте обращение или посмотрите историю ваших тикетов."
        )

    def welcome_active(self, ticket_short_id: str) -> str:
        return (
            f"<b>Поддержка {S.SHOP_NAME}</b>\n\n"
            f"У вас активное обращение <code>#{ticket_short_id}</code>.\n\n"
            f"Продолжите переписку или создайте новое обращение."
        )

    # ── Выбор заказа ─────────────────────────────────────────────────────────

    @property
    def choose_order(self) -> str:
        return "Выберите заказ или продолжите без привязки:"

    @property
    def no_orders(self) -> str:
        return (
            "У вас пока нет заказов.\n\n"
            "Опишите вашу проблему ниже:"
        )

    # ── Написание сообщения ───────────────────────────────────────────────────

    @property
    def describe_problem(self) -> str:
        return "Опишите вашу проблему (можно прикрепить фото):"

    # ── Тикет создан / активный чат ──────────────────────────────────────────

    @property
    def ticket_created(self) -> str:
        return (
            "Обращение создано! Ожидайте ответа оператора.\n\n"
            "Среднее время ответа — до 4 часов.\n"
            "Вы можете продолжать отправлять сообщения здесь."
        )

    @property
    def message_sent(self) -> str:
        return "Отправлено."

    # ── Список тикетов ───────────────────────────────────────────────────────

    @property
    def my_tickets_header(self) -> str:
        return "Ваши обращения:"

    @property
    def no_tickets(self) -> str:
        return "У вас пока нет обращений."

    # ── Выбранный тикет / вход в чат ─────────────────────────────────────────

    def ticket_context(self, short_id: str, messages_preview: str) -> str:
        return (
            f"<b>Обращение #{short_id}</b>\n\n"
            f"{messages_preview}\n\n"
            f"<i>Отвечайте здесь. /exit — выйти из чата.</i>"
        )

    def ticket_context_empty(self, short_id: str) -> str:
        return (
            f"<b>Обращение #{short_id}</b>\n\n"
            f"<i>Нет сообщений.</i>\n\n"
            f"<i>Отвечайте здесь. /exit — выйти из чата.</i>"
        )

    @property
    def chat_exited(self) -> str:
        return "Вы вышли из чата."

    # ── Ошибки / служебные ───────────────────────────────────────────────────

    @property
    def no_account(self) -> str:
        return (
            f"Для обращения в поддержку необходимо сначала "
            f"воспользоваться основным ботом @{S.BOT_USERNAME}.\n\n"
            f"После регистрации возвращайтесь сюда."
        )

    @property
    def error_general(self) -> str:
        return "Произошла ошибка. Попробуйте позже или напишите /start."

    @property
    def error_blocked(self) -> str:
        return "Ваш аккаунт заблокирован. Обращение невозможно."

    @property
    def ticket_closed(self) -> str:
        return (
            "Ваше обращение было закрыто.\n"
            "Если вопрос не решён — напишите /start для создания нового."
        )

    @property
    def ticket_not_found(self) -> str:
        return "Обращение не найдено. Попробуйте выбрать снова."

    @property
    def unknown_command(self) -> str:
        return "Нажмите кнопку из меню или напишите /start."


texts = SupportBotTexts()
