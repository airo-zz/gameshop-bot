"""
api/utils/telegram_login.py
─────────────────────────────────────────────────────────────────────────────
Проверка подписи Telegram Login Widget (вход через браузер на сайте).

Отличие от initData (Mini App):
  • Login Widget: secret = SHA256(bot_token), затем HMAC-SHA256(secret, data_check_string).
  • initData:     secret = HMAC-SHA256(key="WebAppData", msg=bot_token).

data_check_string — строки "key=value" всех переданных полей (кроме hash),
отсортированные по ключу и склеенные через "\n".
"""

import hashlib
import hmac


def verify_login_widget(fields: dict[str, str], provided_hash: str, bot_token: str) -> bool:
    """
    Проверяет подпись данных Telegram Login Widget.

    Args:
        fields: поля виджета без hash (id, first_name, auth_date, опц. last_name/username/photo_url).
                Значения — строки.
        provided_hash: значение hash из виджета.
        bot_token: токен бота.

    Returns:
        True если подпись валидна.
    """
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed_hash, provided_hash)
