"""Встроенный TON-клиент: pytoniq в asyncio-loop в отдельном Thread.

Заменяет standalone uvicorn-сервис ton_api.py из апстрима FunPayVertex-Stars.
Преимущества:
- Один процесс (не нужен второй uvicorn-демон).
- Синхронные методы `transfer()` / `get_balance()` для плагина, под капотом
  кидают корутины в asyncio-loop через `run_coroutine_threadsafe`.
- Batching из апстрима сохранён: до 4 переводов в одной транзакции.
- Lazy инициализация: LiteBalancer.start_up() только при первом вызове.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import re
import threading
import time
from typing import TYPE_CHECKING

logger = logging.getLogger("FPV.ton")

if TYPE_CHECKING:
    pass

_REF_MARKER = re.compile(rb"Ref#[A-Za-z0-9]+")


def _tx_hash_to_hex(b64_hash: str | None) -> str | None:
    """toncenter отдаёт хеш транзакции в base64 (может содержать '/' и '+'),
    а tonviewer.com в URL пути ожидает HEX — base64-хеш с '/' в пути ломает
    ссылку (реальный кейс 2026-09-27: покупатель открыл ссылку из сообщения
    "успешно отправлено" и увидел 404 у tonviewer, хотя перевод реально
    прошёл). Проверено вживую: tonviewer.com/transaction/<hex> открывает
    страницу транзакции, tonviewer.com/transaction/<base64-с-слэшем> — нет.
    При любой ошибке декодирования возвращаем исходную строку как есть —
    лучше рабочая-может-быть-ссылка, чем совсем никакой."""
    if not b64_hash:
        return b64_hash
    try:
        return base64.b64decode(b64_hash).hex()
    except Exception:
        return b64_hash


def _get_ref_id(payload: bytes) -> str:
    """ref_id перевода. Для USDT (jetton) ref лежит в БИНАРНОЙ ячейке маркером
    «Ref#<токен>» — берём его регуляркой (строгий split('\\n\\n').decode()
    падает на бинарном хвосте jetton-BOC → None → ложное «не подтверждён»,
    реальный кейс 2026-09-26). Для нативного TON (текст-комментарий) — хвост
    после '\\n\\n', как и раньше."""
    m = _REF_MARKER.search(payload)
    if m:
        return m.group(0).decode()
    return payload.split(b"\n\n")[-1].decode()


def _get_ref_id_safe(payload: bytes) -> str | None:
    """Как _get_ref_id, но не бросает исключение на неожиданном формате —
    для сверки чужих (не наших) байт с toncenter, где формат не гарантирован."""
    try:
        return _get_ref_id(payload)
    except Exception:
        return None


USDT_JETTON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"
USDT_DECIMALS = 6
DEFAULT_WALLET_ID = 698983191  # тот же wallet_id, что и в _address_from_seed
# sendBoc отказал (HTTP 500 и т.п.) — даём сети время обработать сообщение,
# которое могло уйти несмотря на плохой ответ, прежде чем перепроверять seqno
# (см. _send_via_toncenter, реальный кейс 2026-10-09).
SENDBOC_RECOVERY_DELAY_SEC = 6.0


def _toncenter_request(method: str, url: str, *, params: dict | None = None,
                       json_body: dict | None = None, timeout: float = 15.0,
                       max_retries: int = 4, api_key: str | None = None):
    """GET/POST к toncenter с повтором при 429 (реальный кейс 2026-09-27:
    публичный toncenter без API-ключа режет под нагрузкой нескольких хабов
    одновременно — без этого одно попадание под лимит роняло заказ целиком
    отдельным честным исключением, хотя деньги/ключи были в полном порядке).
    Уважает заголовок Retry-After, если сервер его прислал, иначе короткая
    растущая пауза. `api_key`, если задан (получен через @tonapibot в
    Telegram), уходит заголовком X-Api-Key — сильно поднимает лимит запросов,
    так что 429 на нём практически не должно случаться, но повтор всё равно
    оставлен на случай кратковременного всплеска. Возвращает Response (в т.ч.
    последний неудачный при исчерпанных попытках — вызывающий код сам
    разбирает status_code) или None при сетевом исключении."""
    import requests
    headers = {"X-Api-Key": api_key} if api_key else None
    delay = 1.0
    resp = None
    for attempt in range(max_retries):
        try:
            if method == "GET":
                resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            else:
                resp = requests.post(url, json=json_body, headers=headers, timeout=timeout)
        except Exception as exc:
            logger.warning("toncenter %s %s failed: %s", method, url, exc)
            return None
        if resp.status_code != 429:
            return resp
        retry_after = resp.headers.get("Retry-After")
        try:
            wait = float(retry_after) if retry_after else delay
        except ValueError:
            wait = delay
        logger.warning("toncenter 429 на %s (попытка %d/%d) — жду %.1fс",
                       url, attempt + 1, max_retries, wait)
        if attempt < max_retries - 1:
            time.sleep(wait)
        delay = min(delay * 2, 10.0)
    return resp


class TonClient:
    """Синхронный фасад над pytoniq-asyncio. Запускает event-loop в Thread."""

    def __init__(self, seed_phrase: str | None = None, trust_level: int = 1,
                api_key: str | None = None) -> None:
        self._seed_phrase = seed_phrase or ""
        self._trust_level = trust_level
        # toncenter API-ключ (получается через @tonapibot в Telegram) — сильно
        # поднимает лимит запросов у всех обращений к toncenter в этом классе.
        # Без него используется публичный (низкий) лимит.
        self._api_key = api_key or ""
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread: threading.Thread | None = None
        self._provider = None
        self._queue: "asyncio.Queue | None" = None
        self._queue_task: "asyncio.Task | None" = None
        self._started = threading.Event()
        self._start_lock = threading.Lock()

    # ── Управление жизненным циклом ─────────────────────────────────────────

    def set_seed_phrase(self, seed_phrase: str) -> None:
        self._seed_phrase = seed_phrase or ""

    def set_api_key(self, api_key: str) -> None:
        self._api_key = api_key or ""

    @property
    def has_seed(self) -> bool:
        return bool(self._seed_phrase and self._seed_phrase.strip())

    def start(self) -> None:
        """Запускает asyncio loop в Thread. Идемпотентно."""
        with self._start_lock:
            if self._loop_thread and self._loop_thread.is_alive():
                return
            self._started.clear()
            self._loop_thread = threading.Thread(
                target=self._run_loop, daemon=True, name="TonClient-Loop"
            )
            self._loop_thread.start()
            self._started.wait(timeout=30)
            if not self._started.is_set():
                raise RuntimeError("TonClient loop не запустился за 30с")

    def _run_loop(self) -> None:
        try:
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._loop.run_until_complete(self._async_init())
            self._started.set()
            self._loop.run_forever()
        except Exception as exc:
            logger.exception("TonClient loop рухнул: %s", exc)
            self._started.set()

    async def _async_init(self) -> None:
        from pytoniq.liteclient.balancer import LiteBalancer
        self._provider = LiteBalancer.from_mainnet_config(trust_level=self._trust_level)
        await self._provider.start_up()
        self._queue = asyncio.Queue()
        self._queue_task = asyncio.create_task(self._process_queue())
        logger.info("TonClient: подключён к mainnet, очередь запущена")

    def stop(self) -> None:
        if not self._loop or not self._loop.is_running():
            return
        async def _shutdown():
            if self._queue_task:
                self._queue_task.cancel()
            if self._provider:
                try:
                    await self._provider.close_all()
                except Exception:
                    pass
        try:
            fut = asyncio.run_coroutine_threadsafe(_shutdown(), self._loop)
            fut.result(timeout=10)
        except Exception:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)

    # ── Очередь батчей ──────────────────────────────────────────────────────

    async def _process_queue(self) -> None:
        while True:
            try:
                batch: list = []
                futures: list = []
                seed_phrase: str | None = None
                while len(batch) < 4 and not self._queue.empty():
                    destination, nano_amount, payload, seed, future = await self._queue.get()
                    seed_phrase = seed
                    batch.append((destination, nano_amount, payload))
                    futures.append(future)
                if not batch:
                    await asyncio.sleep(0.1)
                    continue
                try:
                    tx_hash = await self._do_transfer(batch, seed_phrase)
                    for f in futures:
                        f.set_result(tx_hash)
                except Exception as exc:
                    logger.exception("Batch transfer failed: %s", exc)
                    for f in futures:
                        if not f.done():
                            f.set_exception(exc)
                finally:
                    for _ in batch:
                        self._queue.task_done()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Queue loop error")
                await asyncio.sleep(1)

    async def _do_transfer(self, transfers: list[tuple[str, int, str]], seed_phrase: str) -> str | None:
        from pytoniq.contract.wallets.wallet import WalletV4R2, Address
        from pytoniq_core import Cell

        wallet_messages = []
        for destination, nano_amount, payload in transfers:
            wallet_messages.append(
                WalletV4R2.create_wallet_internal_message(
                    destination=Address(destination),
                    value=nano_amount,
                    # ВАЖНО (2026-09-27, реальный кейс): было Builder().one_from_boc(payload) —
                    # вызов метода парсинга BOC на ПУСТОМ Builder-инстансе вместо классового
                    # Cell.one_from_boc(). На текущей версии pytoniq_core это не возвращает
                    # нормальную Cell (нет атрибута level_mask, который читает сериализация
                    # сообщения) → "'Builder' object has no attribute 'level_mask'", перевод
                    # падает ДО отправки (деньги не списаны, просто не собралось тело сообщения).
                    body=Cell.one_from_boc(payload),
                )
            )

        # ЕДИНСТВЕННЫЙ путь отправки (решение владельца, 2026-09-27): полностью
        # через toncenter (seqno + рассылка) — БЕЗ запасного пути через прямое
        # подключение к LiteServer. Раньше был запасной путь на случай сбоя
        # toncenter ДО отправки (в этом случае деньги гарантированно не
        # списаны, повторной отправки через второй путь не возникло бы), но
        # владелец явно попросил убрать его вовсе — один путь отправки, без
        # исключений, чтобы вообще не было почвы для путаницы между двумя
        # механизмами. Раз пути нет — сбой toncenter теперь означает честный
        # неуспех без всякой отправки, продавец довыдаст вручную.
        ok, reason = await self._send_via_toncenter(seed_phrase, wallet_messages)
        if not ok:
            # ВАЖНО (2026-09-27, реальный кейс): раньше тут было одно общее
            # сообщение на все 4 возможных причины ("ключи/seqno/подпись/
            # sendBoc") — заказ падал с ним и точную причину было не узнать
            # без логов агента (а они на машине продавца, снаружи не видны).
            # Теперь _send_via_toncenter возвращает конкретную причину, и она
            # долетает до продавца в detail заказа/уведомлении.
            raise RuntimeError(f"не удалось отправить перевод через toncenter: {reason}")
        return None  # хеш найдёт transfer() через _wait_for_confirmation (тоже toncenter)

    async def _send_via_toncenter(self, seed_phrase: str, wallet_messages: list) -> tuple[bool, str]:
        """ВСЯ отправка (seqno + рассылка) — через toncenter, LiteServer не
        используется вообще. (True, "ok"), только если перевод реально ушёл
        в сеть (sendBoc принял его). (False, причина) при любом сбое — ДО
        отправки (ключи/seqno/сборка) или самого sendBoc — деньги в любом
        случае из этого метода никуда не уходят второй раз: он либо
        отправляет ровно один раз, либо не отправляет вовсе. Конкретная
        причина возвращается наружу (а не только в лог) — без этого продавец
        видит в заказе общее "не удалось" и не может понять, что чинить."""
        from pytoniq.contract.wallets.wallet import WalletV4R2, Address
        from pytoniq.contract.contract import Contract

        address_str = self._address_from_seed(seed_phrase)
        private_key = self._private_key_from_seed(seed_phrase)
        if not address_str or not private_key:
            return False, "не удалось получить ключи кошелька из seed"

        seqno = await asyncio.to_thread(self._get_seqno_via_toncenter, address_str)
        if seqno is None:
            return False, "не удалось получить seqno через toncenter (getWalletInformation)"

        try:
            transfer_msg = WalletV4R2.raw_create_transfer_msg(
                private_key=private_key, seqno=seqno, wallet_id=DEFAULT_WALLET_ID,
                messages=wallet_messages)
            external_msg = Contract.create_external_msg(
                dest=Address(address_str), body=transfer_msg)
            boc_b64 = base64.b64encode(external_msg.serialize().to_boc()).decode()
        except Exception as exc:
            return False, f"не собрался перевод локально: {type(exc).__name__}: {exc}"

        sent_ok, tc_err = await asyncio.to_thread(self._send_boc_via_toncenter, boc_b64)
        if not sent_ok:
            # sendBoc мог отказать уже ПОСЛЕ того, как реально разослал сообщение
            # в сеть — собственный бэкенд toncenter падает (HTTP 500) отдельно от
            # приёма внешнего сообщения лайт-серверами. Реальный кейс 2026-10-09:
            # ~15 заказов звёзд подряд получили "HTTP 500", покупатели реально
            # получили звёзды, транзакции подтвердились на блокчейне — а заказы
            # были помечены как ошибка (деньги якобы не списаны, повтор «безопасен»,
            # хотя на деле повтор был бы вторым платежом за одну и ту же выдачу).
            # Проверяем это по seqno (однозначный сигнал, без привязки к ref/сумме):
            # если он уже сдвинулся дальше того, что мы подписали — сеть приняла и
            # обработала НАШЕ сообщение (транзакции идут через эту же очередь по
            # одной, так что сдвиг за этот короткий интервал — точно наш перевод).
            await asyncio.sleep(SENDBOC_RECOVERY_DELAY_SEC)
            new_seqno = await asyncio.to_thread(self._get_seqno_via_toncenter, address_str)
            if new_seqno is not None and new_seqno > seqno:
                logger.warning("sendBoc отказал (%s), но seqno кошелька сдвинулся %d→%d — "
                               "перевод реально ушёл в сеть, несмотря на ошибку toncenter",
                               tc_err, seqno, new_seqno)
                return True, "ok"
            return False, f"sendBoc отказал: {tc_err}"
        logger.info("Перевод отправлен через toncenter")
        return True, "ok"

    def _private_key_from_seed(self, seed: str) -> bytes | None:
        """Приватный ключ (raw secret_key libsodium, 64 байта) из seed-фразы —
        чистая локальная операция, сети не касается вообще. Используется для
        подписи перевода в обход подключения к узлу (см. _send_via_toncenter).
        Адрес для этого же кошелька — отдельно, через _address_from_seed
        (уже проверенная логика, тут не дублируется, чтобы не рисковать
        расхождением в вычислении адреса между двумя местами)."""
        try:
            from pytoniq_core.crypto.keys import mnemonic_to_private_key
            _, private_key = mnemonic_to_private_key(seed.split())
            return private_key
        except Exception as exc:
            logger.warning("private_key_from_seed failed: %s", exc)
            return None

    def _get_seqno_via_toncenter(self, address: str) -> int | None:
        """seqno кошелька через toncenter HTTP (getWalletInformation) — не
        требует подключения к LiteServer вообще. None при любой ошибке
        (в т.ч. если 429 не отпустил за все повторы, см. _toncenter_request)."""
        r = _toncenter_request("GET", "https://toncenter.com/api/v2/getWalletInformation",
                               params={"address": address}, timeout=15, api_key=self._api_key)
        if r is None:
            return None
        if r.status_code != 200:
            logger.warning("getWalletInformation status %s: %s", r.status_code, r.text[:200])
            return None
        try:
            data = r.json()
        except Exception as exc:
            logger.warning("getWalletInformation: не распарсился ответ: %s", exc)
            return None
        if not data.get("ok"):
            return None
        result = data.get("result") or {}
        if not result.get("wallet"):
            return 0  # аккаунт ещё не задеплоен — первая же транзакция его задеплоит
        return int(result.get("seqno") or 0)

    def _send_boc_via_toncenter(self, boc_b64: str) -> tuple[bool, str]:
        """Рассылает уже ПОДПИСАННЫЙ перевод через toncenter (POST /sendBoc) —
        в обход прямого подключения к LiteServer. Toncenter не получает
        seed/приватный ключ — только готовый запечатанный перевод, который
        либо примет и разошлёт по сети, либо нет. Повторяет при 429 (реальный
        кейс: "Ratelimit exceed" — публичный toncenter без API-ключа режет
        под нагрузкой), см. _toncenter_request."""
        r = _toncenter_request("POST", "https://toncenter.com/api/v2/sendBoc",
                               json_body={"boc": boc_b64}, timeout=20, api_key=self._api_key)
        if r is None:
            return False, "сетевая ошибка при обращении к toncenter"
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
        try:
            data = r.json()
        except Exception as exc:
            return False, f"не распарсился ответ toncenter: {exc}"
        if not data.get("ok"):
            return False, str(data.get("error") or data)[:200]
        return True, "ok"

    # ── Публичный синхронный API ─────────────────────────────────────────────

    def transfer(self, destination: str, nano_amount: int, payload: str,
                 seed_phrase: str | None = None,
                 confirm_timeout: float = 240.0,
                 confirm_poll_interval: float = 10.0,
                 wait_for_confirm: bool = True) -> tuple[bool, str, str | None]:
        """Синхронно отправить TON. Возвращает (success, message, tx_hash).

        ВАЖНО: это НЕ авто-ретрай отправки — отправка (через toncenter, см.
        _send_via_toncenter/_do_transfer) происходит ровно один раз, без
        запасных путей, и success=True здесь означает именно это: sendBoc
        реально принял перевод сетью. Деньги повторно не тратятся ни при
        каком исходе.

        wait_for_confirm=True (по умолчанию) — success=True только если хеш
        НАЙДЕН за confirm_timeout, иначе (False, "не подтверждён", None),
        хотя деньги уже ушли. Было 120с — заказ #52387331 (2026-09-27)
        реально ушёл и подтвердился (проверено напрямую через toncenter: тот
        же Ref#-маркер, сумма и адрес), но всего на ~47с ПОЗЖЕ дедлайна —
        покупатель получил "не удалось" вместо ссылки на транзакцию. Подняли
        до 4 минут.

        wait_for_confirm=False (2026-09-27, для stars/premium engine) —
        владелец явно решил: раз sendBoc принял перевод — этого достаточно,
        покупателю сразу уходит "успешно" с tx_hash=None, хеш вообще не
        ищем (ни сразу, ни в фоне). Доказательством отправки служит не хеш,
        а ref_id платежа — он известен ДО отправки (зашит в тот же payload,
        который реально улетает в сеть) и попадает в detail заказа
        независимо от исхода (см. _ref_id_for_report в stars/premium_engine):
        по нему владелец в любой момент сам найдёт транзакцию на кошельке
        через toncenter (архив хранится вечно), без риска ложной ошибки
        покупателю из-за того, что индексация не успела за какое-то окно."""
        seed = seed_phrase or self._seed_phrase
        if not seed:
            return False, "TON seed-phrase не задана", None
        if not self._loop or not self._loop.is_running():
            try:
                self.start()
            except Exception as exc:
                return False, f"TonClient start failed: {exc}", None

        async def _enqueue():
            fut = asyncio.Future()
            await self._queue.put((destination, nano_amount, payload, seed, fut))
            return await fut

        try:
            cf = asyncio.run_coroutine_threadsafe(_enqueue(), self._loop)
            tx_hash = cf.result(timeout=120)
        except Exception as exc:
            return False, f"{type(exc).__name__}: {exc}", None

        if tx_hash:
            return True, "ok", tx_hash

        if not wait_for_confirm:
            return True, "ok", None

        tx_hash = self._wait_for_confirmation(
            destination, nano_amount, payload,
            total_wait=confirm_timeout, poll_interval=confirm_poll_interval)
        if not tx_hash:
            return False, ("перевод отправлен, но не подтверждён сетью за "
                          f"{confirm_timeout:.0f}с (нет хеша)"), None
        return True, "ok", tx_hash

    def _wait_for_confirmation(self, destination: str, nano_amount: int, payload: str,
                               total_wait: float = 120.0,
                               poll_interval: float = 10.0) -> str | None:
        """ТОЛЬКО проверяет, дошёл ли уже отправленный перевод — ничего не
        отправляет повторно. Первая пауза (7с) даёт индексатору время; дальше
        переспрашиваем toncenter каждые poll_interval сек, пока не найдём хеш
        или не выйдет total_wait. max_age_seconds у find_recent_tx_hash с
        запасом (total_wait + 60), чтобы не отсечь свою же транзакцию, если
        поиск идёт долго."""
        deadline = time.time() + total_wait
        time.sleep(min(7.0, max(total_wait, 0.0)))
        max_age = int(total_wait) + 60
        while True:
            tx = self.find_recent_tx_hash(destination, int(nano_amount), payload=payload,
                                          max_age_seconds=max_age)
            if tx:
                return tx
            if time.time() >= deadline:
                return None
            time.sleep(poll_interval)

    def _address_from_seed(self, seed: str) -> str | None:
        """Получить V4R2 адрес из mnemonic БЕЗ обращения к блокчейну."""
        try:
            from pytoniq.contract.wallets.wallet import WALLET_V4_R2_CODE
            from pytoniq_core.crypto.keys import mnemonic_to_private_key
            from pytoniq_core.boc import Builder
            from pytoniq_core import Address, StateInit
            import nacl.signing

            words = seed.split()
            result = mnemonic_to_private_key(words)
            priv = result[1] if isinstance(result, (tuple, list)) else result
            verify = nacl.signing.SigningKey(priv[:32]).verify_key
            pubkey = bytes(verify)

            data = (Builder()
                    .store_uint(0, 32)            # seqno
                    .store_uint(698983191, 32)    # default mainnet wallet_id
                    .store_bytes(pubkey)
                    .store_uint(0, 1)
                    .end_cell())
            si = StateInit(code=WALLET_V4_R2_CODE, data=data)
            addr = Address((0, si.serialize().hash))
            return addr.to_str(is_user_friendly=False)
        except Exception as exc:
            logger.warning("address_from_seed failed: %s", exc)
            return None

    def find_recent_tx_hash(self, destination: str, expected_value_nano: int,
                            tolerance: int = 1_000_000,
                            max_age_seconds: int = 180,
                            payload: str | None = None) -> str | None:
        """Найти hash недавней outgoing-транзакции с нашего кошелька на destination
        через toncenter HTTP API. Используется как fallback когда LiteServer
        не вернул hash после wallet.raw_transfer.

        - tolerance: допустимая разница в nano (1M nano = 0.001 TON) на комиссию
        - max_age_seconds: смотрим только tx за последние N секунд

        ВАЖНО (реальный кейс: покупателям уходили "успешно выдано" со ссылкой
        на ЧУЖУЮ, более старую транзакцию): раньше сверка шла ТОЛЬКО по
        destination+сумме. Если два разных заказа с одинаковым пакетом звёзд
        (= одинаковая сумма к тому же адресу Fragment) случались в пределах
        max_age_seconds — функция могла найти и засчитать ЧУЖОЙ перевод как
        подтверждение текущего. Если `payload` передан, кандидат обязан
        совпасть и по ref_id (комментарию перевода), иначе не считается
        найденным — лучше вернуть None, чем отдать покупателю чужой чек.
        `payload` необязателен только ради обратной совместимости старых
        вызовов/тестов — новый код должен передавать его всегда."""
        import time as _time
        seed = self._seed_phrase
        if not seed:
            return None
        addr = self._address_from_seed(seed)
        if not addr:
            return None
        target_ref_id = None
        if payload is not None:
            target_ref_id = _get_ref_id_safe(base64.b64decode(payload))
            if target_ref_id is None:
                logger.warning("find_recent_tx_hash: не смог извлечь ref_id из своего "
                               "payload — сверка невозможна, считаю 'не найдено'")
                return None
        r = _toncenter_request("GET", "https://toncenter.com/api/v2/getTransactions",
                               params={"address": addr, "limit": 10, "archival": "true"},
                               timeout=15, api_key=self._api_key)
        if r is None:
            return None
        try:
            if r.status_code != 200:
                logger.warning("toncenter getTransactions status %s", r.status_code)
                return None
            data = r.json()
            if not data.get("ok"):
                return None
            now_ts = _time.time()
            for tx in data.get("result", []):
                tx_utime = tx.get("utime") or 0
                if now_ts - tx_utime > max_age_seconds:
                    continue
                for out_msg in tx.get("out_msgs", []):
                    out_dest = out_msg.get("destination")
                    out_value = int(out_msg.get("value") or 0)
                    if out_dest != destination or abs(out_value - expected_value_nano) > tolerance:
                        continue
                    if target_ref_id is not None:
                        cand_ref_id = self._ref_id_from_toncenter_out_msg(out_msg)
                        if cand_ref_id != target_ref_id:
                            continue
                    return _tx_hash_to_hex(tx.get("transaction_id", {}).get("hash"))
            return None
        except Exception as exc:
            logger.warning("find_recent_tx_hash failed: %s", exc)
            return None

    @staticmethod
    def _ref_id_from_toncenter_out_msg(out_msg: dict) -> str | None:
        """ref_id из out_msg ответа toncenter v2 getTransactions. ПРОВЕРЕНО на
        живом кошельке (USDT-переводы, 2026-09-26): поле "message" у raw-
        сообщений (jetton) — это base64 ТЕЛА, а НЕ текст → как текст давало
        мусор, сверка ref всегда мимо → ложное «не подтверждён» на реально
        прошедших USDT-переводах. Правильно: декодировать msg_data.body
        (base64 BOC) и извлечь ref (маркер Ref# / хвост после \\n\\n)."""
        msg_data = out_msg.get("msg_data") or {}
        body_b64 = msg_data.get("body")
        if isinstance(body_b64, str) and body_b64:
            try:
                ref = _get_ref_id_safe(base64.b64decode(body_b64))
                if ref is not None:
                    return ref
            except Exception:
                pass
        # запасной путь: нативный TON с текст-комментарием — toncenter отдаёт
        # его в "message" уже раскодированным. Берём, только если похоже на
        # текст (перевод строки или маркер Ref#) — у jetton там base64 тела.
        msg_text = out_msg.get("message")
        if isinstance(msg_text, str) and ("\n" in msg_text or "Ref#" in msg_text):
            return _get_ref_id_safe(msg_text.encode())
        return None

    def _balance_via_http(self, seed: str) -> float | None:
        """Fallback через toncenter.com — стабильнее чем LiteServer.
        Возвращает TON (float) или None."""
        addr = self._address_from_seed(seed)
        if not addr:
            return None
        r = _toncenter_request("GET", "https://toncenter.com/api/v2/getAddressBalance",
                               params={"address": addr}, timeout=10, api_key=self._api_key)
        if r is None:
            return None
        try:
            if r.status_code != 200:
                logger.warning("toncenter status %s for %s", r.status_code, addr)
                return None
            data = r.json()
            if data.get("ok") and "result" in data:
                return int(data["result"]) / 10**9
            logger.warning("toncenter response: %s", data)
            return None
        except Exception as exc:
            logger.warning("toncenter call failed: %s", exc)
            return None

    def get_jetton_balance(self, seed_phrase: str | None = None,
                           jetton_master: str = USDT_JETTON_MASTER,
                           decimals: int = USDT_DECIMALS) -> float | None:
        """Баланс jetton'а (по умолчанию USDT) на кошельке из seed. Через toncenter
        v3 /jetton/wallets (owner=наш адрес, jetton=master) — HTTP, без LiteServer.
        Возвращает float в человеческих единицах, 0.0 если jetton-кошелька ещё нет,
        None при ошибке (тогда движок НЕ выдаёт — не рискуем упасть on-chain)."""
        seed = seed_phrase or self._seed_phrase
        if not seed:
            return None
        owner = self._address_from_seed(seed)
        if not owner:
            return None
        r = _toncenter_request("GET", "https://toncenter.com/api/v3/jetton/wallets",
                               params={"owner_address": owner, "jetton_address": jetton_master,
                                      "limit": 1}, timeout=15, api_key=self._api_key)
        if r is None:
            return None
        try:
            if r.status_code != 200:
                logger.warning("toncenter jetton/wallets status %s", r.status_code)
                return None
            wallets = r.json().get("jetton_wallets") or []
            if not wallets:
                return 0.0            # jetton-кошелёк не создан ⇒ баланса нет
            return int(wallets[0].get("balance") or 0) / 10 ** decimals
        except Exception as exc:  # noqa: BLE001
            logger.warning("get_jetton_balance failed: %s", exc)
            return None

    def get_balance(self, seed_phrase: str | None = None) -> float | None:
        seed = seed_phrase or self._seed_phrase
        if not seed:
            return None

        # Сначала HTTP fallback (быстрее и стабильнее чем LiteServer).
        bal = self._balance_via_http(seed)
        if bal is not None:
            return bal

        # Если HTTP не сработал — pytoniq LiteServer
        if not self._loop or not self._loop.is_running():
            try:
                self.start()
            except Exception:
                return None

        async def _do():
            from pytoniq.contract.wallets.wallet import WalletV4R2
            wallet = await WalletV4R2.from_mnemonic(self._provider, seed)
            bal = await wallet.get_balance()
            return round(int(bal) / 10**9, 9)

        try:
            cf = asyncio.run_coroutine_threadsafe(_do(), self._loop)
            return cf.result(timeout=30)
        except Exception as exc:
            logger.warning("get_balance pytoniq failed: %s", exc)
            return None


# Глобальный синглтон для удобства плагина
_singleton: TonClient | None = None
_singleton_lock = threading.Lock()


def get_ton_client(seed_phrase: str | None = None) -> TonClient:
    """Возвращает синглтон TonClient. Создаёт при первом вызове."""
    global _singleton
    with _singleton_lock:
        if _singleton is None:
            _singleton = TonClient(seed_phrase)
        elif seed_phrase is not None:
            _singleton.set_seed_phrase(seed_phrase)
        return _singleton
