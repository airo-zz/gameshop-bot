"""
api/services/fazer/engine.py
─────────────────────────────────────────────────────────────────────────────
Выдача одной позиции заказа через FazerCards. Логика — как в UchetFP
(fazer_engine.py), но без сопоставления вариантов лота GGSel: в reDonate товар
сам знает свои номиналы Fazer (Product.meta["fazer"]).

Привязка товара (Product.meta["fazer"]):
  kind         "topup" | "giftcard" | "steam_topup"
  category_id  id категории Fazer (topup/giftcard)
  offer_ids    [offer_id, …] — topup; несколько = комбо (одна штука = все номиналы)
  card_ids     [card_id, …]  — giftcard; несколько = комбо кодов
  validate     bool — проверить ID игрока до покупки (topup, если игра умеет)
  currency     USD|RUB|UAH|KZT — steam_topup; сумма = количество в позиции
               (товар с полем «Количество») или фиксированная steam_amount
  + служебные для админки: category_name, offer_names, cost_usd

Поля покупателя: ключи полей категории/игры совпадают с key полей Fazer (их
создаёт импорт). Значения берём из позиции (item.input_data) и заказа
(order.input_data), матч по key, затем по подписи.

Идемпотентность: Idempotency-Key = rd-<item_id>-<attempt>-<leg>. Повтор задачи
с тем же attempt вернёт уже созданные заказы Fazer — без второго списания.
Ручная перевыдача увеличивает attempt.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections import Counter
from dataclasses import dataclass, field

import httpx

from .client import FazerAPI, FazerError, human_error, order_id_of, order_price_of, order_state, order_status_text

logger = logging.getLogger(__name__)

MAX_LEGS = 30          # защита от опечатки в количестве: одна штука = один платный заказ
ORDER_WAIT_SEC = 150   # ждём итоговый статус каждого заказа (дальше — «принят, в процессе»)
STEAM_LOGIN_RE = re.compile(r"^[0-9A-Za-z_.@]{3,64}$")
STEAM_CURRENCIES = ("USD", "RUB", "UAH", "KZT")
_LOGIN_HINTS = ("steamlogin", "steam_login", "login", "логин", "аккаунт")

MSG_FAIL = "⚠️ Небольшая задержка с выдачей — продавец завершит заказ вручную."


@dataclass
class DeliveryResult:
    ok: bool
    buyer_message: str
    detail: str
    pending: bool = False                 # заказ(ы) Fazer приняты, но ещё в обработке
    cost_usd: float | None = None
    orders: list[dict] = field(default_factory=list)   # [{id, state, status}]
    codes: list[str] = field(default_factory=list)     # гифт-карты


def _ids(v) -> list[str]:
    """Список id из привязки (строка — один id, не разбивать по символам)."""
    if isinstance(v, (str, int)):
        v = [v]
    return [str(x) for x in (v or []) if x not in (None, "")]


def _norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower().replace("ё", "е")).strip()


def collect_values(order_input: dict | None, item_input: dict | None) -> dict[str, dict]:
    """Все поля покупателя → {norm_key: {"value", "label"}}. Позиция приоритетнее."""
    out: dict[str, dict] = {}
    for src in (order_input or {}).values():
        if not isinstance(src, dict):
            continue
        for f in src.get("fields") or []:
            if isinstance(f, dict) and f.get("key") and f.get("value") not in (None, ""):
                out[_norm(f["key"])] = {"value": str(f["value"]).strip(), "label": f.get("label") or ""}
    for k, v in (item_input or {}).items():
        if v not in (None, "") and not isinstance(v, (dict, list)):
            out[_norm(k)] = {"value": str(v).strip(), "label": ""}
    return out


def _find(values: dict[str, dict], key: str, label: str = "") -> str:
    hit = values.get(_norm(key))
    if hit:
        return hit["value"]
    if label:
        ln = _norm(label)
        for v in values.values():
            if v["label"] and _norm(v["label"]) == ln:
                return v["value"]
    return ""


def _select_value(val: str, options: list) -> str:
    """Значение покупателя → value select-поля Fazer (по value или по подписи)."""
    vn = _norm(val)
    for o in options or []:
        if not isinstance(o, dict):
            continue
        ov = str(o.get("value", o.get("id", "")))
        lab = str(o.get("label", o.get("name", ov)))
        if vn in (_norm(ov), _norm(lab)):
            return ov
    for o in options or []:
        if not isinstance(o, dict):
            continue
        lab = _norm(o.get("label", o.get("name", "")))
        if lab and (lab in vn or vn in lab):
            return str(o.get("value", o.get("id", "")))
    return val


class FazerEngine:
    def __init__(self, api_key: str):
        self.api = FazerAPI(api_key)

    def close(self) -> None:
        self.api.close()

    # ── общее ────────────────────────────────────────────────────────────────
    def _wait(self, order: dict) -> dict:
        oid = order_id_of(order)
        end = time.time() + ORDER_WAIT_SEC
        while oid and order_state(order) == "pending" and time.time() < end:
            time.sleep(5)
            try:
                order = self.api.get_order(oid) or order
            except (FazerError, httpx.HTTPError) as e:
                logger.warning("fazer get_order %s: %s", oid, e)
        return order

    @staticmethod
    def _why(err: Exception | None, why: str) -> str:
        if isinstance(err, FazerError):
            if err.is_balance:
                why += " · НЕ ХВАТАЕТ БАЛАНСА FazerCards"
            if err.code == "subscription_inactive":
                why += " · подписка FazerCards неактивна"
        return why

    def deliver(self, mapping: dict, values: dict[str, dict], quantity: int, idem_prefix: str) -> DeliveryResult:
        kind = mapping.get("kind") or "topup"
        try:
            if kind == "giftcard":
                return self._giftcard(mapping, quantity, idem_prefix)
            if kind == "steam_topup":
                return self._steam(mapping, values, quantity, idem_prefix)
            return self._topup(mapping, values, quantity, idem_prefix)
        except Exception as e:  # noqa: BLE001 — сбой движка не должен ронять задачу
            logger.exception("fazer: deliver упал")
            return DeliveryResult(False, MSG_FAIL, f"{type(e).__name__}: {e}")

    # ── пополнение по ID ─────────────────────────────────────────────────────
    def _topup(self, m: dict, values: dict, qty: int, idem: str) -> DeliveryResult:
        cat = str(m.get("category_id") or "")
        offers = _ids(m.get("offer_ids"))
        if not cat or not offers:
            return DeliveryResult(False, MSG_FAIL, "товар не привязан к номиналу FazerCards")
        legs = offers * max(1, qty)
        if len(legs) > MAX_LEGS:
            return DeliveryResult(False, MSG_FAIL, f"{len(legs)} заказов > {MAX_LEGS} — выдать вручную")

        info = self.api.topup_offers(cat)   # поля игры + цены номиналов (себестоимость)
        prices = {str(o.get("offer_id")): float(o.get("price_usd") or 0) or None
                  for o in info.get("offers") or [] if o.get("offer_id") is not None}
        fields, missing = {}, []
        for f in info.get("fields") or []:
            key = f.get("key")
            if not key:
                continue
            val = _find(values, key, f.get("label") or "")
            if val and f.get("type") == "select" and f.get("options"):
                val = _select_value(val, f["options"])
            if val:
                fields[key] = val
            elif f.get("required", True):
                missing.append(f.get("label") or key)
        if missing:
            return DeliveryResult(
                False,
                f"⚠️ В заказе не хватает данных: {', '.join(missing)}. Напишите их в этот чат — "
                "продавец пополнит вручную.",
                f"нет полей: {missing}",
            )

        who = next(iter(fields.values()), "")
        if m.get("validate"):
            try:
                v = self.api.validate_id(cat, fields)
                if v.get("valid") is False:
                    return DeliveryResult(
                        False,
                        f"⚠️ Игрок с ID {who} не найден. Проверьте ID и напишите правильный в этот чат — "
                        "пополнение не проводилось.",
                        f"validate-id: valid=false {json.dumps(v, ensure_ascii=False)[:200]}",
                    )
                if v.get("player_name"):
                    who = f"{who} ({v['player_name']})"
            except FazerError as e:
                if e.status == 422:
                    return DeliveryResult(
                        False,
                        f"⚠️ Не удалось подтвердить ID игрока {who}. Проверьте ID и напишите в чат — "
                        "пополнение не проводилось.",
                        f"validate-id 422: {e.error}",
                    )
                logger.warning("fazer validate-id недоступен (%s) — покупаю без проверки", e)
            except httpx.HTTPError as e:
                logger.warning("fazer validate-id: сеть (%s) — покупаю без проверки", e)

        done: list[dict] = []
        for i, offer_id in enumerate(legs):
            try:
                order = self.api.topup_order(cat, offer_id, fields, f"{idem}-{i}")
            except Exception as e:  # noqa: BLE001
                return self._stopped(done, len(legs), f"заказ {i + 1}/{len(legs)} отклонён: {e}", e)
            order = self._wait(order)
            st = order_state(order)
            leg = {"id": order_id_of(order), "state": st, "status": order_status_text(order),
                   "price": order_price_of(order) or prices.get(offer_id)}
            if st == "fail":
                return self._stopped(done, len(legs),
                                     f"заказ {leg['id'] or i + 1} вернули: {json.dumps(order, ensure_ascii=False)[:200]}",
                                     None)
            done.append(leg)

        pending = any(leg["state"] == "pending" for leg in done)
        costs = [leg["price"] for leg in done if leg["price"] is not None]
        msg = (f"✅ Пополнение отправлено на {who}! Спасибо за покупку." if not pending else
               f"✅ Пополнение на {who} оформлено и поступит в ближайшие минуты. Спасибо за покупку!")
        return DeliveryResult(
            True, msg,
            f"ok topup cat={cat} orders={','.join(l['id'] for l in done)} fields={fields}",
            pending=pending, cost_usd=round(sum(costs), 4) if costs else None,
            orders=[{k: leg[k] for k in ("id", "state", "status")} for leg in done],
        )

    def _stopped(self, done: list[dict], total: int, why: str, err: Exception | None) -> DeliveryResult:
        """Остановились на «ноге»: прошедшие не повторяем (деньги списаны), остаток — вручную."""
        why = self._why(err, why)
        buyer = MSG_FAIL
        if done:
            buyer = "⚠️ Выполнена только часть пополнения — продавец довыдаст остаток вручную."
            why = f"ЧАСТИЧНО {len(done)}/{total} (orders={','.join(l['id'] for l in done)}) · " + why
        costs = [leg["price"] for leg in done if leg.get("price") is not None]
        return DeliveryResult(
            False, buyer, why, cost_usd=round(sum(costs), 4) if costs else None,
            orders=[{k: leg[k] for k in ("id", "state", "status")} for leg in done],
        )

    # ── гифт-карты (коды) ────────────────────────────────────────────────────
    def _giftcard(self, m: dict, qty: int, idem: str) -> DeliveryResult:
        cat = str(m.get("category_id") or "")
        cards = _ids(m.get("card_ids"))
        if not cat or not cards:
            return DeliveryResult(False, MSG_FAIL, "товар не привязан к гифт-карте FazerCards")
        qty = max(1, qty)
        counts = Counter(cards)   # одинаковые card_id в комбо — одной покупкой с quantity×N
        if qty * max(counts.values()) > 100 or len(counts) > MAX_LEGS:
            return DeliveryResult(False, MSG_FAIL, f"qty={qty} legs={len(counts)} — выдать вручную")

        codes: list[str] = []
        orders: list[dict] = []
        costs: list[float] = []
        for i, (card_id, n) in enumerate(counts.items()):
            try:
                order = self.api.giftcard_order(cat, card_id, qty * n, f"{idem}-gc-{i}")
            except Exception as e:  # noqa: BLE001
                return self._stopped_codes(codes, orders, costs, len(counts),
                                           f"заказ {i + 1}/{len(counts)} отклонён: {e}", e)
            order = self._wait(order)
            got = [str(c) for c in (order.get("cards") or []) if c]
            if order_state(order) == "fail" or not got:
                return self._stopped_codes(
                    codes, orders, costs, len(counts),
                    f"заказ {order_id_of(order) or '?'} без кодов: {json.dumps(order, ensure_ascii=False)[:200]}",
                    None)
            codes += got
            orders.append({"id": order_id_of(order), "state": order_state(order), "status": order_status_text(order)})
            price = order_price_of(order)
            if price is not None:
                costs.append(price)

        return DeliveryResult(
            True, "✅ Ваш код:\n\n" + "\n".join(codes) + "\n\nСпасибо за покупку!",
            f"ok giftcard cat={cat} legs={len(counts)} qty={qty} codes={len(codes)}",
            cost_usd=round(sum(costs), 4) if costs else None, orders=orders, codes=codes,
        )

    def _stopped_codes(self, codes, orders, costs, total, why, err) -> DeliveryResult:
        """Уже полученные коды — реальные и оплаченные: отдаём их, остаток — вручную."""
        why = self._why(err, why)
        cost = round(sum(costs), 4) if costs else None
        if codes:
            return DeliveryResult(
                False,
                "✅ Часть заказа готова — ваш код:\n\n" + "\n".join(codes)
                + "\n\nОстаток продавец выдаст вручную.",
                f"ЧАСТИЧНО {len(orders)}/{total} · " + why, cost_usd=cost, orders=orders, codes=codes,
            )
        return DeliveryResult(False, MSG_FAIL, why, cost_usd=cost, orders=orders)

    # ── Steam по логину ──────────────────────────────────────────────────────
    def _steam(self, m: dict, values: dict, qty: int, idem: str) -> DeliveryResult:
        login = ""
        for hint in _LOGIN_HINTS:
            login = _find(values, hint)
            if login:
                break
        if not login:   # подпись поля «Логин Steam» и т.п.
            login = next((v["value"] for v in values.values() if "логин" in _norm(v["label"])
                          or "login" in _norm(v["label"])), "")
        currency = str(m.get("currency") or "USD").upper()
        if currency not in STEAM_CURRENCIES:
            currency = "USD"
        amount = float(m.get("steam_amount") or 0) * max(1, qty) if m.get("steam_amount") else float(max(0, qty))

        if not login or not STEAM_LOGIN_RE.match(login):
            return DeliveryResult(
                False,
                "⚠️ Не вижу корректный логин Steam в заказе. Напишите логин в этот чат — продавец пополнит вручную.",
                f"плохой логин: {login!r}",
            )
        if amount <= 0:
            return DeliveryResult(False, MSG_FAIL, f"сумма пополнения {amount}")

        try:   # проверка логина ДО списания — best-effort
            chk = self.api.steam_check_login(login)
            if chk.get("can_refill") is False:
                return DeliveryResult(
                    False,
                    f"⚠️ Логин {login} не может принять пополнение — проверьте логин и напишите в этот чат.",
                    f"check-login: can_refill=false {chk}",
                )
        except (FazerError, httpx.HTTPError) as e:
            logger.warning("fazer steam check-login недоступен (%s) — пополняю без проверки", e)

        try:
            order = self.api.steam_order(login, currency, amount, f"{idem}-steam")
        except Exception as e:  # noqa: BLE001
            return DeliveryResult(False, MSG_FAIL, self._why(e, f"steam order: {e}"))
        price = order_price_of(order)
        cost = price if price is not None else (amount if currency == "USD" else None)
        return DeliveryResult(
            True, f"✅ Аккаунт Steam {login} пополнен на {amount:g} {currency}! Спасибо за покупку.",
            f"ok steam login={login} amount={amount}{currency} order={order_id_of(order)}",
            pending=order_state(order) == "pending",
            cost_usd=round(cost, 4) if cost is not None else None,
            orders=[{"id": order_id_of(order), "state": order_state(order), "status": order_status_text(order)}],
        )


__all__ = ["FazerEngine", "DeliveryResult", "collect_values", "human_error"]
