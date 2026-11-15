"""
Тесты базовой логики TON-переводов (transfer/find_recent_tx_hash) после
возврата к первой рабочей версии + два фикса поверх нее. Реальные pytoniq/сеть
не нужны — мокаются напрямую на инстансе TonClient, как и остальные движки в
этом каталоге мокают HTTP (см. test_moogold_engine.py).

Ключевое, что тут проверяется:
1. transfer() требует ПОДТВЕРЖДЁННЫЙ хеш для success (решение владельца,
   2026-09-27) — но подтверждение это только ТЕРПЕЛИВОЕ ОЖИДАНИЕ/переспрос
   сети (find_recent_tx_hash в цикле), а НЕ повторная отправка: raw_transfer
   вызывается ровно один раз при любом исходе. Не нашли хеш за отведённое
   время — честный неуспех, а не ложное "отправлено" без ссылки.
2. find_recent_tx_hash(payload=...) сверяет ref_id из комментария, не только
   destination+сумму — реальный кейс: два разных заказа с одинаковым пакетом
   звёзд (= одинаковая сумма к тому же адресу Fragment) в пределах
   max_age_seconds, без этой сверки могли подтвердить текущий заказ ЧУЖИМ,
   более старым переводом — покупателю уходил чек с чужой сделкой.
3. ref_id для USDT (jetton) лежит в БИНАРНОЙ ячейке маркером "Ref#<токен>", а
   не текст-комментарием после "\\n\\n" — реальный кейс (2026-09-26): без
   этого КАЖДЫЙ USDT-перевод, где pytoniq промахнулся с хешем, ложно уходил в
   "не подтверждён", хотя перевод реально прошёл.
"""
import asyncio
import base64
import requests
from api.services.fragment import ton_client as tc


def make_client():
    return tc.TonClient(seed_phrase="test seed phrase")


def _patch_send_ok(monkeypatch, client, tx_hash_from_pytoniq=None):
    """Мокает саму отправку (run_coroutine_threadsafe) так, будто raw_transfer
    прошёл без исключения — pytoniq-путь нашёл хеш сразу (tx_hash_from_pytoniq)
    или нет (None, тогда идёт по пути ожидания подтверждения)."""
    class FakeLoopRunning:
        def is_running(self):
            return True
    client._loop = FakeLoopRunning()

    class FakeFuture:
        def result(self, timeout=None):
            return tx_hash_from_pytoniq

    def fake_run_coroutine_threadsafe(coro, loop):
        coro.close()  # не запускаем реально — иначе pytest ругается на unawaited coroutine
        return FakeFuture()

    monkeypatch.setattr(tc.asyncio, "run_coroutine_threadsafe", fake_run_coroutine_threadsafe)


def _fake_clock(monkeypatch, start: float = 1_000.0):
    """Подменяет time.time()+time.sleep() общим счётчиком: sleep(n) двигает
    часы вперёд вместо реального ожидания — иначе цикл ожидания в
    _wait_for_confirmation крутится по НАСТОящим часам (sleep замокан в
    no-op, но time.time() всё ещё реальный) и тест реально ждёт весь
    confirm_timeout секунд вместо мгновенного прогона."""
    state = {"now": start}

    def fake_time():
        return state["now"]

    def fake_sleep(seconds):
        state["now"] += seconds

    monkeypatch.setattr(tc.time, "time", fake_time)
    monkeypatch.setattr(tc.time, "sleep", fake_sleep)
    return state


def test_transfer_fails_honestly_when_confirmation_never_found(monkeypatch):
    """Решение владельца (2026-09-27): лучше редкое честное "не удалось" после
    долгого ожидания, чем ложное "успешно отправлено" без ссылки на транзакцию.
    Отправка (raw_transfer) при этом происходит РОВНО ОДИН РАЗ — это не ретрай."""
    client = make_client()
    _patch_send_ok(monkeypatch, client, tx_hash_from_pytoniq=None)
    _fake_clock(monkeypatch)
    calls = {"find": 0}

    def fake_find(*a, **kw):
        calls["find"] += 1
        return None  # так и не нашли — ни разу за всё ожидание

    monkeypatch.setattr(client, "find_recent_tx_hash", fake_find)

    ok, msg, tx = client.transfer("EQdest", 1_000_000, "payload==", seed_phrase="seed",
                                  confirm_timeout=30.0, confirm_poll_interval=10.0)

    assert ok is False, "непойманный хеш теперь честный неуспех, а не ложный успех"
    assert tx is None
    assert "не подтверждён" in msg
    assert calls["find"] >= 2, "должны были переспросить сеть несколько раз, не один"


