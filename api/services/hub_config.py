"""
api/services/hub_config.py
─────────────────────────────────────────────────────────────────────────────
Настройки связи с хабом UchetFP (airo.uchet.tech) в ShopSettings. Токен агента
шифруется (Fernet) и НИКОГДА не отдаётся через API — только флаг «задан» + маска.

Ключи ShopSettings:
  integ_hub_enabled   "1"/"0" — чаты уходят в хаб, ответы ночника приходят сюда
  integ_hub_url       адрес хаба (по умолчанию https://airo.uchet.tech)
  integ_hub_token     X-Agent-Token аккаунта reDonate в хабе (enc)
  integ_hub_ok_at     последний удачный обмен с хабом (ISO)
  integ_hub_error     последняя ошибка ("" — нет)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from api.services.crypto_service import decrypt_key, encrypt_key
from shared.models import ShopSettings

K_ENABLED = "integ_hub_enabled"
K_URL = "integ_hub_url"
K_TOKEN = "integ_hub_token"
K_OK_AT = "integ_hub_ok_at"
K_ERROR = "integ_hub_error"

DEFAULT_URL = "https://airo.uchet.tech"


@dataclass(frozen=True)
class HubConfig:
    url: str
    token: str


async def _get(db: AsyncSession, key: str) -> str | None:
    row = await db.get(ShopSettings, key)
    return row.value if row else None


async def _set(db: AsyncSession, key: str, value: str, description: str = "") -> None:
    row = await db.get(ShopSettings, key)
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=key, value=value, description=description))


def _dec(value: str | None) -> str:
    if not value:
        return ""
    try:
        return decrypt_key(value)
    except Exception:  # noqa: BLE001 — сменился ENCRYPTION_KEY: считаем токен не заданным
        return ""


def _mask(secret: str) -> str:
    if not secret:
        return ""
    return "••••" if len(secret) <= 8 else f"{secret[:4]}…{secret[-3:]}"


async def get_active(db: AsyncSession, require_enabled: bool = True) -> HubConfig | None:
    """Конфиг, если связь включена (или require_enabled=False) и токен задан; иначе None."""
    if require_enabled and (await _get(db, K_ENABLED)) != "1":
        return None
    token = _dec(await _get(db, K_TOKEN))
    if not token:
        return None
    url = ((await _get(db, K_URL)) or DEFAULT_URL).rstrip("/")
    return HubConfig(url=url, token=token)


async def mark_result(db: AsyncSession, error: str = "") -> None:
    """Итог обмена с хабом — для карточки в админке. Пишем только при смене,
    чтобы опрос раз в 5 с не дёргал БД лишний раз."""
    prev_err = (await _get(db, K_ERROR)) or ""
    if error:
        if prev_err != error[:500]:
            await _set(db, K_ERROR, error[:500])
        return
    if prev_err:
        await _set(db, K_ERROR, "")
    now = datetime.now(timezone.utc)
    prev_ok = await _get(db, K_OK_AT)
    try:
        stale = not prev_ok or (now - datetime.fromisoformat(prev_ok)).total_seconds() > 60
    except ValueError:
        stale = True
    if stale:
        await _set(db, K_OK_AT, now.isoformat())


async def overview(db: AsyncSession) -> dict:
    token = _dec(await _get(db, K_TOKEN))
    return {
        "enabled": (await _get(db, K_ENABLED)) == "1",
        "url": (await _get(db, K_URL)) or DEFAULT_URL,
        "token_set": bool(token),
        "token_masked": _mask(token),
        "ok_at": await _get(db, K_OK_AT),
        "error": (await _get(db, K_ERROR)) or "",
    }


async def update_config(
    db: AsyncSession, *, enabled: bool | None, url: str | None, token: str | None
) -> None:
    if enabled is not None:
        await _set(db, K_ENABLED, "1" if enabled else "0", "Хаб UchetFP: чаты вкл/выкл")
    if url is not None and url.strip():
        await _set(db, K_URL, url.strip().rstrip("/"), "Хаб UchetFP: адрес")
    if token:
        if token == "-":
            await _set(db, K_TOKEN, "")
        else:
            await _set(db, K_TOKEN, encrypt_key(token.strip()), "Хаб UchetFP: токен агента (enc)")
        await _set(db, K_ERROR, "")
    await db.flush()
