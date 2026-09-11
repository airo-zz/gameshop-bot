"""
Движок автовыдачи Telegram Premium подарком через Fragment + собственный
TON-кошелёк.

Это независимый клон ``stars_engine`` (см. соседний файл): та же платёжная связка
FragmentAPI + встроенный TonClient на pytoniq, тот же init→link→ton.transfer.
Отличий три:
  1. вместо количества звёзд — СРОК подписки (3/6/12 мес). Fragment продаёт
     Premium только этими тремя тарифами.
  2. срок покупатель выбирает radio-кнопкой в заказе GGSel → достаём его из опций
     (а не из cnt_goods, как звёзды);
  3. методы Fragment — Premium-семейство (init_gift_premium_request /
     get_gift_premium_link / search_premium_gift_recipient).

Секреты (Fragment-кука + seed TON-кошелька) — общие со звёздами: это один и тот
же Fragment-аккаунт и один кошелёк. Хаб спускает их в блоке ``premium`` конфига.
Свой у Premium — тумблер вкл/выкл, набор лотов и способ оплаты (payment_method).

Зависимости (pydantic, pytoniq, lxml, bs4) импортируются лениво — если их нет,
конструктор бросает исключение, и оркестратор помечает движок недоступным
(остальная автовыдача продолжает работать).

Интерфейс (как у StarsEngine):
    PremiumEngine(cfg).preview(ctx) -> str
    PremiumEngine(cfg).deliver(ctx) -> (ok, buyer_message, detail)
"""
from __future__ import annotations
import re

USERNAME_RE = re.compile(r"(?:@|t\.me/|telegram\.me/)?([A-Za-z0-9_]{4,32})\s*$", re.I)

# Fragment payment_method: "ton" (нативный TON) или "usdt_ton" (USDT-jetton на TON).
# Значение именно "usdt_ton" — "usdt"/"usdc" Fragment отвергает ("Access denied").
PAYMENT_METHODS = ("ton", "usdt_ton")
JETTON_TRANSFER_OP = 0x0f8a7ea5      # TEP-74 jetton transfer
USDT_DECIMALS = 6

# Fragment продаёт Premium только этими сроками (месяцы). Всё остальное — отказ,
# лучше не выдать вовсе, чем выдать не тот тариф.
ALLOWED_MONTHS = (3, 6, 12)

# По названию какой опции заказа искать срок в первую очередь (radio-кнопка).
# Нормализованные (нижний регистр, ё→е) подстроки.
_MONTH_HINTS = ("срок", "период", "месяц", "подписк", "тариф", "длительн",
                "premium", "премиум", "план", "plan", "duration", "period")


def _norm(s) -> str:
    return str(s or "").lower().replace("ё", "е")


def _clean_username(raw: str) -> str | None:
    if not raw:
        return None
    m = USERNAME_RE.search(str(raw).strip())
    return m.group(1) if m else None


def _parse_months(raw) -> int | None:
    """Достать срок Premium (месяцы) из текста radio-кнопки заказа.

    Понимает «3 месяца», «6 мес», «12 месяцев», «1 год», «полгода».
    Возвращает срок ТОЛЬКО если он входит в ALLOWED_MONTHS (3/6/12) — иначе None
    (пусть выдача мягко откажет, а не купит не тот тариф)."""
    if raw in (None, ""):
        return None
    s = _norm(raw).strip()
    if "полгод" in s:
        months = 6
    elif "год" in s or "лет" in s or "year" in s:
        m = re.search(r"(\d+)", s)
        months = int(m.group(1)) * 12 if m else 12
    else:
        m = re.search(r"(\d+)", s)
        if not m:
            return None
        months = int(m.group(1))
    return months if months in ALLOWED_MONTHS else None


