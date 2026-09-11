"""
api/services/fragment_config.py
─────────────────────────────────────────────────────────────────────────────
Настройки интеграции Fragment (автопополнение Telegram Stars/Premium) в БД.

Секреты (cookie Fragment и seed TON-кошелька) шифруются (Fernet) и НИКОГДА не
отдаются в открытом виде через API — только флаг «задано» + маска. Полный
(расшифрованный) конфиг берёт движок автовыдачи на сервере.

Ключи в ShopSettings:
  integ_fragment_enabled, integ_fragment_cookie(enc), integ_ton_seed(enc),
  integ_payment_method, integ_stars_min, integ_stars_max, integ_show_sender
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from api.services.crypto_service import decrypt_key, encrypt_key
from shared.models import ShopSettings

K_ENABLED = "integ_fragment_enabled"
K_COOKIE = "integ_fragment_cookie"       # encrypted
K_SEED = "integ_ton_seed"                # encrypted
K_PAYMENT = "integ_payment_method"       # 'ton' | 'usdt_ton'
K_STARS_MIN = "integ_stars_min"
K_STARS_MAX = "integ_stars_max"
K_SHOW_SENDER = "integ_show_sender"

PAYMENT_METHODS = ("ton", "usdt_ton")


async def _get(db: AsyncSession, key: str) -> str | None:
    row = await db.get(ShopSettings, key)
    return row.value if row else None


async def _set(db: AsyncSession, key: str, value: str, description: str = "") -> None:
    row = await db.get(ShopSettings, key)
    if row:
        row.value = value
        if description:
            row.description = description
    else:
        db.add(ShopSettings(key=key, value=value, description=description))


def _mask(secret: str | None) -> str:
    if not secret:
        return ""
    if len(secret) <= 6:
        return "••••"
    return f"{secret[:3]}…{secret[-3:]}"


async def get_full_config(db: AsyncSession) -> dict:
    """Полный конфиг с расшифрованными секретами — ТОЛЬКО для серверного движка."""
    cookie_enc = await _get(db, K_COOKIE)
    seed_enc = await _get(db, K_SEED)
    try:
        cookie = decrypt_key(cookie_enc) if cookie_enc else ""
    except Exception:
        cookie = ""
    try:
        seed = decrypt_key(seed_enc) if seed_enc else ""
    except Exception:
        seed = ""
    return {
        "enabled": (await _get(db, K_ENABLED)) == "1",
        "fragment_cookie": cookie,
        "ton_seed": seed,
        "payment_method": (await _get(db, K_PAYMENT)) or "ton",
        "min_stars": int(await _get(db, K_STARS_MIN) or 50),
        "max_stars": int(await _get(db, K_STARS_MAX) or 1_000_000),
        "show_sender": (await _get(db, K_SHOW_SENDER)) == "1",
    }


async def get_admin_view(db: AsyncSession) -> dict:
    """Безопасный вид для админки: секреты замаскированы + флаги «задано»."""
    cookie_enc = await _get(db, K_COOKIE)
    seed_enc = await _get(db, K_SEED)
    cookie_plain = ""
    seed_plain = ""
    try:
        cookie_plain = decrypt_key(cookie_enc) if cookie_enc else ""
    except Exception:
        cookie_plain = ""
    try:
        seed_plain = decrypt_key(seed_enc) if seed_enc else ""
    except Exception:
        seed_plain = ""
    return {
        "enabled": (await _get(db, K_ENABLED)) == "1",
        "cookie_set": bool(cookie_enc),
        "cookie_masked": _mask(cookie_plain),
        "seed_set": bool(seed_enc),
        "seed_masked": _mask(seed_plain),
        "payment_method": (await _get(db, K_PAYMENT)) or "ton",
        "stars_min": int(await _get(db, K_STARS_MIN) or 50),
        "stars_max": int(await _get(db, K_STARS_MAX) or 1_000_000),
        "show_sender": (await _get(db, K_SHOW_SENDER)) == "1",
    }


async def update_config(
    db: AsyncSession,
    *,
    enabled: bool | None = None,
    cookie: str | None = None,       # непустая строка — заменить; None/"" — не трогать
    ton_seed: str | None = None,     # непустая строка — заменить; None/"" — не трогать
    payment_method: str | None = None,
    stars_min: int | None = None,
    stars_max: int | None = None,
    show_sender: bool | None = None,
) -> None:
    if enabled is not None:
        await _set(db, K_ENABLED, "1" if enabled else "0", "Fragment автопополнение вкл/выкл")
    if cookie:
        await _set(db, K_COOKIE, encrypt_key(cookie.strip()), "Fragment cookie (enc)")
    if ton_seed:
        await _set(db, K_SEED, encrypt_key(ton_seed.strip()), "TON seed (enc)")
    if payment_method in PAYMENT_METHODS:
        await _set(db, K_PAYMENT, payment_method, "Fragment payment method")
    if stars_min is not None:
        await _set(db, K_STARS_MIN, str(int(stars_min)), "Мин. звёзд")
    if stars_max is not None:
        await _set(db, K_STARS_MAX, str(int(stars_max)), "Макс. звёзд")
    if show_sender is not None:
        await _set(db, K_SHOW_SENDER, "1" if show_sender else "0", "Показывать отправителя")
    await db.flush()