def test_transfer_succeeds_with_hash_found_during_patient_wait(monkeypatch):
    """Хеш не нашёлся сразу (pytoniq), но нашёлся через пару переспросов
    toncenter — это успех со ссылкой, без повторной отправки денег."""
    client = make_client()
    _patch_send_ok(monkeypatch, client, tx_hash_from_pytoniq=None)
    _fake_clock(monkeypatch)
    calls = {"find": 0}

    def fake_find(*a, **kw):
        calls["find"] += 1
        return "realhash123" if calls["find"] >= 3 else None

    monkeypatch.setattr(client, "find_recent_tx_hash", fake_find)

    ok, msg, tx = client.transfer("EQdest", 1_000_000, "payload==", seed_phrase="seed",
                                  confirm_timeout=60.0, confirm_poll_interval=10.0)

    assert ok is True
    assert tx == "realhash123"
    assert calls["find"] == 3, "должен был остановиться сразу, как нашёл хеш"


def test_transfer_success_immediately_when_pytoniq_finds_hash(monkeypatch):
    """Штатный путь: pytoniq сам вернул хеш сразу — ожидание/переспрос сети
    вообще не нужны."""
    client = make_client()
    _patch_send_ok(monkeypatch, client, tx_hash_from_pytoniq="fromPytoniq")

    def fail_if_called(*a, **kw):
        raise AssertionError("find_recent_tx_hash не должен вызываться, хеш уже есть")

    monkeypatch.setattr(client, "find_recent_tx_hash", fail_if_called)

    ok, msg, tx = client.transfer("EQdest", 1_000_000, "payload==", seed_phrase="seed")

    assert ok is True
    assert tx == "fromPytoniq"


def test_get_ref_id_extracts_jetton_marker_not_binary_tail():
    """USDT (jetton): ref лежит в бинарной ячейке маркером Ref#<токен>, а не
    после '\\n\\n' — строгий split падал на бинарном хвосте (реальный баг).
    Маркер матчится по [A-Za-z0-9]+ (как на живом кошельке, 2026-09-26) — тот
    же regex на обеих сторонах сравнения (наш payload и кандидат toncenter),
    поэтому усечение на не-алфанумерике не мешает сверке ref_id."""
    jetton_payload = b"\x00\x01\xffsome binary garbage\x00Ref#0GXHHoHXRt\x00\xaa"
    assert tc._get_ref_id(jetton_payload) == "Ref#0GXHHoHXRt"


def test_get_ref_id_keeps_plain_ton_comment_behaviour():
    """Нативный TON (текст-комментарий) — поведение не поменялось: хвост
    после '\\n\\n'."""
    assert tc._get_ref_id(b"@buyer\n\norder-NEW-123") == "order-NEW-123"


def _payload_b64(comment: str) -> str:
    """Payload в том же виде, что реально шлют движки: base64 от сырых байт
    комментария, где ref_id — последняя часть после '\\n\\n' (см. _get_ref_id)."""
    return base64.b64encode(comment.encode()).decode()


def _fake_toncenter_response(candidates: list[dict]):
    """candidates: [{"dest": str, "value": int, "utime": int, "message": str|None,
    "body_b64": str|None}] — как реально выглядит out_msgs[] у toncenter v2."""
    out_msgs = []
    for c in candidates:
        msg = {"destination": c["dest"], "value": c["value"]}
        if c.get("message") is not None:
            msg["message"] = c["message"]
        if c.get("body_b64") is not None:
            msg["msg_data"] = {"body": c["body_b64"]}
        out_msgs.append(msg)
    return {
        "ok": True,
        "result": [{
            "utime": candidates[0]["utime"] if candidates else 0,
            "transaction_id": {"hash": candidates[0].get("hash", "matched_hash")},
            "out_msgs": out_msgs,
        }] if candidates else [],
    }