class PremiumEngine:
    def __init__(self, cfg: dict):
        if not cfg.get("enabled"):
            raise RuntimeError("premium.enabled=false")
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
        self.show_sender = bool(cfg.get("show_sender", False))
        pm = str(cfg.get("payment_method") or "ton").strip().lower()
        self.payment_method = pm if pm in PAYMENT_METHODS else "ton"

    @staticmethod
    def _jetton_amount_from_payload(fixed_payload: str):
        """Сумма jetton'а (raw-единицы) из тела jetton-transfer для usdt_ton.
        None, если это не jetton-transfer (обычный TON-комментарий). См. подробный
        разбор в stars_engine — тут та же логика (парсим Cell.one_from_boc)."""
        try:
            from pytoniq_core import Cell
            cell = Cell.one_from_boc(fixed_payload)
            sl = cell.begin_parse()
            if sl.load_uint(32) != JETTON_TRANSFER_OP:
                return None
            sl.load_uint(64)          # query_id
            return sl.load_coins()    # amount (raw jetton-единицы)
        except Exception:  # noqa: BLE001 — не распарсили: не блокируем выдачу
            return None

    def _resolve_username(self, ctx: dict) -> str | None:
        lot = ctx.get("lot") or {}
        ov_user = ctx.get("override_username")
        if ov_user:
            return _clean_username(str(ov_user))
        raw_user = ctx["opt"](*(lot.get("username_field") or
                                ["username", "телеграм", "telegram", "юзернейм", "@"]))
        return _clean_username(raw_user or "")

    def _resolve_months(self, ctx: dict) -> int | None:
        """Срок Premium из заказа. Приоритет: ручной override → опция, чьё имя
        намекает на срок → любая опция со значением-сроком → название товара."""
        ov = ctx.get("override_months")
        if ov not in (None, ""):
            return _parse_months(ov)
        lot = ctx.get("lot") or {}
        mf = lot.get("months_field")
        if mf:
            raw = ctx["opt"](*([mf] if isinstance(mf, str) else mf))
            m = _parse_months(raw)
            if m:
                return m
        opts = ctx.get("options") or {}
        # 1) опция с «сроко-подобным» названием (radio-кнопка тарифа)
        for name, val in opts.items():
            if any(h in _norm(name) for h in _MONTH_HINTS):
                m = _parse_months(val)
                if m:
                    return m
        # 2) любая опция, значение которой распознаётся как срок
        for val in opts.values():
            m = _parse_months(val)
            if m:
                return m
        # 3) фолбэк — название товара («Telegram Premium 3 месяца»)
        return _parse_months(ctx.get("product_name"))

    def preview(self, ctx: dict) -> str:
        try:
            username = self._resolve_username(ctx)
            months = self._resolve_months(ctx)
        except Exception as e:  # noqa: BLE001
            return f"не смог вычислить username/срок: {e}"
        return (f"Подарок Telegram Premium на {months} мес → @{username} "
                f"(товар: {str(ctx.get('product_name'))[:40]})")

    def deliver(self, ctx: dict):
        from .exceptions import AccountAlreadyHasPremium

        username = self._resolve_username(ctx)
        months = self._resolve_months(ctx)
        if not username:
            return False, ("⚠️ Не вижу корректный Telegram @username в заказе. "
                           "Напишите его в чат — отправлю Premium вручную."), \
                   f"плохой username: {ctx['opt']('username', 'телеграм')!r}"
        if months not in ALLOWED_MONTHS:
            return False, ("⚠️ Не смог определить срок Premium (3, 6 или 12 месяцев) "
                           "из заказа. Напишите срок в чат — оформлю вручную."), \
                   f"плохой срок: months={months}"

        if not self.ton.has_seed:
            return False, "⚠️ Временная проблема с кошельком. Продавец свяжется с вами.", "no seed"
        balance = self.ton.get_balance(self.seed)
        if balance is None:
            return False, "⚠️ Временная проблема с кошельком. Продавец свяжется с вами.", "no balance"

        # поиск получателя во Fragment (для Premium нужен срок)
        try:
            recipient = self.fragment.search_premium_gift_recipient(username, months=months)
        except AccountAlreadyHasPremium:
            return False, (f"⚠️ У @{username} уже активен Telegram Premium — подарок "
                           "оформить нельзя. Уточните username в чате."), "already premium"
        if recipient is None:
            return False, (f"⚠️ Не удалось найти получателя @{username} в Telegram. "
                           "Проверьте username и напишите в чат."), "recipient not found"

        # init → link с выбранным способом оплаты (ton | usdt_ton)
        pm = self.payment_method
        init = self.fragment.init_gift_premium_request(recipient.found.recipient, months,
                                                       payment_method=pm)
        buy = self.fragment.get_gift_premium_link(init.req_id, self.show_sender,
                                                  payment_method=pm)
        msg0 = buy.transaction.messages[0]
        nano_amount = msg0.amount           # ton: полный платёж; usdt_ton: газ (~0.05 TON)
        ton_amount = self._from_nano(nano_amount)

        usdt_amount = None
        if pm == "usdt_ton":
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
            return False, "⚠️ Задержка при отправке Premium. Продавец скоро завершит.", f"ton: {msg}"
        if not tx:                       # лайт-сервер иногда не отдаёт хэш — берём из toncenter
            tx = self._latest_tx_hash()
        # фактическая себестоимость сделки — для отчёта о прибыли в ТГ.
        if pm == "usdt_ton":
            ctx["cost"] = {"usd": (float(usdt_amount) if usdt_amount is not None else None),
                           "currency": "USDT", "gas_ton": float(ton_amount),
                           "qty": months, "unit": " мес", "recipient": f"@{username}", "tx": tx}
        else:
            try:
                rate = float(self.fragment.ton_rate)
            except Exception:  # noqa: BLE001 — курс недоступен: отдадим хотя бы TON
                rate = None
            ctx["cost"] = {"ton": float(ton_amount), "rate_usd": rate,
                           "usd": (float(ton_amount) * rate) if rate else None,
                           "qty": months, "unit": " мес", "recipient": f"@{username}", "tx": tx}
        link = f"https://tonviewer.com/transaction/{tx}" if tx else ""
        return True, (f"✅ Telegram Premium на {months} мес успешно отправлен на @{username}! "
                      "Спасибо за покупку." + (f"\nТранзакция: {link}" if link else "")), \
               f"ok premium={months}mo @{username} tx={tx}"

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
