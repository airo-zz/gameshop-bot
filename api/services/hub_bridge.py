"""
api/services/hub_bridge.py
─────────────────────────────────────────────────────────────────────────────
Мост чатов reDonate ↔ хаб UchetFP. Сайт работает как «агент» аккаунта
platform=redonate (протокол /agent/* хаба, заголовок X-Agent-Token):

  push_message(msg_id)   сообщение чата → POST /agent/messages
                         (диалог хаба funpay_chat_id = "rd-<chat.id>"; при первом
                         сообщении чата досылаем его историю — ночнику нужен контекст)
  poll_once()            GET /agent/outgoing → ответы ночника в чат покупателя
                         (sender_type=admin, source="hub" — обратно в хаб не уходят;
                         хаб сам кладёт их в ленту по ack) → POST ack
                         + раз в минуту /agent/heartbeat (хаб видит, что сайт на связи)

Вызывается из worker/tasks/hub_tasks.py. Ошибки сети не роняют чат магазина:
сообщение покупателя уже сохранено, в хаб его дошлёт ретрай задачи.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services import hub_config
from api.services.chat_service import ChatService
from shared.config import settings
from shared.models import User
from shared.models.chat import Chat, ChatMessage

logger = logging.getLogger(__name__)

CHAT_PREFIX = "rd-"
HISTORY_LIMIT = 30
TIMEOUT = httpx.Timeout(15.0, connect=5.0)
LOT_RE = re.compile(r"^__lot__\|[0-9a-f-]+\|(\d+)\|([\s\S]+)$")
AUTHOR = {"user": "buyer", "admin": "seller", "system": "system"}


class HubError(Exception):
    pass


def _client(cfg: hub_config.HubConfig) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=cfg.url, timeout=TIMEOUT, headers={"X-Agent-Token": cfg.token}
    )


def _check(r: httpx.Response) -> dict:
    if r.status_code == 401:
        raise HubError("Хаб не принял токен — проверьте токен аккаунта reDonate")
    if r.status_code >= 400:
        raise HubError(f"Хаб ответил {r.status_code}: {r.text[:200]}")
    try:
        return r.json()
    except ValueError:
        return {}


HEARTBEAT = {"account_username": "reDonate", "currency": "RUB", "agent_version": "redonate-1"}


def _heartbeat() -> dict:
    return {**HEARTBEAT, "event_loop_alive_at": datetime.now(timezone.utc).isoformat()}


async def check_connection(db: AsyncSession) -> str:
    """Heartbeat в хаб по сохранённым адресу и токену. "" — связь есть, иначе текст ошибки."""
    cfg = await hub_config.get_active(db, require_enabled=False)
    if cfg is None:
        return "Токен не задан"
    try:
        async with _client(cfg) as c:
            _check(await c.post("/agent/heartbeat", json=_heartbeat()))
        return ""
    except HubError as e:
        return str(e)
    except httpx.HTTPError as e:
        return f"Хаб недоступен: {type(e).__name__}"


def buyer_name(user: User | None, telegram_id: int) -> str:
    if user is not None:
        if user.username:
            return f"@{user.username}"
        name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
        if name:
            return name
        if user.email:
            return user.email
    return f"Покупатель {abs(telegram_id)}" if telegram_id > 0 else f"Гость {abs(telegram_id)}"


def _abs_url(url: str) -> str:
    return url if url.startswith("http") else f"{settings.FRONTEND_URL.rstrip('/')}{url}"


def _text_for_hub(msg: ChatMessage) -> str:
    text = msg.text or ""
    if msg.sender_type == "system":
        m = LOT_RE.match(text)
        if m:
            return f"Индивидуальный лот «{m.group(2).strip()}» — {m.group(1)} ₽ (ждёт оплаты)"
    return text


def _to_hub(msg: ChatMessage, chat: Chat, name: str) -> list[dict]:
    """Сообщение reDonate → записи /agent/messages (картинки — отдельными записями,
    как приходят из FunPay: у записи хаба одна картинка)."""
    base = {
        "funpay_chat_id": f"{CHAT_PREFIX}{chat.id}",
        "buyer_username": name,
        "buyer_id": chat.user_id,
        "author": AUTHOR.get(msg.sender_type, "system"),
        "author_username": name if msg.sender_type == "user" else "reDonate",
        "sent_at": msg.created_at.astimezone(timezone.utc).replace(tzinfo=None).isoformat()
        if msg.created_at else None,
    }
    out = []
    text = _text_for_hub(msg)
    if text:
        out.append({**base, "funpay_msg_id": str(msg.id), "text": text, "image_url": ""})
    for i, url in enumerate(msg.attachments or []):
        out.append({**base, "funpay_msg_id": f"{msg.id}:{i}", "text": "", "image_url": _abs_url(url)})
    return out


async def push_message(db: AsyncSession, msg_id: str, with_history: bool) -> bool:
    """Отправляет сообщение (и, если with_history, предыдущие сообщения чата) в хаб.
    False — сообщения ещё нет в БД (транзакция отправителя не закоммичена)."""
    cfg = await hub_config.get_active(db)
    if cfg is None:
        return True
    msg = await db.get(ChatMessage, uuid.UUID(msg_id))
    if msg is None:
        return False
    chat = await db.get(Chat, msg.chat_id)
    if chat is None:
        return True
    user = (await db.execute(select(User).where(User.telegram_id == chat.user_id))).scalar_one_or_none()
    name = buyer_name(user, chat.user_id)

    msgs = [msg]
    if with_history:
        prev = (await db.execute(
            select(ChatMessage)
            .where(ChatMessage.chat_id == chat.id, ChatMessage.created_at <= msg.created_at)
            .order_by(ChatMessage.created_at.desc())
            .limit(HISTORY_LIMIT)
        )).scalars().all()
        msgs = list(reversed(prev)) or [msg]
    payload = [rec for m in msgs for rec in _to_hub(m, chat, name)]
    if not payload:
        return True
    async with _client(cfg) as c:
        _check(await c.post("/agent/messages", json={"messages": payload}))
    return True


async def _deliver_outgoing(db: AsyncSession, cfg: hub_config.HubConfig, item: dict) -> str:
    """Ответ ночника → сообщение админа в чате покупателя. Возвращает id сообщения."""
    chat_key = str(item.get("funpay_chat_id") or "")
    if not chat_key.startswith(CHAT_PREFIX):
        raise HubError(f"Чужой диалог: {chat_key}")
    try:
        chat_id = uuid.UUID(chat_key[len(CHAT_PREFIX):])
    except ValueError as e:
        raise HubError(f"Неверный id диалога: {chat_key}") from e
    svc = ChatService(db)
    if await svc.get_chat_by_id(chat_id) is None:
        raise HubError("Чат не найден в reDonate")
    text = (item.get("text") or "").strip() or None
    image = (item.get("image_path") or "").strip()
    attachments = [image if image.startswith("http") else f"{cfg.url}{image}"] if image else []
    if not text and not attachments:
        raise HubError("Пустое сообщение")
    msg = await svc.send_message(chat_id, "admin", text, attachments, source="hub")
    await db.commit()
    return str(msg.id)


async def poll_once(db: AsyncSession, redis, heartbeat: bool) -> int:
    """Один цикл: забрать ответы из хаба и подтвердить их. Возвращает число доставленных."""
    cfg = await hub_config.get_active(db)
    if cfg is None:
        return 0
    delivered = 0
    try:
        async with _client(cfg) as c:
            if heartbeat:
                _check(await c.post("/agent/heartbeat", json=_heartbeat()))
            data = _check(await c.get("/agent/outgoing"))
            for item in data.get("messages") or []:
                oid = item.get("id")
                done_key = f"hub:out:{cfg.token[-6:]}:{oid}"
                # Ack мог не дойти в прошлый раз — хаб отдаст то же сообщение снова:
                # не дублируем в чате, просто подтверждаем ещё раз.
                msg_id = await redis.get(done_key)
                ack: dict
                if msg_id:
                    ack = {"success": True, "funpay_msg_id": msg_id.decode() if isinstance(msg_id, bytes) else msg_id}
                else:
                    try:
                        new_id = await _deliver_outgoing(db, cfg, item)
                        await redis.set(done_key, new_id, ex=7 * 86400)
                        ack = {"success": True, "funpay_msg_id": new_id}
                        delivered += 1
                    except HubError as e:
                        await db.rollback()
                        ack = {"success": False, "error_message": str(e)[:300]}
                        logger.warning("hub: ответ %s не доставлен: %s", oid, e)
                _check(await c.post(f"/agent/outgoing/{oid}/ack", json=ack))
        await hub_config.mark_result(db)
    except (httpx.HTTPError, HubError) as e:
        err = str(e) if isinstance(e, HubError) else f"Хаб недоступен: {type(e).__name__}"
        await hub_config.mark_result(db, err)
        logger.info("hub poll: %s", err)
    await db.commit()
    return delivered
