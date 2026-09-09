"""
shared/content/
─────────────────────────────────────────────────────────────────────────────
Управляемый контент бота: тексты и фото, редактируемые из админ-панели
без изменения кода. Оверрайды хранятся в таблице shop_settings.
─────────────────────────────────────────────────────────────────────────────
"""

from .registry import PHOTOS, TEXTS, PhotoItem, TextItem, Variable
from .service import (
    PHOTO_KEY_PREFIX,
    TEXT_KEY_PREFIX,
    get_photo_url,
    get_text,
    render_default,
    resolve_photo_url,
    safe_format,
    system_vars,
)

__all__ = [
    "TEXTS",
    "PHOTOS",
    "TextItem",
    "PhotoItem",
    "Variable",
    "TEXT_KEY_PREFIX",
    "PHOTO_KEY_PREFIX",
    "get_text",
    "get_photo_url",
    "render_default",
    "resolve_photo_url",
    "safe_format",
    "system_vars",
]
