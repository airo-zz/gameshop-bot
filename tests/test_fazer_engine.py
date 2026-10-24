"""
FazerCards: движок выдачи на поддельном API (подменяем FazerAPI._req). Проверяем то,
что стоит денег: количество = N заказов, комбо, Idempotency-Key на каждую «ногу»
(повтор не списывает второй раз), проверка ID ДО покупки, остановка на отказе без
повтора прошедших, поля покупателя по key, гифт-карты (коды) и Steam по логину.
Сценарии — из тестов UchetFP (ggsel_bot/tests/test_fazer_engine.py).
"""

import pytest

from api.services.fazer.client import FazerError, order_price_of, order_state
from api.services.fazer.engine import FazerEngine, collect_values
from api.schemas.cart import OrderItemOut

TOPUP = {"kind": "topup", "category_id": "pubgm", "offer_ids": ["o60"]}


class FakeFazer:
    def __init__(self, fail_on=None, status="completed", valid=True, validate_status=None,
                 fields=None, cards_status="completed", can_refill=True, charged_usd="0.1736"):
        self.calls, self.orders, self.n = [], {}, 0
        self.fail_on, self.status, self.valid, self.validate_status = fail_on, status, valid, validate_status
        self.fields = fields if fields is not None else [
            {"key": "player_id", "label": "Player ID", "type": "text"}]
        self.cards_status, self.can_refill, self.charged_usd = cards_status, can_refill, charged_usd

    def _order(self, idem, extra):
        if idem in self.orders:                       # идемпотентность: тот же заказ
            return {"ok": True, "order": self.orders[idem]}
        self.n += 1
        if self.fail_on == self.n:
            raise FazerError(400, "Insufficient balance", "insufficient_balance")
        order = {"id": f"ord-{self.n}", **extra}
        self.orders[idem] = order
        return {"ok": True, "order": order}

    def __call__(self, method, path, *, params=None, body=None, idem=""):
        self.calls.append((method, path, body, idem))
        if path == "/topups/offers":
            return {"ok": True, "offers": [{"offer_id": "o60", "name": "60 UC", "price_usd": "0.85"},
                                           {"offer_id": "o325", "name": "325 UC", "price_usd": "4.10"}],
                    "fields": self.fields}
        if path == "/topups/validate-id":
            if self.validate_status:
                raise FazerError(self.validate_status, "cannot confirm")
            return {"ok": True, "valid": self.valid, "player_name": "Hero" if self.valid else None}
        if path == "/topups/order":
            return self._order(idem, {"status": self.status})
        if path == "/giftcards/order":
            n = body["quantity"]
            return self._order(idem, {"status": self.cards_status, "total_usd": "1.5",
                                      "cards": [f"CODE-{body['card_id']}-{i}" for i in range(n)]})
        if path == "/steam-topup/check-login":
            return {"ok": True, "can_refill": self.can_refill}
        if path == "/steam-topup/order":
            return self._order(idem, {"status": "completed", "chargedUsd": self.charged_usd})
        if path.startswith("/orders/"):
            return {"ok": True, "order": {"id": path.split("/")[-1], "status": "completed"}}
        raise AssertionError(path)


def engine(fake) -> FazerEngine:
    e = FazerEngine("fc_test")
    e.api._req = fake
    return e


def topup_orders(fake):
    return [c for c in fake.calls if c[1] == "/topups/order"]


def values(**kw):
    return collect_values({}, kw)


# ── пополнение по ID ─────────────────────────────────────────────────────────


def test_quantity_and_combo_make_n_orders_with_own_idempotency_keys():
    fake = FakeFazer()
    res = engine(fake).deliver({**TOPUP, "offer_ids": ["o325", "o60"]}, values(player_id="5123"), 2, "rd-X-0")
    assert res.ok, res.detail
    assert [o[2]["offer_id"] for o in topup_orders(fake)] == ["o325", "o60", "o325", "o60"]
    assert [o[3] for o in topup_orders(fake)] == [f"rd-X-0-{i}" for i in range(4)]
    assert all(o[2]["fields"] == {"player_id": "5123"} for o in topup_orders(fake))
    assert res.cost_usd == pytest.approx((4.10 + 0.85) * 2)


