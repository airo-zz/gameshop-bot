"""
api/services/fragment_config.py
─────────────────────────────────────────────────────────────────────────────
Настройки интеграции Fragment (автопополнение Telegram Stars/Premium) в БД.

Секреты (три куки fragment.com + seed TON-кошелька) шифруются (Fernet) и НИКОГДА
не отдаются в открытом виде через API — только флаг «задано» + маска. Полный
(расшифрованный) конфиг берёт движок автовыдачи на сервере.

Cookie Fragment хранится ТРЕМЯ отдельными полями (как в UchetFP):
  stel_ssid, stel_token, stel_ton_token — из них собирается заголовок Cookie
  «stel_ssid=…; stel_token=…; stel_ton_token=…». stel_ton_token обязателен:
  без него Fragment на покупку отвечает need_ton.

Ключи в ShopSettings:
  integ_fragment_enabled, integ_stel_ssid(enc), integ_stel_token(enc),
  integ_stel_ton_token(enc), integ_ton_seed(enc), integ_payment_method,
  integ_stars_min, integ_stars_max, integ_show_sender
  (integ_fragment_cookie — legacy единая кука, читается как fallback)
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from api.services.crypto_service import decrypt_key, encrypt_key
from shared.models import ShopSettings

K_ENABLED = "integ_fragment_enabled"
K_SSID = "integ_stel_ssid"               # encrypted
K_TOKEN = "integ_stel_token"             # encrypted
K_TON_TOKEN = "integ_stel_ton_token"     # encrypted
K_COOKIE = "integ_fragment_cookie"       # legacy единая кука (fallback), encrypted
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


def clean_stel(value: str | None, name: str) -> str:
    """Нормализовать значение куки stel_*: убрать возможный префикс «name=»,
    кавычки и хвостовую «;». Пусто → "". (Логика как в UchetFP.)"""
    v = (value or "").strip().strip('"').strip()
    if v.lower().startswith(name.lower() + "="):
        v = v.split("=", 1)[1].strip()
    return v.rstrip(";").strip()


def _dec(value: str | None) -> str:
    """Расшифровать значение (или "" при отсутствии/ошибке)."""
    if not value:
        return ""
    try:
        return decrypt_key(value)
    except Exception:
        return ""


def _assemble_cookie(ssid: str, token: str, ton_token: str, legacy: str) -> str:
    """Собрать заголовок Cookie из трёх кук. Если все три заданы — собираем;
    иначе fallback на legacy единую куку (старый формат)."""
    if ssid and token and ton_token:
        return f"stel_ssid={ssid}; stel_token={token}; stel_ton_token={ton_token}"
    return legacy or ""


async def get_full_config(db: AsyncSession) -> dict:
    """Полный конфиг с расшифрованными секретами — ТОЛЬКО для серверного движка."""
    ssid = _dec(await _get(db, K_SSID))
    token = _dec(await _get(db, K_TOKEN))
    ton_token = _dec(await _get(db, K_TON_TOKEN))
    legacy = _dec(await _get(db, K_COOKIE))
    cookie = _assemble_cookie(ssid, token, ton_token, legacy)
    seed = _dec(await _get(db, K_SEED))
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
    """Безопасный вид для админки: каждая кука/seed — флаг «задано» + маска."""
    ssid_enc = await _get(db, K_SSID)
    token_enc = await _get(db, K_TOKEN)
    ton_token_enc = await _get(db, K_TON_TOKEN)
    seed_enc = await _get(db, K_SEED)
    return {
        "enabled": (await _get(db, K_ENABLED)) == "1",
        "ssid_set": bool(ssid_enc),
        "ssid_masked": _mask(_dec(ssid_enc)),
        "token_set": bool(token_enc),
        "token_masked": _mask(_dec(token_enc)),
        "ton_token_set": bool(ton_token_enc),
        "ton_token_masked": _mask(_dec(ton_token_enc)),
        "seed_set": bool(seed_enc),
        "seed_masked": _mask(_dec(seed_enc)),
        "payment_method": (await _get(db, K_PAYMENT)) or "ton",
        "stars_min": int(await _get(db, K_STARS_MIN) or 50),
        "stars_max": int(await _get(db, K_STARS_MAX) or 1_000_000),
        "show_sender": (await _get(db, K_SHOW_SENDER)) == "1",
    }


async def update_config(
    db: AsyncSession,
    *,
    enabled: bool | None = None,
    stel_ssid: str | None = None,        # непустая строка — заменить; None/"" — не трогать
    stel_token: str | None = None,       # непустая строка — заменить; None/"" — не трогать
    stel_ton_token: str | None = None,   # непустая строка — заменить; None/"" — не трогать
    ton_seed: str | None = None,         # непустая строка — заменить; None/"" — не трогать
    payment_method: str | None = None,
    stars_min: int | None = None,
    stars_max: int | None = None,
    show_sender: bool | None = None,
) -> None:
    if enabled is not None:
        await _set(db, K_ENABLED, "1" if enabled else "0", "Fragment автопополнение вкл/выкл")
    if stel_ssid and stel_ssid.strip():
        await _set(db, K_SSID, encrypt_key(clean_stel(stel_ssid, "stel_ssid")), "Fragment stel_ssid (enc)")
    if stel_token and stel_token.strip():
        await _set(db, K_TOKEN, encrypt_key(clean_stel(stel_token, "stel_token")), "Fragment stel_token (enc)")
    if stel_ton_token and stel_ton_token.strip():
        await _set(db, K_TON_TOKEN, encrypt_key(clean_stel(stel_ton_token, "stel_ton_token")), "Fragment stel_ton_token (enc)")
    if ton_seed and ton_seed.strip():
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
