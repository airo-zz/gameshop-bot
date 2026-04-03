"""
api/services/crypto_service.py — шифрование ключей выдачи
api/services/cart_service.py   — управление корзиной
"""

# ════════════════════════════════════════════════════════════════════════════
# CRYPTO SERVICE
# ════════════════════════════════════════════════════════════════════════════

import base64
from cryptography.fernet import Fernet
from shared.config import settings


def _get_fernet() -> Fernet:
    if not settings.ENCRYPTION_KEY:
        raise RuntimeError("ENCRYPTION_KEY не задан в .env")
    key = settings.ENCRYPTION_KEY.encode()
    # Fernet требует 32-байтовый urlsafe-base64 ключ
    if len(key) != 44:  # base64 32 байт = 44 символа
        import hashlib

        key = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
    return Fernet(key)


def encrypt_key(plaintext: str) -> str:
    """Шифрует ключ/код выдачи перед сохранением в БД."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    """Расшифровывает ключ при выдаче пользователю."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
