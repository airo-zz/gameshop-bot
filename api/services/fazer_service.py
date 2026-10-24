"""
api/services/fazer_service.py
─────────────────────────────────────────────────────────────────────────────
Админские операции FazerCards: обзор аккаунта, каталог (игры → номиналы и поля),
импорт номиналов в товары reDonate, привязка/отвязка товара, перевыдача позиции.

Выставление «как в UchetFP»: владелец выбирает игру Fazer → отмечает номиналы →
задаёт наценку → получает готовые товары в своей категории. Поля покупателя
(ID игрока, сервер…) категория получает от Fazer с теми же key — движок
выдачи берёт значения напрямую, без сопоставления.

HTTP к Fazer — синхронный клиент в asyncio.to_thread (каталог кэшируется).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import time
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services import fazer_config
from api.services.fazer.client import FazerAPI, human_error
from api.services.pricing import usd_to_rub
from api.services.rapira_service import get_markup_percent, get_usd_rub_rate
from shared.models.catalog import Category, DeliveryType, Product

KINDS = ("topup", "giftcard", "steam_topup")
STEAM_LOGIN_FIELD = {"key": "steam_login", "label": "Логин Steam", "type": "text",
                     "required": True, "placeholder": "Логин для входа в Steam (не ник)"}

_CACHE: dict[tuple, tuple[float, object]] = {}


def is_fazer_product(product) -> bool:
    """Товар выдаётся через FazerCards: есть привязка И включена безключевая
    автовыдача (если владелец переключил товар на «Вручную» — не покупаем)."""
    if product is None:
        return False
    meta = product.meta or {}
    dtype = getattr(product.delivery_type, "value", product.delivery_type)
    return bool(meta.get("fazer")) and meta.get("auto_source") == "external" and dtype == "auto"


class FazerServiceError(Exception):
    """Ошибка для показа в админке (текст уже понятный)."""


async def _api_key(db: AsyncSession) -> str:
    key = await fazer_config.get_api_key(db)
    if not key:
        raise FazerServiceError("Сначала укажите API-ключ FazerCards в «Интеграциях»")
    return key


async def _call(key: str, fn, *args):
    def run():
        with FazerAPI(key) as api:
            return fn(api, *args)
    try:
        return await asyncio.to_thread(run)
    except FazerServiceError:
        raise
    except Exception as e:  # noqa: BLE001 — показываем владельцу понятной фразой
        raise FazerServiceError(human_error(e)) from e


async def _cached(key: str, name: tuple, ttl: float, fn, *args):
    k = (key[-8:], *name)
    hit = _CACHE.get(k)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    data = await _call(key, fn, *args)
    _CACHE[k] = (time.time(), data)
    return data


def clear_cache() -> None:
    _CACHE.clear()


# ── Обзор аккаунта ──────────────────────────────────────────────────────────


async def overview(db: AsyncSession) -> dict:
    view = await fazer_config.get_admin_view(db)
    out = {**view, "error": "", "profile": None}
    key = await fazer_config.get_api_key(db)
    if not key:
        return out
    try:
        me = await _call(key, lambda api: api.me())
        out["profile"] = {k: me.get(k) for k in ("login", "plan", "planExpiresAt", "subscriptionActive")}
        balance = await _call(key, lambda api: api.balance())
        await fazer_config.store_balance(db, balance)
        out["balance"] = balance
    except FazerServiceError as e:
        out["error"] = str(e)
    return out


# ── Каталог ─────────────────────────────────────────────────────────────────


async def _games_all(db: AsyncSession, kind: str) -> list[dict]:
    key = await _api_key(db)
    if kind == "giftcard":
        items = await _cached(key, ("gc_games",), 3600, lambda api: api.giftcard_games())
        return [{"category_id": str(i["category_id"]), "name": i.get("name") or "", "validate": False}
                for i in items if i.get("category_id") is not None]

    def load(api: FazerAPI):
        games = api.topup_games()
        try:
            vids = {str(v.get("category_id")) for v in api.validate_list()}
        except Exception:  # noqa: BLE001 — список проверяемых игр не обязателен
            vids = set()
        return [{"category_id": str(g["category_id"]), "name": g.get("name") or "",
                 "validate": str(g["category_id"]) in vids}
                for g in games if g.get("category_id") is not None]

    return await _cached(key, ("topup_games",), 3600, load)


async def search_games(db: AsyncSession, kind: str, q: str, limit: int = 60) -> dict:
    games = await _games_all(db, kind)
    words = [w for w in q.lower().replace("ё", "е").split() if w]
    hits = [g for g in games
            if all(w in f"{g['name']} {g['category_id']}".lower().replace("ё", "е") for w in words)]
    return {"total": len(games), "found": len(hits), "items": hits[:limit]}


async def game_details(db: AsyncSession, kind: str, category_id: str, fresh: bool = False) -> dict:
    """Номиналы (id, название, себестоимость $) и поля покупателя игры Fazer."""
    key = await _api_key(db)
    if fresh:
        _CACHE.pop((key[-8:], kind, category_id), None)
    if kind == "giftcard":
        data = await _cached(key, (kind, category_id), 600, lambda api: api.giftcard_cards(category_id))
        offers = [{"id": str(o.get("card_id")), "name": o.get("name") or "", "price_usd": float(o.get("price_usd") or 0),
                   "stock": o.get("stock")} for o in data.get("offers") or [] if o.get("card_id")]
        return {"category_id": category_id, "name": data.get("name") or category_id, "note": data.get("note") or "",
                "offers": offers, "fields": [], "validate": False}
    data = await _cached(key, (kind, category_id), 600, lambda api: api.topup_offers(category_id))
    games = await _games_all(db, "topup")
    g = next((x for x in games if x["category_id"] == category_id), {})
    offers = [{"id": str(o.get("offer_id")), "name": o.get("name") or "", "price_usd": float(o.get("price_usd") or 0),
               "stock": None} for o in data.get("offers") or [] if o.get("offer_id")]
    return {"category_id": category_id, "name": data.get("name") or g.get("name") or category_id,
            "note": data.get("note") or "", "offers": offers, "fields": data.get("fields") or [],
            "validate": bool(g.get("validate"))}


async def steam_rates(db: AsyncSession) -> dict:
    key = await _api_key(db)
    data = await _cached(key, ("steam_rates",), 600, lambda api: api.steam_rates())
    return {"base": data.get("base") or "USD", "rates": data.get("rates") or {}, "updated_at": data.get("updated_at")}


def fields_from_fazer(fields: list[dict]) -> list[dict]:
    """Поля Fazer → поля покупателя reDonate (key совпадает — движок берёт напрямую)."""
    out = []
    for f in fields or []:
        key = str(f.get("key") or "").strip()
        if not key:
            continue
        item = {"key": key, "label": f.get("label") or key, "required": f.get("required", True) is not False}
        opts = [o for o in f.get("options") or [] if isinstance(o, dict)]
        if f.get("type") == "select" and opts:
            item["type"] = "select"
            item["options"] = [str(o.get("label") or o.get("name") or o.get("value") or "") for o in opts]
            item["options"] = [o for o in item["options"] if o]
        else:
            item["type"] = "text"
            if f.get("placeholder"):
                item["placeholder"] = str(f["placeholder"])
        out.append(item)
    return out


# ── Импорт номиналов в товары ───────────────────────────────────────────────


async def _price_rub(db: AsyncSession, price_usd: float, round_nine: bool) -> Decimal:
    rate = await get_usd_rub_rate(db)
    markup = await get_markup_percent(db)
    return Decimal(str(usd_to_rub(price_usd, float(rate), float(markup), round_nine)))


def _sell_price(cost_usd: float, margin_percent: float) -> float:
    return round(max(0.01, cost_usd * (1 + margin_percent / 100)), 2)


async def import_offers(
    db: AsyncSession,
    *,
    category_id: uuid.UUID,
    kind: str,
    fazer_category_id: str,
    offer_ids: list[str],
    margin_percent: float,
    apply_fields: bool,
    validate: bool,
) -> dict:
    """Создаёт по товару на каждый выбранный номинал Fazer в категории reDonate."""
    if kind not in ("topup", "giftcard"):
        raise FazerServiceError("Неизвестный тип каталога")
    cat = await db.get(Category, category_id)
    if cat is None:
        raise FazerServiceError("Категория не найдена")
    details = await game_details(db, kind, fazer_category_id)
    by_id = {o["id"]: o for o in details["offers"]}
    chosen = [by_id[i] for i in offer_ids if i in by_id]
    if not chosen:
        raise FazerServiceError("Не выбрано ни одного номинала")

    existing = (await db.execute(select(Product.sort_order).where(Product.category_id == cat.id))).scalars().all()
    sort = (max(existing) + 1) if existing else 0
    created = []
    for o in chosen:
        price_usd = _sell_price(o["price_usd"], margin_percent)
        mapping = {
            "kind": kind,
            "category_id": fazer_category_id,
            "category_name": details["name"],
            ("card_ids" if kind == "giftcard" else "offer_ids"): [o["id"]],
            "offer_names": [o["name"]],
            "cost_usd": o["price_usd"],
            "validate": bool(validate and kind == "topup"),
        }
        p = Product(
            category_id=cat.id,
            name=o["name"],
            price=await _price_rub(db, price_usd, round_nine=True),
            price_usd=Decimal(str(price_usd)),
            delivery_type=DeliveryType.auto,
            input_fields=[],
            is_active=True,
            sort_order=sort,
            meta={"auto_source": "external", "fazer": mapping},
        )
        sort += 1
        db.add(p)
        created.append(p)

    fields_set = False
    if apply_fields and kind == "topup" and details["fields"]:
        cat.input_fields = fields_from_fazer(details["fields"])
        fields_set = True
    await db.flush()
    return {"created": len(created), "fields_set": fields_set, "product_ids": [str(p.id) for p in created]}


async def create_steam_product(
    db: AsyncSession, *, category_id: uuid.UUID, currency: str, margin_percent: float,
    name: str | None, min_amount: int,
) -> dict:
    """Товар «Пополнение Steam»: цена за 1 единицу валюты, покупатель вводит сумму."""
    currency = currency.upper()
    if currency not in ("USD", "RUB", "UAH", "KZT"):
        raise FazerServiceError("Валюта Steam: USD, RUB, UAH или KZT")
    cat = await db.get(Category, category_id)
    if cat is None:
        raise FazerServiceError("Категория не найдена")
    rates = (await steam_rates(db))["rates"]
    rate = float(rates.get(currency) or 0)
    if rate <= 0:
        raise FazerServiceError(f"FazerCards не вернул курс {currency}")
    unit_cost = 1 / rate   # $ за 1 единицу валюты (оценка — точная цена приходит в заказе)
    price_usd = round(max(0.0001, unit_cost * (1 + margin_percent / 100)), 4)
    qty_field = {"key": "amount", "label": f"Сумма, {currency}", "type": "quantity",
                 "required": True, "min": max(1, int(min_amount)), "unit": currency}
    p = Product(
        category_id=cat.id,
        name=name or f"Пополнение Steam ({currency})",
        price=await _price_rub(db, price_usd, round_nine=False),
        price_usd=Decimal(str(price_usd)),
        delivery_type=DeliveryType.auto,
        input_fields=[qty_field],
        is_active=True,
        meta={"auto_source": "external", "fazer": {
            "kind": "steam_topup", "currency": currency, "category_name": f"Steam {currency}",
            "cost_usd": round(unit_cost, 6),
        }},
    )
    db.add(p)
    fields = list(cat.input_fields or [])
    if not any(str(f.get("key")) == STEAM_LOGIN_FIELD["key"] for f in fields if isinstance(f, dict)):
        cat.input_fields = [*fields, STEAM_LOGIN_FIELD]
    await db.flush()
    return {"created": 1, "fields_set": True, "product_ids": [str(p.id)]}


# ── Привязка существующего товара ──────────────────────────────────────────


def _str_list(v) -> list[str]:
    if isinstance(v, (str, int)):
        v = [v]
    if not isinstance(v, list):
        return []
    return [str(x).strip()[:120] for x in v if str(x).strip()][:30]


def _clean_mapping(m: dict) -> dict:
    """Белый список полей и типов привязки (данные из админки → движок покупает по ним)."""
    out: dict = {"kind": m["kind"]}
    if m.get("category_id"):
        out["category_id"] = str(m["category_id"]).strip()[:120]
    if m.get("category_name"):
        out["category_name"] = str(m["category_name"])[:200]
    for key in ("offer_ids", "card_ids", "offer_names"):
        if m.get(key) is not None:
            out[key] = _str_list(m[key])
    out["validate"] = bool(m.get("validate"))
    if m.get("currency"):
        out["currency"] = str(m["currency"]).upper()[:3]
    for key in ("cost_usd", "steam_amount"):
        try:
            if m.get(key) is not None:
                out[key] = float(m[key])
        except (TypeError, ValueError):
            pass
    return out



async def link_product(db: AsyncSession, product_id: uuid.UUID, mapping: dict | None) -> Product:
    """mapping=None — отвязать (товар становится обычным, выдача вручную)."""
    product = await db.get(Product, product_id)
    if product is None:
        raise FazerServiceError("Товар не найден")
    meta = dict(product.meta or {})
    if mapping is None:
        meta.pop("fazer", None)
        if meta.get("auto_source") == "external":
            meta.pop("auto_source")
            product.delivery_type = DeliveryType.manual
    else:
        kind = mapping.get("kind")
        if kind not in KINDS:
            raise FazerServiceError("Неизвестный тип привязки")
        if kind == "topup" and not _str_list(mapping.get("offer_ids")):
            raise FazerServiceError("Выберите номинал")
        if kind == "giftcard" and not _str_list(mapping.get("card_ids")):
            raise FazerServiceError("Выберите номинал гифт-карты")
        if kind != "steam_topup" and not mapping.get("category_id"):
            raise FazerServiceError("Выберите игру FazerCards")
        meta["fazer"] = _clean_mapping(mapping)
        meta["auto_source"] = "external"
        product.delivery_type = DeliveryType.auto
    product.meta = meta
    await db.flush()
    return product


# ── Перевыдача позиции заказа ──────────────────────────────────────────────


async def redeliver_item(db: AsyncSession, item_id: uuid.UUID, overrides: dict[str, str] | None) -> None:
    """Сбрасывает результат выдачи и ставит позицию в очередь заново (новый attempt →
    новые Idempotency-Key). overrides — исправленные поля покупателя (ID, логин…)."""
    from shared.models import Order, OrderItem, OrderStatus

    item = await db.get(OrderItem, item_id)
    if item is None:
        raise FazerServiceError("Позиция заказа не найдена")
    product = await db.get(Product, item.product_id) if item.product_id else None
    if product is None or not (product.meta or {}).get("fazer"):
        raise FazerServiceError("Товар позиции не привязан к FazerCards")
    if item.delivered_at is not None:
        raise FazerServiceError("Позиция уже выдана")
    order = await db.get(Order, item.order_id)
    if order is None or order.status not in (OrderStatus.paid, OrderStatus.processing):
        raise FazerServiceError("Перевыдача доступна для оплаченных заказов в работе")

    if overrides:
        clean = {str(k)[:64]: str(v).strip()[:200] for k, v in overrides.items() if str(v).strip()}
        item.input_data = {**(item.input_data or {}), **clean}
    prev = (item.delivery_data or {}).get("fazer") or {}
    item.delivery_data = {**(item.delivery_data or {}),
                          "fazer": {**prev, "attempt": int(prev.get("attempt") or 0) + 1, "state": "queued"}}
    await db.flush()
    from worker.main import celery_app
    celery_app.send_task("worker.tasks.fazer_tasks.deliver_fazer_order",
                         args=[str(order.id)], kwargs={"only_item": str(item.id)}, countdown=3)
