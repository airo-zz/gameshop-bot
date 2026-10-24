"""
api/services/fazer_config.py
─────────────────────────────────────────────────────────────────────────────
Настройки интеграции FazerCards в ShopSettings. API-ключ шифруется (Fernet) и
НИКОГДА не отдаётся через API — только флаг «задан» + маска.

Ключи ShopSettings:
  integ_fazer_enabled        "1"/"0" — автовыдача вкл/выкл
  integ_fazer_api_key        API-ключ fc_… (enc)
  integ_fazer_low_balance    порог баланса $, ниже — уведомление персоналу
  integ_fazer_low_notified   "1" — уже предупредили (сброс при пополнении)
  integ_fazer_balance        последний известный баланс $ (кэш для админки)
  integ_fazer_balance_at     когда обновлён (ISO)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from api.services.crypto_service import decrypt_key, encrypt_key
from shared.models import ShopSettings

K_ENABLED = "integ_fazer_enabled"
K_API_KEY = "integ_fazer_api_key"
K_LOW = "integ_fazer_low_balance"
K_LOW_NOTIFIED = "integ_fazer_low_notified"
K_BALANCE = "integ_fazer_balance"
K_BALANCE_AT = "integ_fazer_balance_at"

DEFAULT_LOW_BALANCE = 10.0


async def _get(db: AsyncSession, key: str) -> str | None:
    row = await db.get(ShopSettings, key)
    return row.value if row else None


async def _set(db: AsyncSession, key: str, value: str, description: str = "") -> None:
    row = await db.get(ShopSettings, key)
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=key, value=value, description=description))


async def _delete(db: AsyncSession, key: str) -> None:
    row = await db.get(ShopSettings, key)
    if row:
        await db.delete(row)


def _dec(value: str | None) -> str:
    if not value:
        return ""
    try:
        return decrypt_key(value)
    except Exception:  # noqa: BLE001 — сменился ENCRYPTION_KEY: считаем ключ не заданным
        return ""


def _mask(secret: str) -> str:
    if not secret:
        return ""
    return "••••" if len(secret) <= 8 else f"{secret[:5]}…{secret[-3:]}"


async def get_api_key(db: AsyncSession) -> str:
    return _dec(await _get(db, K_API_KEY))


async def is_enabled(db: AsyncSession) -> bool:
    return (await _get(db, K_ENABLED)) == "1"


async def get_low_threshold(db: AsyncSession) -> float:
    try:
        return float(await _get(db, K_LOW) or DEFAULT_LOW_BALANCE)
    except ValueError:
        return DEFAULT_LOW_BALANCE


async def get_admin_view(db: AsyncSession) -> dict:
    key = await get_api_key(db)
    balance = await _get(db, K_BALANCE)
    return {
        "enabled": await is_enabled(db),
        "api_key_set": bool(key),
        "api_key_masked": _mask(key),
        "low_balance": await get_low_threshold(db),
        "balance": float(balance) if balance not in (None, "") else None,
        "balance_at": await _get(db, K_BALANCE_AT),
    }


async def update_config(
    db: AsyncSession,
    *,
    enabled: bool | None = None,
    api_key: str | None = None,   # непустая строка — заменить; "-" — удалить; None/"" — не трогать
    low_balance: float | None = None,
) -> None:
    if enabled is not None:
        await _set(db, K_ENABLED, "1" if enabled else "0", "FazerCards автовыдача вкл/выкл")
    if api_key and api_key.strip():
        k = api_key.strip()
        if k == "-":
            await _delete(db, K_API_KEY)
        else:
            await _set(db, K_API_KEY, encrypt_key(k), "FazerCards API key (enc)")
        await _delete(db, K_BALANCE)
        await _delete(db, K_BALANCE_AT)
    if low_balance is not None:
        await _set(db, K_LOW, str(max(0.0, float(low_balance))), "FazerCards порог баланса $")
        await _set(db, K_LOW_NOTIFIED, "0")
    await db.flush()


async def store_balance(db: AsyncSession, balance: float) -> bool:
    """Сохраняет баланс. True — баланс только что упал ниже порога (надо уведомить)."""
    await _set(db, K_BALANCE, f"{balance:.4f}", "FazerCards баланс $ (кэш)")
    await _set(db, K_BALANCE_AT, datetime.now(timezone.utc).isoformat())
    threshold = await get_low_threshold(db)
    notified = (await _get(db, K_LOW_NOTIFIED)) == "1"
    if threshold > 0 and balance < threshold and not notified:
        await _set(db, K_LOW_NOTIFIED, "1")
        return True
    if balance >= threshold and notified:
        await _set(db, K_LOW_NOTIFIED, "0")
    return False
