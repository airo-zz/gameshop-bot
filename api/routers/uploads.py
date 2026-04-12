"""
api/routers/uploads.py
─────────────────────────────────────────────────────────────────────────────
Эндпоинт загрузки изображений для admin-бота.

POST /api/v1/admin/upload
  - Авторизация: заголовок X-Internal-Token = settings.INTERNAL_API_KEY
  - Принимает multipart/form-data с полем "file"
  - Сохраняет в /static/uploads/{uuid}.{ext}
  - Возвращает {"url": "/static/uploads/{uuid}.{ext}"}

Поддерживаемые форматы: jpg, jpeg, png, webp
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, status

from api.deps_admin import CurrentAdmin, require_permission
from shared.config import settings

router = APIRouter()

UPLOAD_DIR = Path("/static/uploads")
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def require_internal_token(
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Dependency: проверяет служебный токен для межсервисных запросов (bot → api)."""
    if not settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="INTERNAL_API_KEY не настроен на сервере",
        )
    if x_internal_token != settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Неверный внутренний токен",
        )


@router.post("/upload", dependencies=[Depends(require_internal_token)])
async def upload_image(file: UploadFile) -> dict:
    """
    Принимает изображение от admin-бота, сохраняет локально.
    Возвращает постоянный URL вида /static/uploads/{uuid}.{ext}.
    """
    # Проверяем content-type
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Неподдерживаемый тип файла: {content_type}. "
                "Разрешены: jpg, png, webp"
            ),
        )

    # Читаем содержимое с ограничением размера
    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл слишком большой. Максимум 10 МБ.",
        )

    # Создаём директорию если не существует
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}.{ext}"
    dest = UPLOAD_DIR / filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(contents)

    return {"url": f"/static/uploads/{filename}"}


@router.post(
    "/upload/image",
    dependencies=[require_permission("catalog.edit")],
)
async def upload_image_jwt(
    file: UploadFile,
    admin: CurrentAdmin,
) -> dict:
    """
    Загрузка изображения из MiniApp админ-панели.
    Авторизация: JWT (как у всех admin endpoints).
    Принимает multipart/form-data с полем "file".
    Возвращает {"url": "/static/uploads/{uuid}.{ext}"}.
    """
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Неподдерживаемый тип файла: {content_type}. "
                "Разрешены: jpg, png, webp"
            ),
        )

    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл слишком большой. Максимум 10 МБ.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}.{ext}"
    dest = UPLOAD_DIR / filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(contents)

    return {"url": f"/static/uploads/{filename}"}
