"""
api/services/fazer/client.py
─────────────────────────────────────────────────────────────────────────────
HTTP-клиент FazerCards Public API v2 (OpenAPI: api.fzr.cards/public/docs/openapi.json).

  * ключ ``X-API-Key: fc_…``; ответы ``{ok, …}``, ошибка — ``{ok:false, error, code}``;
  * ``POST /topups/order`` / ``/giftcards/order`` / ``/steam-topup/order`` — баланс
    списывается СРАЗУ, дальше заказ processing → completed / refund;
  * ``Idempotency-Key`` — повтор с тем же ключом возвращает ИСХОДНЫЙ заказ. Поэтому
    сетевой сбой/5xx повторяем с тем же ключом — без задвоения списаний.

⚠️ Формат объекта заказа в спецификации не описан (additionalProperties) — статус,
id и цену читаем терпимо по нескольким именам полей (проверено в UchetFP на живых
заказах: у Steam-топапа цена приходит в ``chargedUsd``).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

FAZER_BASE_URL = "https://api.fzr.cards/api/v2"
HTTP_TIMEOUT = 25.0

_OK_WORDS = ("complete", "success", "succeed", "done", "deliver", "fulfil", "paid", "finished")
_FAIL_WORDS = ("refund", "cancel", "fail", "error", "reject", "declin", "expire", "invalid")


def order_state(order: dict) -> str:
    """'ok' | 'fail' | 'pending' по статусу заказа (имя поля в спеке не описано)."""
    st = ""
    for k in ("status", "state", "order_status"):
        if order.get(k) not in (None, ""):
            st = str(order.get(k)).lower()
            break
    if any(w in st for w in _FAIL_WORDS):
        return "fail"
    if any(w in st for w in _OK_WORDS):
        return "ok"
    return "pending"


def order_status_text(order: dict) -> str:
    return str(order.get("status") or order.get("state") or order.get("order_status") or "")[:40]


def order_id_of(order: dict) -> str:
    for k in ("id", "order_id", "public_id", "orderId", "publicId"):
        if order.get(k) not in (None, ""):
            return str(order[k])
    return ""


def order_price_of(order: dict) -> float | None:
    for k in ("total_usd", "price_usd", "price_usd_per_unit", "chargedUsd", "charged_usd",
              "price", "amount", "total", "cost", "sum", "charged"):
        v = order.get(k)
        if v not in (None, ""):
            try:
                return abs(float(v))
            except (TypeError, ValueError):
                continue
    return None


class FazerError(Exception):
    def __init__(self, status: int, error: str, code: str = "", reason: str = ""):
        super().__init__(f"HTTP {status}: {error}" + (f" ({code})" if code else ""))
        self.status, self.error, self.code, self.reason = status, error, code, reason

    @property
    def is_balance(self) -> bool:
        e = self.error.lower()
        return "balance" in e or "insufficient" in e or "баланс" in e


def human_error(e: Exception) -> str:
    """Ошибка Fazer — понятным языком для админки."""
    if not isinstance(e, FazerError):
        return f"FazerCards не отвечает ({type(e).__name__})"
    if e.status == 401:
        return "Неверный API-ключ FazerCards — проверьте ключ в кабинете fzr.cards"
    if e.code == "subscription_inactive":
        return "Подписка FazerCards неактивна — заказы не пройдут, продлите подписку в кабинете"
    if e.status == 403:
        return "Аккаунт FazerCards заблокирован" + (f": {e.reason}" if e.reason else "")
    if e.status == 429:
        return "FazerCards: слишком много запросов — подождите минуту"
    if e.status >= 500:
        return "FazerCards временно недоступен"
    if e.is_balance:
        return "Не хватает баланса FazerCards"
    return f"FazerCards: {e.error}"


class FazerAPI:
    def __init__(self, api_key: str, timeout: float = HTTP_TIMEOUT):
        self.client = httpx.Client(
            base_url=FAZER_BASE_URL,
            headers={"X-API-Key": api_key, "Accept": "application/json"},
            timeout=timeout,
        )

    def close(self) -> None:
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def _req(self, method: str, path: str, *, params=None, body=None, idem: str = "") -> dict:
        headers = {"Idempotency-Key": idem[:255]} if idem else None
        r = self.client.request(method, path, params=params, json=body, headers=headers)
        try:
            data = r.json()
        except ValueError:
            data = {}
        data = data if isinstance(data, dict) else {}
        if r.status_code >= 400 or data.get("ok") is False:
            raise FazerError(
                r.status_code,
                str(data.get("error") or r.reason_phrase or "ошибка"),
                str(data.get("code") or ""),
                str(data.get("blockReason") or ""),
            )
        return data

    def _with_retry(self, fn, what: str, attempts: int = 3) -> dict:
        """Сетевой сбой/5xx/429 → повтор с ТЕМ ЖЕ Idempotency-Key (fn его замыкает):
        Fazer вернёт уже созданный заказ, а не спишет второй раз. Прочие 4xx — наружу."""
        last = ""
        for i in range(1, attempts + 1):
            try:
                return fn()
            except FazerError as e:
                if e.status < 500 and e.status != 429:
                    raise
                last = str(e)
            except httpx.HTTPError as e:
                last = f"{type(e).__name__}: {e}"
            if i < attempts:
                logger.warning("fazer %s: попытка %d/%d не удалась (%s) — повтор", what, i, attempts, last)
                time.sleep(4 * i)
        raise RuntimeError(f"{what}: не создан после {attempts} попыток: {last}")

    # ── аккаунт ──────────────────────────────────────────────────────────────
    def me(self) -> dict:
        return self._req("GET", "/me")

    def balance(self) -> float:
        return float(self._req("GET", "/balance").get("balance") or 0)

    def get_order(self, order_id: str) -> dict:
        return self._req("GET", f"/orders/{order_id}").get("order") or {}

    # ── каталог ──────────────────────────────────────────────────────────────
    def _paged(self, path: str) -> list[dict]:
        items, cursor = [], None
        for _ in range(20):
            params = {"limit": "500"}
            if cursor:
                params["cursor"] = cursor
            page = self._req("GET", path, params=params)
            items += page.get("items") or []
            meta = page.get("meta") or {}
            cursor = meta.get("next_cursor")
            if not meta.get("has_more") or not cursor:
                break
        return items

    def topup_games(self) -> list[dict]:
        return self._paged("/topups")

    def giftcard_games(self) -> list[dict]:
        return self._paged("/giftcards")

    def validate_list(self) -> list[dict]:
        return self._req("GET", "/topups/validate-id").get("items") or []

    def topup_offers(self, category_id: str) -> dict:
        return self._req("GET", "/topups/offers", params={"category_id": category_id})

    def giftcard_cards(self, category_id: str) -> dict:
        return self._req("GET", "/giftcards/cards", params={"category_id": category_id})

    def steam_rates(self) -> dict:
        return self._req("GET", "/steam-topup/rates")

    # ── проверки до покупки ──────────────────────────────────────────────────
    def validate_id(self, category_id: str, fields: dict) -> dict:
        return self._req("POST", "/topups/validate-id", body={"category_id": category_id, "fields": fields})

    def steam_check_login(self, login: str) -> dict:
        return self._req("POST", "/steam-topup/check-login", body={"steamLogin": login})

    # ── покупка (деньги списываются сразу) ──────────────────────────────────
    def topup_order(self, category_id: str, offer_id: str, fields: dict, idem: str) -> dict:
        return self._with_retry(
            lambda: self._req("POST", "/topups/order", idem=idem, body={
                "category_id": category_id, "offer_id": offer_id, "fields": fields,
            }).get("order") or {},
            f"topup {idem}",
        )

    def giftcard_order(self, category_id: str, card_id: str, quantity: int, idem: str) -> dict:
        return self._with_retry(
            lambda: self._req("POST", "/giftcards/order", idem=idem, body={
                "category_id": category_id, "card_id": card_id, "quantity": quantity,
            }).get("order") or {},
            f"giftcard {idem}",
        )

    def steam_order(self, login: str, currency: str, amount, idem: str) -> dict:
        return self._with_retry(
            lambda: self._req("POST", "/steam-topup/order", idem=idem, body={
                "steamLogin": login, "currency": currency, "amount": str(amount),
            }).get("order") or {},
            f"steam-topup {idem}",
        )
