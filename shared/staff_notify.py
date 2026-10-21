"""
shared/staff_notify.py
─────────────────────────────────────────────────────────────────────────────
Единая доставка служебных уведомлений персоналу (новые заказы, тикеты,
сообщения покупателей).

Куда шлём (по приоритету):
  1. Группа, привязанная командой /bindgroup в support-боте
     (ShopSettings[NOTIFY_CHAT_KEY]).
  2. settings.SUPPORT_NOTIFY_CHAT_ID из .env.
  3. Резерв — в личку всем активным admin_users: если группа не настроена
     или доставка в неё не удалась (бота удалили из группы и т.п.).
     Так уведомления не теряются молча.

Отправка: сначала support-бот, при ошибке — основной бот (у админа в личке
может быть открыт только один из них).

Есть async-версия (API, support-бот) и sync-версия (Celery worker).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging

import httpx
from sqlalchemy import text as sa_text

from shared.config import settings

logger = logging.getLogger(__name__)

NOTIFY_CHAT_KEY = "notify_chat_id"

_SQL_GROUP = sa_text("SELECT value FROM shop_settings WHERE key = :k")
_SQL_ADMINS = sa_text("SELECT telegram_id FROM admin_users WHERE is_active = true")


def _tokens() -> list[str]:
    tokens: list[str] = []
    if settings.SUPPORT_BOT_TOKEN and settings.SUPPORT_BOT_TOKEN != settings.BOT_TOKEN:
        tokens.append(settings.SUPPORT_BOT_TOKEN)
    tokens.append(settings.BOT_TOKEN)
    return tokens


def _group_id(value: str | None) -> int | None:
    try:
        v = int(str(value).strip()) if value is not None else 0
    except ValueError:
        v = 0
    return v or (settings.SUPPORT_NOTIFY_CHAT_ID or None)


def _payload(chat_id: int, text: str, reply_markup: dict | None) -> dict:
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return payload


def _log_fail(chat_id: int, token: str, resp: httpx.Response) -> None:
    logger.warning(
        "staff_notify: chat=%s token=%s... HTTP %s %s",
        chat_id, token[:10], resp.status_code, resp.text[:300],
    )


# ── async (API, support-бот) ────────────────────────────────────────────────


async def _send_one_async(client: httpx.AsyncClient, chat_id: int, text: str, markup: dict | None) -> bool:
    for token in _tokens():
        try:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json=_payload(chat_id, text, markup),
            )
        except httpx.HTTPError as exc:
            logger.warning("staff_notify: сеть chat=%s: %s", chat_id, exc)
            continue
        if resp.status_code == 200:
            return True
        _log_fail(chat_id, token, resp)
    return False


async def send_staff_async(db, text: str, reply_markup: dict | None = None) -> bool:
    """Шлёт уведомление персоналу. True — доставлено хотя бы одному адресату."""
    group = _group_id((await db.execute(_SQL_GROUP, {"k": NOTIFY_CHAT_KEY})).scalar_one_or_none())
    async with httpx.AsyncClient(timeout=10) as client:
        if group and await _send_one_async(client, group, text, reply_markup):
            return True
        admins = list((await db.execute(_SQL_ADMINS)).scalars().all())
        delivered = False
        for chat_id in admins:
            delivered = await _send_one_async(client, int(chat_id), text, reply_markup) or delivered
    if not delivered:
        logger.error("staff_notify: уведомление не доставлено (группа=%s, админов=%s)", group, len(admins))
    return delivered


# ── sync (Celery) ───────────────────────────────────────────────────────────

_sync_engine = None


def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        from sqlalchemy import create_engine
        _sync_engine = create_engine(settings.sync_url, pool_pre_ping=True, pool_size=2)
    return _sync_engine


def _send_one_sync(client: httpx.Client, chat_id: int, text: str, markup: dict | None) -> bool:
    for token in _tokens():
        try:
            resp = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json=_payload(chat_id, text, markup),
            )
        except httpx.HTTPError as exc:
            logger.warning("staff_notify: сеть chat=%s: %s", chat_id, exc)
            continue
        if resp.status_code == 200:
            return True
        _log_fail(chat_id, token, resp)
    return False


def send_staff_sync(text: str, reply_markup: dict | None = None) -> bool:
    """Sync-версия для Celery. Если не доставлено никому — бросает исключение,
    чтобы задача ушла в retry (временный сбой сети/Telegram)."""
    with _get_sync_engine().connect() as conn:
        group = _group_id(conn.execute(_SQL_GROUP, {"k": NOTIFY_CHAT_KEY}).scalar_one_or_none())
        admins = list(conn.execute(_SQL_ADMINS).scalars().all())
    with httpx.Client(timeout=10) as client:
        if group and _send_one_sync(client, group, text, reply_markup):
            return True
        delivered = False
        for chat_id in admins:
            delivered = _send_one_sync(client, int(chat_id), text, reply_markup) or delivered
    if not delivered:
        raise RuntimeError(f"staff_notify: не доставлено (группа={group}, админов={len(admins)})")
    return delivered
