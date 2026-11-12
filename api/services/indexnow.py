"""
api/services/indexnow.py
─────────────────────────────────────────────────────────────────────────────
IndexNow — сообщаем поисковикам (Яндекс, Bing и другие участники протокола),
что страница появилась или изменилась: робот приходит за часы, а не за дни.
Важно для новинок (релиз игры, обновление) — по горячим запросам выигрывает
тот, чья страница проиндексирована первой.

Ключ публичный по протоколу: файл <ключ>.txt лежит в корне сайта
(miniapp/public/), поисковик проверяет по нему, что адреса присылает владелец.
Вызывается из админки при сохранении игры/раздела; ошибки только в лог.
─────────────────────────────────────────────────────────────────────────────
"""

import logging

import httpx

from shared.config import settings

log = logging.getLogger(__name__)

# Яндекс — напрямую (основной поиск аудитории), остальные участники — через общий узел
ENDPOINTS = ("https://yandex.com/indexnow", "https://api.indexnow.org/indexnow")


def game_urls(game, categories=()) -> list[str]:
    """Адреса страницы игры и её активных разделов."""
    base = settings.FRONTEND_URL.rstrip("/")
    urls = [f"{base}/game/{game.slug}"]
    urls += [f"{base}/game/{game.slug}/{c.slug}" for c in categories
             if getattr(c, "is_active", True) and not getattr(c, "parent_id", None)]
    return urls


async def submit(urls: list[str]) -> None:
    key = settings.INDEXNOW_KEY
    if not key or not urls or settings.ENVIRONMENT != "production":
        return
    base = settings.FRONTEND_URL.rstrip("/")
    payload = {
        "host": base.split("://", 1)[-1],
        "key": key,
        "keyLocation": f"{base}/{key}.txt",
        "urlList": list(dict.fromkeys(urls))[:10000],
    }
    async with httpx.AsyncClient(timeout=10) as client:
        for endpoint in ENDPOINTS:
            try:
                r = await client.post(endpoint, json=payload)
                # 200/202 — принято; 422/403 — ключ или адреса не прошли проверку
                log.info("indexnow %s → %s (%d urls)", endpoint, r.status_code, len(payload["urlList"]))
            except httpx.HTTPError as e:
                log.warning("indexnow %s failed: %s", endpoint, e)
