"""
shared/content/service.py
─────────────────────────────────────────────────────────────────────────────
Рендер управляемого контента.

  • get_text(db, key, **vars)   — текст с учётом оверрайда из shop_settings
  • render_default(key, **vars) — только дефолт (без обращения к БД)
  • get_photo_url(db, key)      — абсолютный URL картинки слота или None

Оверрайды лежат в shop_settings под ключами:
  content.text.<key>   — шаблон текста
  content.photo.<key>  — URL картинки (относительный /static/... или полный)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import settings
from shared.models import ShopSettings

from .registry import TEXTS

TEXT_KEY_PREFIX = "content.text."
PHOTO_KEY_PREFIX = "content.photo."


# ── Безопасное форматирование ─────────────────────────────────────────────────


class _SafeFormatter(string.Formatter):
    """
    Форматтер, устойчивый к ошибкам админского ввода:
      • отсутствующий плейсхолдер → остаётся как {name} (видно, что переменной нет)
      • некорректный спецификатор формата → значение подставляется как есть
    """

    def get_value(self, key, args, kwargs):  # type: ignore[override]
        if isinstance(key, str):
            if key in kwargs:
                return kwargs[key]
            return "{" + key + "}"
        try:
            return super().get_value(key, args, kwargs)
        except (IndexError, KeyError):
            return "{" + str(key) + "}"

    def format_field(self, value, format_spec):  # type: ignore[override]
        try:
            return super().format_field(value, format_spec)
        except (ValueError, TypeError):
            return str(value)

    def convert_field(self, value, conversion):  # type: ignore[override]
        try:
            return super().convert_field(value, conversion)
        except (ValueError, TypeError):
            return value


_formatter = _SafeFormatter()


def safe_format(template: str, values: dict) -> str:
    """Подставляет values в template, не падая на кривом вводе."""
    try:
        return _formatter.vformat(template, (), values)
    except (ValueError, IndexError, KeyError):
        # Полностью битые скобки — отдаём шаблон как есть
        return template


# ── Системные переменные ──────────────────────────────────────────────────────


def _docs_base() -> str:
    base = settings.MINIAPP_URL.rstrip("/") if settings.MINIAPP_URL else settings.FRONTEND_URL.rstrip("/")
    return base


def system_vars() -> dict:
    """Переменные, доступные в любом тексте (подставляются автоматически)."""
    base = _docs_base()
    return {
        "shop_name": settings.SHOP_NAME,
        "tagline": settings.SHOP_TAGLINE,
        "support": f"@{settings.SHOP_SUPPORT_USERNAME}",
        "support_username": settings.SHOP_SUPPORT_USERNAME,
        "terms_url": f"{base}/legal/terms.html",
        "privacy_url": f"{base}/legal/privacy.html",
    }


# ── Оверрайды ─────────────────────────────────────────────────────────────────


async def _get_override(db: AsyncSession, full_key: str) -> str | None:
    result = await db.execute(
        select(ShopSettings.value).where(ShopSettings.key == full_key)
    )
    return result.scalar_one_or_none()


# ── Тексты ────────────────────────────────────────────────────────────────────


def render_default(key: str, **dynamic) -> str:
    """Дефолтный текст без обращения к БД (fallback для не-async вызовов)."""
    item = TEXTS.get(key)
    if item is None:
        return ""
    return safe_format(item.default, {**system_vars(), **dynamic})


async def get_text(db: AsyncSession, key: str, **dynamic) -> str:
    """Текст с учётом оверрайда из shop_settings."""
    item = TEXTS.get(key)
    if item is None:
        return ""
    override = await _get_override(db, TEXT_KEY_PREFIX + key)
    template = override if (override is not None and override.strip()) else item.default
    return safe_format(template, {**system_vars(), **dynamic})


# ── Фото ──────────────────────────────────────────────────────────────────────


def resolve_photo_url(url: str | None) -> str | None:
    """Приводит сохранённый URL картинки к абсолютному (для отправки ботом)."""
    if not url or not url.strip():
        return None
    url = url.strip()
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base = settings.FRONTEND_URL.rstrip("/")
    if url.startswith("/"):
        return f"{base}{url}"
    return f"{base}/static/{url}"


async def get_photo_url(db: AsyncSession, key: str) -> str | None:
    """Абсолютный URL картинки слота или None, если не задана."""
    override = await _get_override(db, PHOTO_KEY_PREFIX + key)
    return resolve_photo_url(override)