def _client_with_fixed_address():
    client = make_client()
    client._address_from_seed = lambda seed: "EQourwallet"
    return client


def test_find_recent_tx_hash_rejects_same_amount_wrong_ref_id(monkeypatch):
    """Реальный баг: транзакция похожа по адресу+сумме, но это ЧУЖОЙ заказ
    (другой ref_id в комментарии) — не должна засчитаться."""
    client = _client_with_fixed_address()
    now = 1_000_000.0
    monkeypatch.setattr(tc.time, "time", lambda: now)

    resp = _fake_toncenter_response([{
        "dest": "EQfragment", "value": 1_000_000_000, "utime": now - 10,
        "message": "@other_user\n\norder-OLD-999", "hash": "wrong_hash",
    }])

    class FakeResp:
        status_code = 200
        def json(self):
            return resp
    monkeypatch.setattr(requests, "get", lambda *a, **kw: FakeResp())

    found = client.find_recent_tx_hash(
        "EQfragment", 1_000_000_000, payload=_payload_b64("@buyer\n\norder-NEW-123"))

    assert found is None, "не должен подтверждать заказ чужой транзакцией той же суммы"


def test_find_recent_tx_hash_finds_correct_ref_id_among_same_amount_candidates(monkeypatch):
    """Среди нескольких транзакций той же суммы на тот же адрес — находит
    именно ту, чей комментарий совпадает с нашим ref_id, не первую попавшуюся."""
    client = _client_with_fixed_address()
    now = 1_000_000.0
    monkeypatch.setattr(tc.time, "time", lambda: now)

    resp = {
        "ok": True,
        "result": [
            {
                "utime": now - 5,
                "transaction_id": {"hash": "wrong_hash_1"},
                "out_msgs": [{"destination": "EQfragment", "value": 1_000_000_000,
                             "message": "@other1\n\norder-OLD-1"}],
            },
            {
                "utime": now - 8,
                "transaction_id": {"hash": "CORRECT_HASH"},
                "out_msgs": [{"destination": "EQfragment", "value": 1_000_000_000,
                             "message": "@buyer\n\norder-NEW-123"}],
            },
        ],
    }

    class FakeResp:
        status_code = 200
        def json(self):
            return resp
    monkeypatch.setattr(requests, "get", lambda *a, **kw: FakeResp())

    found = client.find_recent_tx_hash(
        "EQfragment", 1_000_000_000, payload=_payload_b64("@buyer\n\norder-NEW-123"))

    assert found == "CORRECT_HASH"


def test_find_recent_tx_hash_matches_via_raw_boc_body_when_no_message_field(monkeypatch):
    """toncenter не всегда отдаёт удобное декодированное поле "message" —
    сверка должна уметь достать ref_id и из сырого msg_data.body (base64 BOC),
    как это уже делает _do_transfer() с pytoniq-ответом."""
    client = _client_with_fixed_address()
    now = 1_000_000.0
    monkeypatch.setattr(tc.time, "time", lambda: now)

    comment = "@buyer\n\norder-NEW-123"
    resp = _fake_toncenter_response([{
        "dest": "EQfragment", "value": 1_000_000_000, "utime": now - 10,
        "body_b64": base64.b64encode(comment.encode()).decode(), "hash": "CORRECT_HASH",
    }])

    class FakeResp:
        status_code = 200
        def json(self):
            return resp
    monkeypatch.setattr(requests, "get", lambda *a, **kw: FakeResp())

    found = client.find_recent_tx_hash(
        "EQfragment", 1_000_000_000, payload=_payload_b64(comment))

    assert found == "CORRECT_HASH"


def test_find_recent_tx_hash_without_payload_keeps_old_amount_only_behaviour(monkeypatch):
    """Обратная совместимость: без payload (старые вызовы/тесты) сверка идёт
    только по destination+сумме, как раньше."""
    client = _client_with_fixed_address()
    now = 1_000_000.0
    monkeypatch.setattr(tc.time, "time", lambda: now)

    resp = _fake_toncenter_response([{
        "dest": "EQfragment", "value": 1_000_000_000, "utime": now - 10,
        "message": "не важно что тут", "hash": "any_hash",
    }])

    class FakeResp:
        status_code = 200
        def json(self):
            return resp
    monkeypatch.setattr(requests, "get", lambda *a, **kw: FakeResp())

    found = client.find_recent_tx_hash("EQfragment", 1_000_000_000)  # payload не передан

    assert found == "any_hash"


