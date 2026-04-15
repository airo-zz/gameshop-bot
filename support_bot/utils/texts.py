"""
support_bot/utils/texts.py
─────────────────────────────────────────────────────────────────────────────
Все тексты бота поддержки.
─────────────────────────────────────────────────────────────────────────────
"""

from shared.config import settings

S = settings


class SupportBotTexts:

    @property
    def welcome(self) -> str:
        return (
            f"<b>Поддержка {S.SHOP_NAME}</b>\n\n"
            f"Опишите ваш вопрос или выберите тему обращения.\n"
            f"Вы также можете отправить фото или скриншот."
        )

    @property
    def welcome_has_ticket(self) -> str:
        return (
            f"<b>Поддержка {S.SHOP_NAME}</b>\n\n"
            f"У вас есть активное обращение. "
            f"Просто напишите сообщение — оно будет добавлено в текущий тикет.\n\n"
            f"Чтобы создать новое обращение, сначала дождитесь закрытия текущего."
        )

    @property
    def choose_order(self) -> str:
        return "Выберите заказ, по которому возникла проблема:"

    @property
    def no_orders(self) -> str:
        return (
            "У вас пока нет заказов.\n"
            "Опишите ваш вопрос текстом:"
        )

    @property
    def describe_problem(self) -> str:
        return "Опишите проблему (можно приложить фото или скриншот):"

    @property
    def ticket_created(self) -> str:
        return (
            "Обращение создано!\n"
            "Ожидайте ответа оператора. "
            "Среднее время ответа — до 4 часов.\n\n"
            "Вы можете продолжать писать сюда — "
            "все сообщения будут добавлены в ваше обращение."
        )

    @property
    def message_added(self) -> str:
        return "Сообщение добавлено к вашему обращению."

    @property
    def ticket_closed(self) -> str:
        return (
            "Ваше обращение было закрыто.\n"
            "Если вопрос не решён — напишите /start для создания нового."
        )

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


texts = SupportBotTexts()
