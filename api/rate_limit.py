"""
api/rate_limit.py
─────────────────────────────────────────────────────────────────────────────
Централизованная настройка slowapi rate limiting.

Ключ лимита:
  - Авторизованный пользователь → "user:<id>" (защищает от NAT-коллизий)
  - Анонимный запрос → IP-адрес

Лимитер использует Redis (DB 3) чтобы не конфликтовать с Celery (DB 1/2).
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from shared.config import settings


def _get_user_or_ip(request: Request) -> str:
    """
    Кастомный key_func для slowapi.

    Если в request.state.user есть объект User (установленный middleware),
    лимитируем по user.id — это защищает от NAT-коллизий.
    В текущей архитектуре авторизация идёт через Depends, поэтому
    для большинства запросов ключом будет IP. Для перехода на user-based
    лимит нужно добавить middleware, который извлекает JWT и пишет user в state.
    """
    user = getattr(request.state, "user", None)
    if user is not None:
        return f"user:{user.id}"
    return get_remote_address(request)


# Redis DB 3 — отдельная от Celery (DB 1) и result backend (DB 2)
_redis_url = settings.REDIS_URL.rstrip("/")
# REDIS_URL заканчивается на /0 — заменяем базу на 3
_storage_uri = _redis_url[:-1] + "3" if _redis_url.endswith("/0") else _redis_url + "/3"

limiter = Limiter(
    key_func=_get_user_or_ip,
    storage_uri=_storage_uri,
    # При недоступности Redis не роняем сервис — просто пропускаем лимит
    in_memory_fallback_enabled=True,
)