# ------------------------------------------------ отправка через toncenter

def _real_seed_for_signing_only() -> str:
    """Валидная (проходит mnemonic_is_valid), но НИКОГДА не связанная с
    реальными деньгами seed-фраза — сгенерирована один раз для этих тестов.
    Используется только чтобы реально подписать перевод (как в проде), сеть
    в тестах замокана — деньги никуда не уходят."""
    return ("permit force drift black home parent know talent frog say outer "
            "knock speed carry chase alley truck knee marble layer hint nurse "
            "cigar spray")


def _make_wallet_messages(destination: str = None):
    from pytoniq.contract.wallets.wallet import WalletV4R2, Address
    from pytoniq_core import Cell, Builder
    dest = destination or "EQArzVDlPPBzLeZllimzUR3bkov-nxI0vgcDPdw78JSylHNk"
    body_cell = Builder().store_uint(0, 32).store_snake_string("order-TEST-1").end_cell()
    payload_b64 = base64.b64encode(body_cell.to_boc()).decode()
    return [WalletV4R2.create_wallet_internal_message(
        destination=Address(dest), value=1_000_000, body=Cell.one_from_boc(payload_b64))]


def test_send_via_toncenter_builds_real_signed_boc_and_sends_it(monkeypatch):
    """Полный путь с НАСТОЯЩЕЙ подписью (реальная валидная seed-фраза, никогда
    не связанная с деньгами) — только seqno и sendBoc замокан. Проверяет, что
    подпись/сборка внешнего сообщения не падает и реально уходит один запрос
    на sendBoc с непустым boc."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())
    calls = {"seqno": 0, "send": 0}

    def fake_seqno(address):
        calls["seqno"] += 1
        assert address  # реальный адрес, вычисленный из seed
        return 5

    sent_boc = {}

    def fake_send(boc_b64):
        calls["send"] += 1
        sent_boc["value"] = boc_b64
        return True, "ok"

    monkeypatch.setattr(client, "_get_seqno_via_toncenter", fake_seqno)
    monkeypatch.setattr(client, "_send_boc_via_toncenter", fake_send)

    ok, reason = asyncio.run(client._send_via_toncenter(
        client._seed_phrase, _make_wallet_messages()))

    assert ok is True
    assert reason == "ok"
    assert calls["seqno"] == 1
    assert calls["send"] == 1
    assert sent_boc["value"], "boc не должен быть пустым"
    # boc декодируется как валидный base64 непустой длины
    assert len(base64.b64decode(sent_boc["value"])) > 20


def test_send_via_toncenter_returns_false_when_seqno_unavailable(monkeypatch):
    """Не смогли получить seqno через toncenter — честно False, sendBoc
    вообще не вызывается (деньги не тронуты)."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())
    calls = {"send": 0}

    monkeypatch.setattr(client, "_get_seqno_via_toncenter", lambda address: None)
    monkeypatch.setattr(client, "_send_boc_via_toncenter",
                        lambda boc: calls.__setitem__("send", calls["send"] + 1) or (True, "ok"))

    ok, reason = asyncio.run(client._send_via_toncenter(
        client._seed_phrase, _make_wallet_messages()))

    assert ok is False
    assert "seqno" in reason
    assert calls["send"] == 0, "sendBoc не должен вызываться без seqno"