def test_buyer_field_from_order_checkout_snapshot():
    order_input = {"cat1": {"game_name": "PUBG", "fields": [{"key": "player_id", "label": "ID", "value": " 777 "}]}}
    fake = FakeFazer()
    res = engine(fake).deliver(TOPUP, collect_values(order_input, {}), 1, "rd-X-0")
    assert res.ok and topup_orders(fake)[0][2]["fields"] == {"player_id": "777"}


def test_item_field_overrides_order_field():
    order_input = {"c": {"fields": [{"key": "player_id", "label": "ID", "value": "old"}]}}
    res_values = collect_values(order_input, {"player_id": "fixed"})
    fake = FakeFazer()
    engine(fake).deliver(TOPUP, res_values, 1, "rd-X-1")
    assert topup_orders(fake)[0][2]["fields"] == {"player_id": "fixed"}


def test_missing_required_field_buys_nothing():
    fake = FakeFazer()
    res = engine(fake).deliver(TOPUP, values(), 1, "rd-X-0")
    assert not res.ok and "не хватает данных" in res.buyer_message and topup_orders(fake) == []


def test_select_field_maps_label_to_value():
    fake = FakeFazer(fields=[{"key": "player_id", "label": "ID", "type": "text"},
                             {"key": "server", "label": "Server", "type": "select",
                              "options": [{"value": "eu1", "label": "Europe"}, {"value": "as1", "label": "Asia"}]}])
    res = engine(fake).deliver(TOPUP, values(player_id="1", server="Europe"), 1, "rd-X-0")
    assert res.ok and topup_orders(fake)[0][2]["fields"] == {"player_id": "1", "server": "eu1"}


def test_invalid_player_id_buys_nothing():
    fake = FakeFazer(valid=False)
    res = engine(fake).deliver({**TOPUP, "validate": True}, values(player_id="1"), 1, "rd-X-0")
    assert not res.ok and "не найден" in res.buyer_message and topup_orders(fake) == []


def test_validate_422_buys_nothing_but_5xx_proceeds():
    fake = FakeFazer(validate_status=422)
    res = engine(fake).deliver({**TOPUP, "validate": True}, values(player_id="1"), 1, "rd-X-0")
    assert not res.ok and topup_orders(fake) == []
    fake = FakeFazer(validate_status=503)
    res = engine(fake).deliver({**TOPUP, "validate": True}, values(player_id="1"), 1, "rd-X-0")
    assert res.ok and len(topup_orders(fake)) == 1


def test_stop_on_failed_leg_reports_partial_and_balance():
    fake = FakeFazer(fail_on=2)
    res = engine(fake).deliver({**TOPUP, "offer_ids": ["o325", "o60"]}, values(player_id="1"), 1, "rd-X-0")
    assert not res.ok and "часть" in res.buyer_message
    assert "ЧАСТИЧНО 1/2" in res.detail and "НЕ ХВАТАЕТ БАЛАНСА" in res.detail
    assert [o["id"] for o in res.orders] == ["ord-1"]   # уже купленное сохраняется для досмотра


def test_repeat_with_same_attempt_does_not_double_charge():
    fake = FakeFazer()
    e = engine(fake)
    e.deliver({**TOPUP, "offer_ids": ["o60", "o60"]}, values(player_id="1"), 1, "rd-X-0")
    e.deliver({**TOPUP, "offer_ids": ["o60", "o60"]}, values(player_id="1"), 1, "rd-X-0")
    assert fake.n == 2


def test_new_attempt_buys_again():
    fake = FakeFazer()
    e = engine(fake)
    e.deliver(TOPUP, values(player_id="1"), 1, "rd-X-0")
    e.deliver(TOPUP, values(player_id="1"), 1, "rd-X-1")   # ручная перевыдача
    assert fake.n == 2


def test_refunded_leg_is_failure():
    fake = FakeFazer(status="refunded")
    res = engine(fake).deliver(TOPUP, values(player_id="1"), 1, "rd-X-0")
    assert not res.ok and "вернули" in res.detail


def test_too_many_legs_goes_manual():
    fake = FakeFazer()
    res = engine(fake).deliver(TOPUP, values(player_id="1"), 31, "rd-X-0")
    assert not res.ok and topup_orders(fake) == []


def test_unlinked_product_buys_nothing():
    fake = FakeFazer()
    res = engine(fake).deliver({"kind": "topup"}, values(player_id="1"), 1, "rd-X-0")
    assert not res.ok and fake.calls == []


# ── гифт-карты ───────────────────────────────────────────────────────────────


