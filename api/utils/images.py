"""
api/utils/images.py — проверка и сжатие загружаемых картинок.

Тип файла от браузера (Content-Type) не доказательство: проверяем, что это
действительно картинка, открывая её Pillow. Вложения чата пересохраняем в WebP:
меньше места на диске, без метаданных (EXIF с геолокацией телефона и т.п.).
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError

# Защита от «бомб» — картинок с огромным разрешением при маленьком файле
Image.MAX_IMAGE_PIXELS = 40_000_000

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class BadImage(ValueError):
    pass


def verify_image(data: bytes) -> str:
    """Формат картинки (JPEG/PNG/WEBP) или BadImage."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            im.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError) as e:
        raise BadImage("Файл не похож на картинку") from e
    if fmt not in ALLOWED_FORMATS:
        raise BadImage("Разрешены только jpg, png и webp")
    return fmt


def compress_to_webp(data: bytes, max_side: int = 1920, quality: int = 80) -> bytes:
    """Уменьшает до max_side по большей стороне и пересохраняет в WebP без метаданных."""
    verify_image(data)
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im)  # фото с телефона — правильный поворот
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
            im.thumbnail((max_side, max_side), Image.LANCZOS)
            out = io.BytesIO()
            im.save(out, "WEBP", quality=quality, method=4)
            return out.getvalue()
    except (OSError, Image.DecompressionBombError) as e:
        raise BadImage("Не удалось обработать картинку") from e
