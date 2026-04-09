"""shared/utils.py — общие утилиты для bot и api."""
from shared.config import settings


def build_telegram_photo_url(stored: str | None) -> str | None:
    """
    Собирает публичный URL аватара Telegram из значения, хранящегося в БД.

    В новой схеме в `users.photo_url` хранится только `file_path`, а полный URL
    с BOT_TOKEN формируется в рантайме (чтобы не утекал токен из дампов БД).

    Для обратной совместимости поддерживаем и старый формат, в котором в БД
    лежит уже готовый URL — в этом случае подменяем токен на актуальный.
    """
    if not stored:
        return None

    prefix = "https://api.telegram.org/file/bot"
    if stored.startswith(prefix):
        # Старый формат: вытаскиваем file_path после токена
        tail = stored[len(prefix):]
        slash = tail.find("/")
        if slash == -1:
            return None
        file_path = tail[slash + 1:]
    else:
        file_path = stored

    return f"{prefix}{settings.BOT_TOKEN}/{file_path}"
