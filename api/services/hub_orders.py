"""
api/services/hub_orders.py
─────────────────────────────────────────────────────────────────────────────
Заказы reDonate в хабе UchetFP (вкладка «reDonate» в «Заказах» хаба).

  push_order(order_id)      заказ → POST /agent/redonate_order (апсерт по номеру).
                            Зовётся после каждой смены статуса (OrderService.change_status →
                            worker push_order_to_hub). При оплате в чат хаба уходит ещё и
                            карточка с данными покупателя — ночнику не надо искать их отдельно.
  apply_task(task)          задача из хаба: «Выполнен» → заказ completed (покупатель
                            получает обычное уведомление о выполнении).

Деньги — в USD по курсу магазина: выручка без наценки способа оплаты
(subtotal − скидка), себестоимость — что известно от поставщика (FazerCards).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import uuid
from datetime import timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.services import hub_config
from api.services.hub_bridge import CHAT_PREFIX, HubError, _check, _client, buyer_name
from shared.models import Order, OrderItem, OrderStatus

logger = logging.getLogger(__name__)

STATE_RU = {
    OrderStatus.paid: "Оплачен",
    OrderStatus.processing: "В работе",
    OrderStatus.clarification: "Нужно уточнение",
    OrderStatus.completed: "Выполнен",
    OrderStatus.refunded: "Возврат",
    OrderStatus.cancelled: "Отменён",
}
HUB_STATUS = {
    OrderStatus.paid: "PAID",
    OrderStatus.processing: "PAID",
    OrderStatus.clarification: "PAID",
    OrderStatus.completed: "CLOSED",
    OrderStatus.refunded: "REFUNDED",
    OrderStatus.cancelled: "REFUNDED",
}
METHOD_RU = {"balance": "баланс", "sbp": "СБП", "card": "карта", "crypto": "крипта", "manual": "вручную"}


def _num(order_number: str) -> str:
    return (order_number or "").lstrip("#")


def _rub(v: Decimal | float) -> str:
    return f"{float(v):,.0f}".replace(",", " ") + " ₽"


def _field_labels(item: OrderItem) -> dict[str, str]:
    fields = (getattr(item.product, "input_fields", None) or []) if item.product else []
    return {f.get("key"): f.get("label") or f.get("key") for f in fields if isinstance(f, dict)}


def _buyer_fields(order: Order) -> list[str]:
    """Данные покупателя: общие для игры (order.input_data) и по позициям (item.input_data)."""
    lines: list[str] = []
    for src in (order.input_data or {}).values():
        if not isinstance(src, dict):
            continue
        for f in src.get("fields") or []:
            if isinstance(f, dict) and f.get("value") not in (None, ""):
                lines.append(f"{f.get('label') or f.get('key')}: {f['value']}")
    for item in order.items:
        labels = _field_labels(item)
        for k, v in (item.input_data or {}).items():
            if v in (None, "") or isinstance(v, (dict, list)):
                continue
            line = f"{labels.get(k, k)}: {v}"
            if line not in lines:
                lines.append(line)
    return lines


def _items_lines(order: Order) -> list[str]:
    out = []
    for i in order.items:
        name = f"{i.game_name} — {i.product_name}" if i.game_name else i.product_name
        qty = f" × {i.quantity}" if (i.quantity or 1) > 1 else ""
        done = " (выдано)" if i.delivered_at else ""
        out.append(f"• {name}{qty}{done}")
    return out


def _cost_usd(order: Order) -> float | None:
    total = 0.0
    for i in order.items:
        fz = (i.delivery_data or {}).get("fazer") or {}
        if fz.get("cost_usd"):
            total += float(fz["cost_usd"])
    return round(total, 4) or None


async def _load(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    return (await db.execute(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product), selectinload(Order.user))
        .where(Order.id == order_id)
    )).scalar_one_or_none()


def build_payload(order: Order, rate: Decimal) -> dict:
    base = (order.subtotal or Decimal("0")) - (order.discount_amount or Decimal("0"))
    price_usd = float(base / rate) if rate else 0.0
    method = order.payment_method.value if order.payment_method else ""
    details = _items_lines(order)
    fields = _buyer_fields(order)
    if fields:
        details += ["", "Данные покупателя:", *fields]
    details += ["", f"Оплачено: {_rub(order.total_amount)}" + (f" ({METHOD_RU.get(method, method)})" if method else "")]
    first = order.items[0] if order.items else None
    user = order.user
    tg = user.telegram_id if user else 0
    paid_at = order.paid_at or order.created_at
    return {
        "order_number": _num(order.order_number),
        "status": HUB_STATUS.get(order.status, "PAID"),
        "state": STATE_RU.get(order.status, order.status.value),
        "price_usd": round(price_usd, 4),
        "cost_usd": _cost_usd(order),
        "qty": sum(int(i.quantity or 1) for i in order.items) or 1,
        "game": (first.game_name or "") if first else "",
        "product": "; ".join(i.product_name for i in order.items)[:500],
        "details": "\n".join(details),
        "buyer_name": buyer_name(user, tg),
        "buyer_id": tg,
        "date": paid_at.astimezone(timezone.utc).replace(tzinfo=None).isoformat() if paid_at else None,
    }


async def push_order(db: AsyncSession, order_id: str, expect_status: str | None) -> bool:
    """False — в БД ещё старый статус (транзакция смены не закоммичена), повторить позже."""
    cfg = await hub_config.get_active(db)
    if cfg is None:
        return True
    order = await _load(db, uuid.UUID(order_id))
    if order is None or order.deleted_at is not None:
        return True
    if expect_status and order.status.value != expect_status:
        return False
    if order.status not in HUB_STATUS or order.paid_at is None:
        return True   # неоплаченные (отмена до оплаты и т.п.) в учёт хаба не идут

    from api.services.rapira_service import get_usd_rub_rate

    payload = build_payload(order, await get_usd_rub_rate(db))
    async with _client(cfg) as c:
        _check(await c.post("/agent/redonate_order", json=payload))
        # Карточка с данными покупателя — в чат хаба, один раз (id сообщения постоянный)
        open_states = (OrderStatus.paid, OrderStatus.processing, OrderStatus.clarification)
        if order.status in open_states and order.user is not None:
            from api.services.chat_service import ChatService

            chat = await ChatService(db).get_or_create_chat(order.user.telegram_id)
            fields = _buyer_fields(order)
            text = "\n".join([
                f"Заказ #{payload['order_number']} — {_rub(order.total_amount)}",
                *_items_lines(order),
                *(["", "Данные покупателя:", *fields] if fields else []),
            ])
            _check(await c.post("/agent/messages", json={"messages": [{
                "funpay_chat_id": f"{CHAT_PREFIX}{chat.id}",
                "funpay_msg_id": f"order:{order.id}:card",
                "buyer_username": payload["buyer_name"],
                "buyer_id": payload["buyer_id"],
                "author": "system",
                "author_username": "reDonate",
                "text": text,
                "image_url": "",
                "sent_at": payload["date"],
            }]}))
    return True


async def apply_task(db: AsyncSession, task: dict) -> dict:
    """Задача хаба → действие с заказом. Возвращает result для ack; HubError — отказ."""
    kind = task.get("kind")
    params = task.get("params") or {}
    if kind != "redonate_set_status":
        raise HubError(f"Неизвестная задача: {kind}")
    if params.get("status") != "completed":
        raise HubError(f"Неподдерживаемый статус: {params.get('status')}")
    num = _num(str(params.get("order_number") or ""))
    order = (await db.execute(
        select(Order).where(Order.order_number.in_([num, f"#{num}"]), Order.deleted_at.is_(None))
    )).scalar_one_or_none()
    if order is None:
        raise HubError(f"Заказ #{num} не найден")
    if order.status == OrderStatus.completed:
        return {"status": "completed", "already": True}

    from api.services.order_service import OrderService

    svc = OrderService(db)
    reason = f"Хаб UchetFP: {str(params.get('by') or '')[:40]}".strip()
    try:
        if order.status == OrderStatus.clarification:
            await svc.change_status(order, OrderStatus.processing, changed_by_type="hub", reason=reason)
        await svc.change_status(order, OrderStatus.completed, changed_by_type="hub", reason=reason)
    except ValueError as e:
        raise HubError(str(e)) from e
    await db.commit()
    logger.info("hub: заказ %s выполнен из хаба (%s)", order.order_number, reason)
    return {"status": "completed"}
