"""
support_bot/utils/texts.py
─────────────────────────────────────────────────────────────────────────────
Все тексты бота поддержки.
─────────────────────────────────────────────────────────────────────────────
"""

from shared.config import settings

S = settings


class SupportBotTexts:

    # ── Главное меню ─────────────────────────────────────────────────────────

    @property
    def welcome(self) -> str:
        return (
            f"<b>Поддержка {S.SHOP_NAME}</b>\n\n"
            f"Чем можем помочь?"
        )

    def welcome_active(self, ticket_short_id: str, last_messages: str) -> str:
        return (
            f"<b>Поддержка {S.SHOP_NAME}</b> · обращение <code>#{ticket_short_id}</code>\n\n"
            f"Последние сообщения:\n{last_messages}"
        )

    # ── Написание сообщения ───────────────────────────────────────────────────

    @property
    def describe_problem(self) -> str:
        return (
            "Опишите проблему — можно прикрепить фото или файл.\n"
            "Мы ответим в течение нескольких часов."
        )

    # ── Тикет создан ─────────────────────────────────────────────────────────

    def ticket_created(self, short_id: str) -> str:
        return (
            f"Обращение <code>#{short_id}</code> открыто ✓\n\n"
            f"Можете продолжать отправлять сообщения.\n"
            f"Когда оператор ответит — вы получите уведомление."
        )

    # ── Список тикетов ───────────────────────────────────────────────────────

    @property
    def my_tickets_header(self) -> str:
        return "<b>Ваши обращения:</b>"

    @property
    def no_tickets(self) -> str:
        return "У вас пока нет обращений."

    # ── Просмотр тикета из списка ─────────────────────────────────────────────

    def ticket_preview(self, short_id: str, status_label: str, preview: str) -> str:
        return (
            f"<b>Обращение <code>#{short_id}</code></b> · {status_label}\n\n"
            f"{preview}"
        )

    def ticket_preview_empty(self, short_id: str, status_label: str) -> str:
        return (
            f"<b>Обращение <code>#{short_id}</code></b> · {status_label}\n\n"
            f"<i>Нет сообщений.</i>"
        )

    # ── Закрытие тикета ───────────────────────────────────────────────────────

    def ticket_closed(self, short_id: str) -> str:
        return (
            f"Обращение <code>#{short_id}</code> закрыто.\n"
            f"Если вопрос остался — /start для нового обращения."
        )

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
    def ticket_not_found(self) -> str:
        return "Обращение не найдено. Попробуйте снова через /start."

    @property
    def unknown_command(self) -> str:
        return "Напишите /start для возврата в меню."


texts = SupportBotTexts()
