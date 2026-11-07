"""
api/services/buyer_fields.py
─────────────────────────────────────────────────────────────────────────────
Данные покупателя заказа одним списком — для чата хаба, уведомления сотрудникам
и админки (раньше каждый собирал по-своему: бот сотрудников не видел полей
уровня игры, а названия полей брал только у товара → «vvedite_username…»).

  buyer_fields(order) → [{"label", "value", "secret"}]

Источники: order.input_data (поля игры/раздела на чекауте) и item.input_data
(поля товара, @username для звёзд и т.п.). Подпись поля — из input_fields товара,
затем раздела, затем игры; пустые значения пропускаем. Для подписей нужны
загруженные item.product.category.game (см. LOAD_OPTIONS).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from sqlalchemy.orm import selectinload

from shared.models import Order, OrderItem
from shared.models.catalog import Category, Product

LOAD_OPTIONS = (
    selectinload(Order.items).selectinload(OrderItem.product)
    .selectinload(Product.category).selectinload(Category.game),
)


def _is_secret(label: str, key: str, ftype: str = "") -> bool:
    return ftype == "password" or "парол" in label.lower() or "pass" in key.lower()


def _labels(item: OrderItem) -> dict[str, dict]:
    """key → описание поля: товар, затем раздел, затем игра (первое найденное)."""
    out: dict[str, dict] = {}
    product = item.product
    cat = getattr(product, "category", None) if product else None
    game = getattr(cat, "game", None) if cat else None
    for src in (product, cat, game):
        fields = getattr(src, "input_fields", None) if src is not None else None
        for f in fields if isinstance(fields, list) else []:
            if isinstance(f, dict) and f.get("key") and f["key"] not in out:
                out[f["key"]] = f
    return out


def buyer_fields(order: Order) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(label: str, value, key: str = "", ftype: str = "") -> None:
        if value in (None, "") or isinstance(value, (dict, list)):
            return
        value = str(value).strip()
        if not value or (label, value) in seen:
            return
        seen.add((label, value))
        rows.append({"label": label, "value": value, "secret": _is_secret(label, key, ftype)})

    for src in (order.input_data or {}).values():
        if not isinstance(src, dict):
            continue
        for f in src.get("fields") or []:
            if isinstance(f, dict):
                key = str(f.get("key") or "")
                add(str(f.get("label") or key), f.get("value"), key, str(f.get("type") or ""))
    for item in order.items:
        labels = _labels(item)
        for k, v in (item.input_data or {}).items():
            f = labels.get(k) or {}
            add(str(f.get("label") or k), v, str(k), str(f.get("type") or ""))
    return rows
