"""
api/utils/thumbs.py
─────────────────────────────────────────────────────────────────────────────
Уменьшенные WebP-копии загруженных картинок для быстрой загрузки сайта:
/static/uploads/<имя>.png → <имя>.w320.webp и <имя>.w640.webp рядом.
Сайт берёт копию нужной ширины (src/utils/thumb.ts), при её отсутствии —
оригинал. Обложки игр 100–600 КБ PNG → 10–40 КБ WebP.

Создаются при загрузке (api/routers/uploads.py) и разово для старых файлов:
    python -m api.utils.thumbs /static/uploads
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

WIDTHS = (320, 640)
_SOURCE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def thumb_path(src: Path, width: int) -> Path:
    return src.with_name(f"{src.stem}.w{width}.webp")


def make_thumbs(src: Path) -> None:
    """Создаёт недостающие копии. Ошибки не мешают загрузке — только в лог."""
    if src.suffix.lower() not in _SOURCE_EXT or ".w" in src.stem:
        return
    try:
        from PIL import Image

        with Image.open(src) as im:
            im.load()
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA")
            for w in WIDTHS:
                out = thumb_path(src, w)
                if out.exists():
                    continue
                copy = im.copy()
                if copy.width > w:
                    copy.thumbnail((w, w * 4), Image.LANCZOS)
                copy.save(out, "WEBP", quality=82, method=6)
    except Exception as exc:
        logger.warning("thumbs: не удалось обработать %s: %s", src, exc)


if __name__ == "__main__":
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "/static/uploads")
    files = [p for p in folder.iterdir() if p.is_file()]
    for p in files:
        make_thumbs(p)
    print(f"обработано файлов: {len(files)}")