def test_send_via_toncenter_returns_false_when_sendboc_fails(monkeypatch):
    """toncenter отверг перевод (например 'external import fees exceed account
    balance', реальный ответ сети на живом тесте), И seqno кошелька НЕ сдвинулся
    на перепроверке — честный False, деньги не списаны (sendBoc для ЭТОГО
    перевода реально не сработал, это не ложный HTTP 500)."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())
    monkeypatch.setattr(tc.asyncio, "sleep", _fast_async_sleep)

    monkeypatch.setattr(client, "_get_seqno_via_toncenter", lambda address: 0)
    monkeypatch.setattr(client, "_send_boc_via_toncenter",
                        lambda boc: (False, "HTTP 500: external import fees exceed account balance"))

    ok, reason = asyncio.run(client._send_via_toncenter(
        client._seed_phrase, _make_wallet_messages()))

    assert ok is False
    assert "external import fees exceed account balance" in reason


async def _fast_async_sleep(_seconds):
    """asyncio.sleep мок для тестов seqno-перепроверки — не ждём реальные
    SENDBOC_RECOVERY_DELAY_SEC секунды."""
    return None


def test_send_via_toncenter_recovers_when_seqno_advanced_despite_sendboc_error(monkeypatch):
    """Реальный кейс 2026-10-09: sendBoc отвечает HTTP 500 (свой бэкенд
    toncenter упал), но сеть СЕТЬ перевод реально приняла — подтверждено
    вживую на блокчейне (заказ #33424, seqno кошелька сдвинулся). Раньше это
    трактовалось как честный провал ("деньги не списаны, повтор безопасен") —
    на деле повтор был бы ВТОРЫМ платежом за уже доставленный товар. Теперь
    при отказе sendBoc перепроверяем seqno: сдвинулся — считаем успехом."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())
    monkeypatch.setattr(tc.asyncio, "sleep", _fast_async_sleep)

    seqno_calls = {"n": 0}

    def fake_seqno(address):
        seqno_calls["n"] += 1
        return 5 if seqno_calls["n"] == 1 else 6     # сдвинулся 5 → 6 ко второму вызову

    monkeypatch.setattr(client, "_get_seqno_via_toncenter", fake_seqno)
    monkeypatch.setattr(client, "_send_boc_via_toncenter", lambda boc: (False, "HTTP 500: "))

    ok, reason = asyncio.run(client._send_via_toncenter(
        client._seed_phrase, _make_wallet_messages()))

    assert ok is True, reason
    assert reason == "ok"
    assert seqno_calls["n"] == 2, "должны перепроверить seqno именно один раз после отказа"


def test_send_via_toncenter_honest_failure_when_seqno_unchanged_after_error(monkeypatch):
    """Тот же sendBoc-отказ, но seqno НЕ сдвинулся (перевод реально не ушёл) —
    честный False, а не ложный «успех» на любой ошибке подряд."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())
    monkeypatch.setattr(tc.asyncio, "sleep", _fast_async_sleep)

    monkeypatch.setattr(client, "_get_seqno_via_toncenter", lambda address: 5)  # всегда 5 — не сдвинулся
    monkeypatch.setattr(client, "_send_boc_via_toncenter", lambda boc: (False, "HTTP 500: "))

    ok, reason = asyncio.run(client._send_via_toncenter(
        client._seed_phrase, _make_wallet_messages()))

    assert ok is False
    assert "sendBoc отказал" in reason


def test_send_via_toncenter_false_when_keys_cannot_be_derived(monkeypatch):
    """seed вообще нерабочий (пустой/битый) — честный False до любых сетевых
    вызовов."""
    client = make_client()
    monkeypatch.setattr(client, "_address_from_seed", lambda seed: None)

    calls = {"seqno": 0}
    monkeypatch.setattr(client, "_get_seqno_via_toncenter",
                        lambda address: calls.__setitem__("seqno", calls["seqno"] + 1) or 5)

    ok, reason = asyncio.run(client._send_via_toncenter("bad seed", _make_wallet_messages()))

    assert ok is False
    assert "ключ" in reason
    assert calls["seqno"] == 0, "не должны даже пытаться узнать seqno без адреса"


def _payload_for_do_transfer() -> str:
    from pytoniq_core import Builder
    body_cell = Builder().store_uint(0, 32).store_snake_string("order-1").end_cell()
    return base64.b64encode(body_cell.to_boc()).decode()


def test_do_transfer_returns_none_when_toncenter_succeeds(monkeypatch):
    """Единственный путь отправки — toncenter. Когда он отработал успешно,
    _do_transfer просто возвращает None (хеш найдёт transfer() отдельно, тоже
    через toncenter, см. _wait_for_confirmation) — никакого второго механизма
    отправки в коде вообще не существует, значит и вызывать нечего."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())

    async def fake_send_via_toncenter(seed_phrase, wallet_messages):
        return True, "ok"

    monkeypatch.setattr(client, "_send_via_toncenter", fake_send_via_toncenter)

    tx = asyncio.run(client._do_transfer(
        [("EQArzVDlPPBzLeZllimzUR3bkov-nxI0vgcDPdw78JSylHNk", 1_000_000,
          _payload_for_do_transfer())],
        client._seed_phrase))

    assert tx is None


def test_do_transfer_raises_honestly_when_toncenter_fails_no_second_attempt(monkeypatch):
    """Решение владельца (2026-09-27): убрать резервный путь через узел
    полностью — единственный путь отправки либо срабатывает, либо нет. Если
    toncenter отказал (на любом из шагов внутри _send_via_toncenter — ключи/
    seqno/подпись/sendBoc), _do_transfer честно поднимает исключение, и
    ВТОРОЙ попытки отправки в коде просто не существует (deньги не уходят
    ни через какой другой канал)."""
    client = make_client()
    client.set_seed_phrase(_real_seed_for_signing_only())

    calls = {"send_attempts": 0}

    async def fake_send_via_toncenter(seed_phrase, wallet_messages):
        calls["send_attempts"] += 1
        return False, "sendBoc отказал: HTTP 500: какая-то конкретная причина"

    monkeypatch.setattr(client, "_send_via_toncenter", fake_send_via_toncenter)

    raised_msg = None
    try:
        asyncio.run(client._do_transfer(
            [("EQArzVDlPPBzLeZllimzUR3bkov-nxI0vgcDPdw78JSylHNk", 1_000_000,
              _payload_for_do_transfer())],
            client._seed_phrase))
    except RuntimeError as exc:
        raised_msg = str(exc)

    assert raised_msg is not None, "провал toncenter должен честно всплыть, а не тихо проглотиться"
    assert "какая-то конкретная причина" in raised_msg, \
        "конкретная причина должна долетать наружу, а не общее сообщение на все случаи"
    assert calls["send_attempts"] == 1, "должна была быть ровно одна попытка отправки, без повтора"


# ------------------------------------------------ повтор при 429 (rate limit)

class _FakeResp:
    def __init__(self, status_code, json_data=None, headers=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.headers = headers or {}
        self.text = text

    def json(self):
        return self._json


def test_toncenter_request_retries_on_429_and_succeeds(monkeypatch):
    """Реальный кейс (2026-09-27): публичный toncenter под нагрузкой нескольких
    хабов отвечал 429 ("Ratelimit exceed") на getWalletInformation/sendBoc,
    и заказ падал с первой же попытки. Теперь — несколько попыток подряд."""
    calls = {"n": 0}

    def fake_get(url, params=None, headers=None, timeout=None):
        calls["n"] += 1
        if calls["n"] < 3:
            return _FakeResp(429, {"ok": False, "result": "Ratelimit exceed", "code": 429})
        return _FakeResp(200, {"ok": True, "result": {"seqno": 7, "wallet": True}})

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(tc.time, "sleep", lambda *_: None)

    resp = tc._toncenter_request("GET", "https://toncenter.com/api/v2/getWalletInformation",
                                 params={"address": "EQfoo"})

    assert resp is not None
    assert resp.status_code == 200
    assert calls["n"] == 3, "должно было потребоваться 2 429 подряд и успех с третьей попытки"


def test_toncenter_request_gives_up_after_max_retries_still_429(monkeypatch):
    """Лимит не отпустил за все попытки — возвращаем последний (429-й) ответ,
    вызывающий код (например _get_seqno_via_toncenter) сам увидит статус !=
    200 и честно откажет, без бесконечного ожидания."""
    calls = {"n": 0}

    def fake_get(url, params=None, headers=None, timeout=None):
        calls["n"] += 1
        return _FakeResp(429, {"ok": False, "result": "Ratelimit exceed"})

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(tc.time, "sleep", lambda *_: None)

    resp = tc._toncenter_request("GET", "https://toncenter.com/api/v2/getWalletInformation",
                                 params={"address": "EQfoo"}, max_retries=3)

    assert resp is not None
    assert resp.status_code == 429
    assert calls["n"] == 3


def test_get_seqno_via_toncenter_survives_transient_429(monkeypatch):
    """Сквозная проверка: _get_seqno_via_toncenter (а не только внутренний
    _toncenter_request) реально переживает пару 429 подряд и возвращает
    правильный seqno."""
    client = make_client()
    calls = {"n": 0}

    def fake_get(url, params=None, headers=None, timeout=None):
        calls["n"] += 1
        if calls["n"] < 2:
            return _FakeResp(429, {"ok": False, "result": "Ratelimit exceed"})
        return _FakeResp(200, {"ok": True, "result": {"seqno": 42, "wallet": True}})

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(tc.time, "sleep", lambda *_: None)

    seqno = client._get_seqno_via_toncenter("EQfoo")

    assert seqno == 42
    assert calls["n"] == 2


def test_toncenter_request_sends_api_key_header_when_configured(monkeypatch):
    """api_key (получен через @tonapibot) должен уйти заголовком X-Api-Key —
    без него используется общий публичный лимит toncenter на всех сразу."""
    seen = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        seen["headers"] = headers
        return _FakeResp(200, {"ok": True, "result": {}})

    monkeypatch.setattr(requests, "get", fake_get)

    tc._toncenter_request("GET", "https://toncenter.com/api/v2/getWalletInformation",
                          params={"address": "EQfoo"}, api_key="my-real-key-123")

    assert seen["headers"] == {"X-Api-Key": "my-real-key-123"}


def test_toncenter_request_no_headers_without_api_key(monkeypatch):
    """Без ключа заголовков быть не должно (не подставляем пустую строку)."""
    seen = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        seen["headers"] = headers
        return _FakeResp(200, {"ok": True, "result": {}})

    monkeypatch.setattr(requests, "get", fake_get)

    tc._toncenter_request("GET", "https://toncenter.com/api/v2/getWalletInformation",
                          params={"address": "EQfoo"})

    assert seen["headers"] is None


# ------------------------------------------------ base64 → hex для tonviewer

def test_tx_hash_to_hex_converts_base64_with_slash():
    """Реальный кейс (2026-09-27): toncenter отдаёт хеш в base64, который может
    содержать '/' — в пути URL tonviewer.com это ломает ссылку (404), хотя
    перевод реально прошёл. tonviewer ожидает hex."""
    b64 = "kK6QYF7TMGDLL3Ogq/3tztCHzsuSWUE8G8YB833s8sQ="
    hexed = tc._tx_hash_to_hex(b64)
    assert hexed == "90ae90605ed33060cb2f73a0abfdedced087cecb9259413c1bc601f37decf2c4"
    assert "/" not in hexed


def test_tx_hash_to_hex_passthrough_on_bad_input():
    """Не смогли раскодировать (не наш формат) — отдаём как было, лучше
    может-быть-рабочая ссылка, чем совсем никакой."""
    assert tc._tx_hash_to_hex("not-valid-base64-hash") == "not-valid-base64-hash"
    assert tc._tx_hash_to_hex(None) is None
    assert tc._tx_hash_to_hex("") == ""


def test_find_recent_tx_hash_returns_hex_not_raw_base64(monkeypatch):
    """Сквозная проверка: find_recent_tx_hash (то, что в итоге уходит в
    ссылку покупателю) отдаёт hex, а не сырой base64 от toncenter."""
    client = _client_with_fixed_address()
    now = 1_000_000.0
    monkeypatch.setattr(tc.time, "time", lambda: now)

    b64_hash = "kK6QYF7TMGDLL3Ogq/3tztCHzsuSWUE8G8YB833s8sQ="
    resp = _fake_toncenter_response([{
        "dest": "EQfragment", "value": 1_000_000_000, "utime": now - 10,
        "message": "не важно что тут", "hash": b64_hash,
    }])

    class FakeResp:
        status_code = 200
        def json(self):
            return resp
    monkeypatch.setattr(requests, "get", lambda *a, **kw: FakeResp())

    found = client.find_recent_tx_hash("EQfragment", 1_000_000_000)  # без payload — по сумме

    assert found == "90ae90605ed33060cb2f73a0abfdedced087cecb9259413c1bc601f37decf2c4"
    assert "/" not in found
