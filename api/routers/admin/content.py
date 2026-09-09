"""
api/routers/admin/content.py
─────────────────────────────────────────────────────────────────────────────
Управление контентом бота: тексты и фото-слоты.

Позволяет админу менять тексты и картинки экранов бота без правки кода.
Оверрайды хранятся в shop_settings под ключами content.text.* / content.photo.*.
Реестр редактируемых элементов — в shared/content/registry.py.

Картинки игр и сервисов сюда НЕ входят — они задаются в товарах.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.utils.admin_log import log_admin_action
from shared.content import (
    PHOTO_KEY_PREFIX,
    PHOTOS,
    TEXT_KEY_PREFIX,
    TEXTS,
    resolve_photo_url,
)
from shared.models import ShopSettings

router = APIRouter()

MAX_TEXT_LEN = 4096
MAX_URL_LEN = 512


# ── Schemas ───────────────────────────────────────────────────────────────────


class VariableOut(BaseModel):
    name: str
    hint: str
    system: bool


class TextItemOut(BaseModel):
    key: str
    label: str
    group: str
    default: str
    value: str          # текущий текст (оверрайд или дефолт)
    is_overridden: bool
    variables: list[VariableOut]


class PhotoItemOut(BaseModel):
    key: str
    label: str
    group: str
    hint: str
    url: str            # сохранённый (сырой) URL — как в БД
    preview_url: str    # абсолютный URL для показа
    is_set: bool


class ContentOut(BaseModel):
    texts: list[TextItemOut]
    photos: list[PhotoItemOut]


class TextUpdateIn(BaseModel):
    # None или пустая строка → сброс к дефолту
    value: str | None = Field(None, max_length=MAX_TEXT_LEN)


class PhotoUpdateIn(BaseModel):
    # None или пустая строка → убрать картинку (вернуть дефолт бота)
    url: str | None = Field(None, max_length=MAX_URL_LEN)


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _load_overrides(db: DbSession, prefix: str) -> dict[str, str]:
    result = await db.execute(
        select(ShopSettings.key, ShopSettings.value).where(
            ShopSettings.key.startswith(prefix)
        )
    )
    return {row.key[len(prefix):]: row.value for row in result.all()}


async def _get_row(db: DbSession, full_key: str) -> ShopSettings | None:
    result = await db.execute(select(ShopSettings).where(ShopSettings.key == full_key))
    return result.scalar_one_or_none()


async def _set_override(
    db: DbSession, full_key: str, value: str | None, description: str
) -> None:
    """Сохраняет оверрайд; при пустом значении — удаляет запись (сброс к дефолту)."""
    row = await _get_row(db, full_key)
    if value is None or not value.strip():
        if row is not None:
            await db.delete(row)
        return
    if row is not None:
        row.value = value
    else:
        db.add(ShopSettings(key=full_key, value=value, description=description))


# ── GET /admin/content ────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=ContentOut,
    dependencies=[require_permission("settings.view")],
)
async def get_content(db: DbSession, admin: CurrentAdmin) -> ContentOut:
    """Все редактируемые тексты и фото-слоты с текущими значениями."""
    text_overrides = await _load_overrides(db, TEXT_KEY_PREFIX)
    photo_overrides = await _load_overrides(db, PHOTO_KEY_PREFIX)

    texts_out: list[TextItemOut] = []
    for key, item in TEXTS.items():
        override = text_overrides.get(key)
        is_overridden = bool(override and override.strip())
        texts_out.append(
            TextItemOut(
                key=key,
                label=item.label,
                group=item.group,
                default=item.default,
                value=override if is_overridden else item.default,
                is_overridden=is_overridden,
                variables=[
                    VariableOut(name=v.name, hint=v.hint, system=v.system)
                    for v in item.variables
                ],
            )
        )

    photos_out: list[PhotoItemOut] = []
    for key, item in PHOTOS.items():
        raw = photo_overrides.get(key) or ""
        is_set = bool(raw.strip())
        photos_out.append(
            PhotoItemOut(
                key=key,
                label=item.label,
                group=item.group,
                hint=item.hint,
                url=raw,
                preview_url=resolve_photo_url(raw) or "",
                is_set=is_set,
            )
        )

    return ContentOut(texts=texts_out, photos=photos_out)


# ── PATCH /admin/content/text/{key} ───────────────────────────────────────────


@router.patch(
    "/text/{key}",
    dependencies=[require_permission("settings.edit")],
)
async def update_text(
    key: str,
    body: TextUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """Меняет текст экрана бота. Пустое значение сбрасывает к дефолту."""
    item = TEXTS.get(key)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Неизвестный текст")

    await _set_override(
        db, TEXT_KEY_PREFIX + key, body.value, description=f"Текст бота: {item.label}"
    )
    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="content.text.update",
        entity_type="shop_settings",
        entity_id=None,
        after_data={"key": key, "reset": not (body.value and body.value.strip())},
    )

    is_overridden = bool(body.value and body.value.strip())
    return {
        "key": key,
        "value": body.value if is_overridden else item.default,
        "is_overridden": is_overridden,
    }


# ── PATCH /admin/content/photo/{key} ──────────────────────────────────────────


@router.patch(
    "/photo/{key}",
    dependencies=[require_permission("settings.edit")],
)
async def update_photo(
    key: str,
    body: PhotoUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """Ставит/убирает картинку экрана бота. Пустое значение убирает картинку."""
    item = PHOTOS.get(key)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Неизвестный фото-слот")

    url = (body.url or "").strip()
    if url and not (url.startswith("/") or url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "URL должен начинаться с / или http(s)://",
        )

    await _set_override(
        db, PHOTO_KEY_PREFIX + key, url or None, description=f"Фото бота: {item.label}"
    )
    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="content.photo.update",
        entity_type="shop_settings",
        entity_id=None,
        after_data={"key": key, "url": url, "reset": not url},
    )

    return {
        "key": key,
        "url": url,
        "preview_url": resolve_photo_url(url) or "",
        "is_set": bool(url),
    }
