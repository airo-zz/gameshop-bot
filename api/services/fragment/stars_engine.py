"""
Движок автовыдачи Telegram Stars через Fragment + собственный TON-кошелёк.

Тяжёлый платёжный слой (FragmentAPI + встроенный TonClient на pytoniq) берётся
как есть из порта Auto Stars Ultra — он платформо-независим. Здесь тонкая обёртка:
из заказа GGSel достать username и количество звёзд, выполнить init→link→ton.transfer,
вернуть результат оркестратору.

Зависимости (pydantic, pytoniq, lxml, bs4) импортируются лениво — если их нет,
конструктор бросает исключение, и оркестратор помечает движок недоступным
(остальная автовыдача продолжает работать).

Интерфейс:
    StarsEngine(cfg).preview(ctx) -> str
    StarsEngine(cfg).deliver(ctx) -> (ok, buyer_message, detail)
"""
from __future__ import annotations
import re
import base64

USERNAME_RE = re.compile(r"(?:@|t\.me/|telegram\.me/)?([A-Za-z0-9_]{4,32})\s*$", re.I)

# Fragment payment_method: "ton" (нативный TON) или "usdt_ton" (USDT-jetton на TON).
# ВНИМАНИЕ: значение именно "usdt_ton" — "usdt"/"usdc" Fragment отвергает ("Access denied")
# (снято с живого UI 2026-08-04). USDT на TON = 6 знаков после запятой.
PAYMENT_METHODS = ("ton", "usdt_ton")
JETTON_TRANSFER_OP = 0x0f8a7ea5      # TEP-74 jetton transfer
USDT_DECIMALS = 6


def _clean_username(raw: str) -> str | None:
    if not raw:
        return None
    m = USERNAME_RE.search(raw.strip())
    return m.group(1) if m else None


