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
import threading
import time
from typing import TYPE_CHECKING

logger = logging.getLogger("FPV.ton")

# USDT-jetton (Tether) master на TON mainnet. Баланс USDT = баланс jetton-кошелька,
# производного от нашего кошелька + этого мастера. USDT = 6 знаков после запятой.
USDT_JETTON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"
USDT_DECIMALS = 6

if TYPE_CHECKING:
    pass


def _get_ref_id(payload: bytes) -> str:
    return payload.split(b"\n\n")[-1].decode()


class TonClient:
    """Синхронный фасад над pytoniq-asyncio. Запускает event-loop в Thread."""

    def __init__(self, seed_phrase: str | None = None, trust_level: int = 1) -> None:
        self._seed_phrase = seed_phrase or ""
        self._trust_level = trust_level
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

        wallet = await WalletV4R2.from_mnemonic(self._provider, seed_phrase)
        old_seqno = await self._get_seqno(wallet)

        wallet_messages = []
        for destination, nano_amount, payload in transfers:
            wallet_messages.append(
                WalletV4R2.create_wallet_internal_message(
                    destination=Address(destination),
                    value=nano_amount,
                    # ВАЖНО: тело = Cell (у него есть level_mask), а НЕ Builder.
                    # Builder().one_from_boc возвращает Builder → pytoniq падает
                    # 'Builder' object has no attribute 'level_mask' на jetton-payload
                    # с ref-ячейкой (USDT). Cell.one_from_boc даёт правильную ячейку.
                    body=Cell.one_from_boc(payload),
                )
            )

        await wallet.raw_transfer(msgs=wallet_messages)

        # ждём пока seqno изменится — значит транзакция в цепочке
        new_seqno = await self._get_seqno(wallet)
        for _ in range(60):  # макс 30 секунд
            if new_seqno != old_seqno:
                break
            await asyncio.sleep(0.5)
            new_seqno = await self._get_seqno(wallet)

        # ищем tx_hash по ref_id в последних 30 транзакциях
        last_payload = transfers[-1][2]
        target_ref_id = _get_ref_id(base64.b64decode(last_payload))
        try:
            transactions = await self._get_transactions(wallet, limit=30)
            for tx in transactions:
                try:
                    bytes_payload = tx.in_msg.body.to_boc()
                    if _get_ref_id(bytes_payload) == target_ref_id:
                        return tx.in_msg.serialize().hash.hex()
                except Exception:
                    continue
        except Exception as exc:
            logger.warning("Не удалось получить hash транзакции: %s", exc)
        return None

    async def _get_seqno(self, wallet) -> int:
        last_exc = None
        for _ in range(5):
            try:
                return await wallet.get_seqno()
            except Exception as exc:
                last_exc = exc
                await asyncio.sleep(0.5)
        raise last_exc if last_exc else RuntimeError("get_seqno failed")

    async def _get_transactions(self, wallet, limit: int = 30):
        last_exc = None
        for _ in range(5):
            try:
                return await self._provider.get_transactions(wallet.address, limit)
            except Exception as exc:
                last_exc = exc
                await asyncio.sleep(0.5)
        raise last_exc if last_exc else RuntimeError("get_transactions failed")

    # ── Публичный синхронный API ─────────────────────────────────────────────

    def transfer(self, destination: str, nano_amount: int, payload: str,
                 seed_phrase: str | None = None) -> tuple[bool, str, str | None]:
        """Синхронно отправить TON. Возвращает (success, message, tx_hash)."""
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
            # Если pytoniq не нашёл hash (LiteServer crashes) — пробуем найти
            # его через toncenter HTTP. Ждём ~7 сек чтобы tx появилась в индексе.
            if not tx_hash:
                import time as _t
                _t.sleep(7)
                tx_hash = self.find_recent_tx_hash(destination, int(nano_amount))
            return True, "ok", tx_hash
        except Exception as exc:
            return False, str(exc), None

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
                            max_age_seconds: int = 180) -> str | None:
        """Найти hash недавней outgoing-транзакции с нашего кошелька на destination
        через toncenter HTTP API. Используется как fallback когда LiteServer
        не вернул hash после wallet.raw_transfer.

        - tolerance: допустимая разница в nano (1M nano = 0.001 TON) на комиссию
        - max_age_seconds: смотрим только tx за последние N секунд
        """
        import requests, time as _time
        seed = self._seed_phrase
        if not seed:
            return None
        addr = self._address_from_seed(seed)
        if not addr:
            return None
        try:
            r = requests.get(
                "https://toncenter.com/api/v2/getTransactions",
                params={"address": addr, "limit": 10, "archival": "true"},
                timeout=15,
            )
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
                    if out_dest == destination and abs(out_value - expected_value_nano) <= tolerance:
                        return tx.get("transaction_id", {}).get("hash")
            return None
        except Exception as exc:
            logger.warning("find_recent_tx_hash failed: %s", exc)
            return None

    def _balance_via_http(self, seed: str) -> float | None:
        """Fallback через toncenter.com — стабильнее чем LiteServer.
        Возвращает TON (float) или None."""
        import requests
        addr = self._address_from_seed(seed)
        if not addr:
            return None
        try:
            r = requests.get(
                "https://toncenter.com/api/v2/getAddressBalance",
                params={"address": addr}, timeout=10,
            )
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
        import requests
        seed = seed_phrase or self._seed_phrase
        if not seed:
            return None
        owner = self._address_from_seed(seed)
        if not owner:
            return None
        try:
            r = requests.get(
                "https://toncenter.com/api/v3/jetton/wallets",
                params={"owner_address": owner, "jetton_address": jetton_master, "limit": 1},
                timeout=15,
            )
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