def test_giftcard_codes_quantity_and_combo():
    fake = FakeFazer()
    m = {"kind": "giftcard", "category_id": "valorant_tr", "card_ids": ["c1", "c2", "c1"]}
    res = engine(fake).deliver(m, values(), 2, "rd-G-0")
    assert res.ok, res.detail
    gc = [c for c in fake.calls if c[1] == "/giftcards/order"]
    assert [(c[2]["card_id"], c[2]["quantity"]) for c in gc] == [("c1", 4), ("c2", 2)]
    assert [c[3] for c in gc] == ["rd-G-0-gc-0", "rd-G-0-gc-1"]
    assert len(res.codes) == 6 and "CODE-c1-0" in res.buyer_message


def test_giftcard_partial_keeps_received_codes():
    fake = FakeFazer(fail_on=2)
    m = {"kind": "giftcard", "category_id": "x", "card_ids": ["c1", "c2"]}
    res = engine(fake).deliver(m, values(), 1, "rd-G-0")
    assert not res.ok and res.codes == ["CODE-c1-0"] and "CODE-c1-0" in res.buyer_message


# ── Steam по логину ─────────────────────────────────────────────────────────


def test_steam_amount_from_quantity_and_cost_from_charged_usd():
    fake = FakeFazer(charged_usd="4.61")
    res = engine(fake).deliver({"kind": "steam_topup", "currency": "USD"}, values(steam_login="my_login"), 5, "rd-S-0")
    assert res.ok, res.detail
    order = [c for c in fake.calls if c[1] == "/steam-topup/order"][0]
    assert order[2] == {"steamLogin": "my_login", "currency": "USD", "amount": "5.0"}
    assert order[3] == "rd-S-0-steam" and res.cost_usd == pytest.approx(4.61)


def test_steam_bad_login_or_refused_buys_nothing():
    fake = FakeFazer()
    res = engine(fake).deliver({"kind": "steam_topup"}, values(steam_login="bad login!"), 5, "rd-S-0")
    assert not res.ok and fake.n == 0
    fake = FakeFazer(can_refill=False)
    res = engine(fake).deliver({"kind": "steam_topup"}, values(steam_login="good_login"), 5, "rd-S-0")
    assert not res.ok and fake.n == 0


# ── мелочи ───────────────────────────────────────────────────────────────────


def test_order_state_and_price_words():
    assert order_state({"status": "COMPLETED"}) == "ok"
    assert order_state({"state": "refund_done"}) == "fail"
    assert order_state({"status": "processing"}) == "pending"
    assert order_price_of({"chargedUsd": "0.17"}) == pytest.approx(0.17)


def test_public_order_item_hides_supplier_details():
    import uuid
    item = OrderItemOut(
        id=uuid.uuid4(), product_id=uuid.uuid4(), product_name="x", quantity=1, unit_price=1, total_price=1,
        input_data={}, delivered_at=None,
        delivery_data={"keys": ["A"], "message": "ok", "fazer": {"cost_usd": 1.2, "orders": [{"id": "o"}]},
                       "fragment": {"cost": 3}},
    )
    assert item.delivery_data == {"keys": ["A"], "message": "ok"}


# ── сервис: поля и признак привязки ─────────────────────────────────────────


def test_fields_from_fazer_keep_keys_and_select_labels():
    from api.services.fazer_service import fields_from_fazer
    out = fields_from_fazer([
        {"key": "player_id", "label": "Player ID", "type": "text"},
        {"key": "server", "label": "Server", "type": "select", "options": [{"value": "eu1", "label": "Europe"}]},
        {"label": "без ключа"},
    ])
    assert out == [
        {"key": "player_id", "label": "Player ID", "required": True, "type": "text"},
        {"key": "server", "label": "Server", "required": True, "type": "select", "options": ["Europe"]},
    ]


def test_is_fazer_product_requires_keyless_auto():
    from types import SimpleNamespace
    from api.services.fazer_service import is_fazer_product
    linked = {"fazer": {"kind": "topup"}, "auto_source": "external"}
    assert is_fazer_product(SimpleNamespace(meta=linked, delivery_type=SimpleNamespace(value="auto")))
    assert not is_fazer_product(SimpleNamespace(meta=linked, delivery_type=SimpleNamespace(value="manual")))
    assert not is_fazer_product(SimpleNamespace(meta={"fazer": {}}, delivery_type=SimpleNamespace(value="auto")))
    assert not is_fazer_product(None)
