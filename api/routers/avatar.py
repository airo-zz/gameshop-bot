"""
api/routers/avatar.py
─────────────────────────────────────────────────────────────────────────────
GET /avatar/{telegram_id} — аватар пользователя Telegram через наш сервер.

Зачем: ссылка api.telegram.org/file/bot<TOKEN>/<file_path> живёт ~час и
содержит токен бота — отдавать её в браузер нельзя. Здесь картинку берём у
Bot API сами (getUserProfilePhotos → getFile → download), кладём в дисковый кэш
на сутки и отдаём байтами. Нет фото / пользователь скрыл его — 404, фронт
показывает букву.
─────────────────────────────────────────────────────────────────────────────
"""

import asyncio
import logging
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from shared.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

CACHE_DIR = Path("/static/avatars")
CACHE_TTL = 24 * 3600          # перекачиваем не чаще раза в сутки
MISS_TTL = 6 * 3600            # «фото нет» тоже кэшируем, чтобы не долбить Bot API
_locks: dict[int, asyncio.Lock] = {}


async def _download(telegram_id: int) -> bytes | None:
    api = f"https://api.telegram.org/bot{settings.BOT_TOKEN}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{api}/getUserProfilePhotos", params={"user_id": telegram_id, "limit": 1})
        photos = r.json().get("result", {}).get("photos") if r.status_code == 200 else None
        if not photos:
            return None
        # Берём ближайший к 320px размер — хватает для аватара и не тяжело
        sizes = sorted(photos[0], key=lambda s: abs(s.get("width", 0) - 320))
        r = await client.get(f"{api}/getFile", params={"file_id": sizes[0]["file_id"]})
        file_path = r.json().get("result", {}).get("file_path") if r.status_code == 200 else None
        if not file_path:
            return None
        r = await client.get(f"https://api.telegram.org/file/bot{settings.BOT_TOKEN}/{file_path}")
        return r.content if r.status_code == 200 else None


@router.get("/{telegram_id}")
async def get_avatar(telegram_id: int):
    if telegram_id <= 0 or not settings.BOT_TOKEN:
        raise HTTPException(status_code=404)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    img = CACHE_DIR / f"{telegram_id}.jpg"
    miss = CACHE_DIR / f"{telegram_id}.none"
    now = time.time()

    def fresh(p: Path, ttl: int) -> bool:
        return p.exists() and now - p.stat().st_mtime < ttl

    if not fresh(img, CACHE_TTL) and not fresh(miss, MISS_TTL):
        lock = _locks.setdefault(telegram_id, asyncio.Lock())
        async with lock:
            if not fresh(img, CACHE_TTL) and not fresh(miss, MISS_TTL):
                try:
                    data = await _download(telegram_id)
                except httpx.HTTPError as exc:
                    logger.warning("avatar %s: Bot API недоступен: %s", telegram_id, exc)
                    data = None
                    if img.exists():  # отдадим устаревшую копию, чем ничего
                        return FileResponse(img, media_type="image/jpeg")
                if data:
                    img.write_bytes(data)
                    miss.unlink(missing_ok=True)
                else:
                    miss.touch()
                    img.unlink(missing_ok=True)

    if not img.exists():
        raise HTTPException(status_code=404)
    return FileResponse(img, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


def avatar_url(telegram_id: int) -> str | None:
    """Публичный путь аватара (без токена). Работает и для сайта, и для miniapp.
    У пользователей сайта без Telegram аватара нет — None."""
    if telegram_id <= 0:
        return None
    return f"/api/v1/avatar/{telegram_id}"