class StarsEngine:
    def __init__(self, cfg: dict):
        if not cfg.get("enabled"):
            raise RuntimeError("stars.enabled=false")
        cookie = cfg.get("fragment_cookie")
        seed = cfg.get("ton_seed")
        if not cookie or not seed:
            raise RuntimeError("нет fragment_cookie/ton_seed")
        # ленивый импорт тяжёлых зависимостей
        from .client import FragmentAPI
        from .utils import from_nano
        from .ton_client import TonClient
        self._from_nano = from_nano
        self.cfg = cfg
        self.seed = seed
        self.fragment = FragmentAPI(cookie)
        self.ton = TonClient(seed)
        self.min_stars = int(cfg.get("min_stars", 50))
        self.max_stars = int(cfg.get("max_stars", 1_000_000))
        self.show_sender = bool(cfg.get("show_sender", False))
        pm = str(cfg.get("payment_method") or "ton").strip().lower()
        self.payment_method = pm if pm in PAYMENT_METHODS else "ton"

    @staticmethod
    def _jetton_amount_from_payload(fixed_payload: str):
        """Достать сумму jetton'а (raw-единицы) из тела jetton-transfer, что вернул
        Fragment для usdt_ton. Возвращает int (raw) или None, если это не
        jetton-transfer (напр. обычный TON-комментарий).
        ВАЖНО: парсим через Cell.one_from_boc — он возвращает Cell (у него есть
        begin_parse). Builder().one_from_boc возвращает Builder БЕЗ begin_parse →
        раньше молча падал в except и себестоимость USDT не считалась (зонд 08-04)."""
        try:
            from pytoniq_core import Cell
            cell = Cell.one_from_boc(fixed_payload)
            sl = cell.begin_parse()
            if sl.load_uint(32) != JETTON_TRANSFER_OP:
                return None
            sl.load_uint(64)          # query_id
            return sl.load_coins()    # amount: VarUInteger 16 (raw jetton-единицы)
        except Exception:  # noqa: BLE001 — не смогли распарсить: не блокируем выдачу
            return None

    # username + количество звёзд из заказа
    def _resolve(self, ctx: dict):
        lot = ctx.get("lot") or {}
        # ручная выдача с сайта может передать исправленный @username и кол-во
        # звёзд — они имеют приоритет над тем, что вписал покупатель в заказе.
        ov_user = ctx.get("override_username")
        if ov_user:
            username = _clean_username(str(ov_user))
        else:
            raw_user = ctx["opt"](*(lot.get("username_field") or
                                    ["username", "телеграм", "telegram", "юзернейм", "@"]))
            username = _clean_username(raw_user or "")
        ov_stars = ctx.get("override_stars")
        if ov_stars not in (None, ""):
            stars = int(re.sub(r"[^\d]", "", str(ov_stars)) or 0)
        else:
            sf = lot.get("stars_field")
            if sf:
                raw = ctx["opt"](*([sf] if isinstance(sf, str) else sf))
                stars = int(re.sub(r"[^\d]", "", raw or "0") or 0)
            else:
                stars = int(float(ctx.get("cnt_goods") or 0))
        return username, stars

    def preview(self, ctx: dict) -> str:
        try:
            username, stars = self._resolve(ctx)
        except Exception as e:  # noqa: BLE001
            return f"не смог вычислить username/кол-во: {e}"
        return f"Отправка {stars}⭐ на @{username} (товар: {str(ctx.get('product_name'))[:40]})"

    def deliver(self, ctx: dict):
        username, stars = self._resolve(ctx)
        if not username:
            return False, ("⚠️ Не вижу корректный Telegram @username в заказе. "
                           "Напишите его в чат — отправлю звёзды вручную."), \
                   f"плохой username: {ctx['opt']('username', 'телеграм')!r}"
        if not (self.min_stars <= stars <= self.max_stars):
            return False, "⚠️ Количество звёзд вне допустимого диапазона.", f"stars={stars}"

        if not self.ton.has_seed:
            return False, "⚠️ Временная проблема с кошельком. Продавец свяжется с вами.", "no seed"
        balance = self.ton.get_balance(self.seed)
        if balance is None:
            return False, "⚠️ Временная проблема с кошельком. Продавец свяжется с вами.", "no balance"

        # поиск получателя во Fragment
        recipient = self.fragment.search_stars_recipient(username)
        if recipient is None:
            return False, (f"⚠️ Не удалось найти получателя @{username} в Telegram. "
                           "Проверьте username и напишите в чат."), "recipient not found"

        # init → link с выбранным способом оплаты (ton | usdt_ton)
        pm = self.payment_method
        init = self.fragment.init_stars_buy_request(recipient.found.recipient, stars,
                                                    payment_method=pm)
        buy = self.fragment.get_stars_buy_link(init.req_id, self.show_sender,
                                               payment_method=pm)
        msg0 = buy.transaction.messages[0]
        nano_amount = msg0.amount           # ton: полный платёж; usdt_ton: газ (~0.05 TON)
        ton_amount = self._from_nano(nano_amount)

        usdt_amount = None
        if pm == "usdt_ton":
            # Сумма USDT — из тела jetton-перевода (÷10^6), а НЕ из init.amount
            # (Fragment там делит на 10^9 — занижает в 1000×). Нужны ДВА баланса:
            # TON на газ + USDT-jetton на саму покупку.
            usdt_raw = self._jetton_amount_from_payload(msg0.fixed_payload)
            usdt_amount = (usdt_raw / 10 ** USDT_DECIMALS) if usdt_raw is not None else None
            if balance < ton_amount:
                return False, "⚠️ Временная задержка выдачи. Продавец скоро отправит.", \
                       f"мало TON на газ: {balance} < {ton_amount}"
            usdt_balance = self.ton.get_jetton_balance(self.seed)
            if usdt_balance is None:
                return False, "⚠️ Временная проблема с кошельком. Продавец свяжется с вами.", \
                       "не прочитан баланс USDT"
            if usdt_amount is not None and usdt_balance < usdt_amount:
                return False, "⚠️ Временная задержка выдачи. Продавец скоро отправит.", \
                       f"мало USDT: {usdt_balance} < {usdt_amount}"
        else:
            if balance < ton_amount:
                return False, "⚠️ Временная задержка выдачи. Продавец скоро отправит.", \
                       f"недостаточно баланса: {balance} < {ton_amount}"

        ok, msg, tx = self.ton.transfer(destination=msg0.address, nano_amount=nano_amount,
                                        payload=msg0.fixed_payload, seed_phrase=self.seed)
        if not ok:
            return False, "⚠️ Задержка при отправке звёзд. Продавец скоро завершит.", f"ton: {msg}"
        if not tx:                       # лайт-сервер иногда не отдаёт хэш — берём из toncenter
            tx = self._latest_tx_hash()
        # фактическая себестоимость сделки — для отчёта о прибыли в ТГ.
        # Пишем ТОЛЬКО после успешного перевода, реальные величины, ничего не оцениваем.
        if pm == "usdt_ton":
            ctx["cost"] = {"usd": (float(usdt_amount) if usdt_amount is not None else None),
                           "currency": "USDT", "gas_ton": float(ton_amount),
                           "qty": stars, "unit": "⭐", "recipient": f"@{username}", "tx": tx}
        else:
            try:
                rate = float(self.fragment.ton_rate)
            except Exception:  # noqa: BLE001 — курс недоступен: отдадим хотя бы TON
                rate = None
            ctx["cost"] = {"ton": float(ton_amount), "rate_usd": rate,
                           "usd": (float(ton_amount) * rate) if rate else None,
                           "qty": stars, "unit": "⭐", "recipient": f"@{username}", "tx": tx}
        link = f"https://tonviewer.com/transaction/{tx}" if tx else ""
        return True, (f"✅ {stars}⭐ успешно отправлены на @{username}! Спасибо за покупку."
                      + (f"\nТранзакция: {link}" if link else "")), \
               f"ok stars={stars} @{username} tx={tx}"

    def _latest_tx_hash(self) -> str | None:
        """Хэш последнего исходящего перевода кошелька (fallback для чека)."""
        try:
            import requests
            addr = self.ton._address_from_seed(self.seed)
            r = requests.get("https://toncenter.com/api/v2/getTransactions",
                             params={"address": addr, "limit": 1}, timeout=15).json()
            txs = r.get("result") or []
            if txs:
                return (txs[0].get("transaction_id") or {}).get("hash")
        except Exception:  # noqa: BLE001
            pass
        return None
