"""
api/services/ggsel_import.py
─────────────────────────────────────────────────────────────────────────────
Парсер CSV-выгрузки параметров оффера ggsel (parameters_offer_<id>.csv).

Формат файла (UTF-8 с BOM, разделитель — запятая):
  parameter_id, kind, title_ru, title_en, required, hide_price_modifier,
  splitted_products, variant_id, variant_title_ru, variant_title_en,
  default, impact_variant, price, discount_kind

Логика:
  • Строка с непустым parameter_id открывает новый ПАРАМЕТР.
      - kind ∈ TEXT_KINDS      → поле «Данные от покупателя» (input_field).
      - kind ∈ VARIANT_KINDS   → ГРУППА вариантов → станет категорией.
        Первый вариант группы лежит в той же строке, что и параметр.
  • Строки с пустым parameter_id — продолжение текущей группы (ещё варианты).
  • Каждый вариант (variant_title_ru + price) → отдельный товар (лот).

Возвращает «план» (dict), пригодный и для предпросмотра, и для commit.
Никаких обращений к БД — чистый разбор байтов.
"""

from __future__ import annotations

import csv
import io

# Типы параметров ggsel
TEXT_KINDS = {"text", "textarea", "text_area", "string", "email"}
VARIANT_KINDS = {"check_box", "checkbox", "radio_button", "radio", "select", "list"}

_REQUIRED_COLUMNS = {
    "parameter_id",
    "kind",
    "title_ru",
    "variant_id",
    "variant_title_ru",
    "price",
}

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

MAX_CATEGORY_NAME = 128
MAX_PRODUCT_NAME = 256


def _translit_key(label: str) -> str:
    """Стабильный латинский ключ для input_field из русского названия."""
    out: list[str] = []
    for ch in label.lower():
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif ch.isalnum() and ch.isascii():
            out.append(ch)
        else:
            out.append("_")
    key = "".join(out)
    # схлопываем повторы подчёркиваний и обрезаем края
    while "__" in key:
        key = key.replace("__", "_")
    key = key.strip("_")
    return key[:48] or "field"


def _parse_price(raw: str) -> float:
    raw = (raw or "").strip().replace(" ", "").replace(",", ".")
    if not raw:
        return 0.0
    try:
        return round(float(raw), 2)
    except ValueError:
        return 0.0


def _add_variant(group: dict, row: dict, warnings: list[str]) -> None:
    """
    Добавляет вариант-товар в группу, если строка его содержит.

    price в CSV — это МОДИФИКАТОР к базовой цене оффера (не абсолютная цена).
    impact_variant: increase → +price, decrease → −price. Итоговая цена лота
    считается позже как base_price + price_modifier.
    """
    title = (row.get("variant_title_ru") or "").strip()
    variant_id = (row.get("variant_id") or "").strip()
    if not title or not variant_id:
        return

    price = _parse_price(row.get("price", ""))
    impact = (row.get("impact_variant") or "").strip().lower()
    modifier = -price if impact == "decrease" else price

    group["products"].append(
        {
            "name": title[:MAX_PRODUCT_NAME],
            "price_modifier": modifier,
        }
    )


def parse_ggsel_csv(raw: bytes) -> dict:
    """
    Разбирает байты CSV-выгрузки оффера ggsel в план импорта.

    Raises:
        ValueError — если файл не читается как ожидаемый CSV.
    """
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        # ggsel отдаёт UTF-8, но подстрахуемся от cp1251
        try:
            text = raw.decode("cp1251")
        except UnicodeDecodeError as exc:
            raise ValueError("Не удалось прочитать файл: неизвестная кодировка") from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValueError("Файл пуст")

    columns = {(c or "").strip() for c in reader.fieldnames}
    missing = _REQUIRED_COLUMNS - columns
    if missing:
        raise ValueError(
            "Файл не похож на выгрузку ggsel. Отсутствуют колонки: "
            + ", ".join(sorted(missing))
        )

    categories: list[dict] = []
    input_fields: list[dict] = []
    warnings: list[str] = []
    seen_keys: set[str] = set()

    current_group: dict | None = None

    for row in reader:
        parameter_id = (row.get("parameter_id") or "").strip()
        kind = (row.get("kind") or "").strip().lower()

        if parameter_id:
            # Новый параметр — закрываем предыдущую группу
            current_group = None

            if kind in TEXT_KINDS:
                label = (row.get("title_ru") or "").strip()
                if label:
                    key = _translit_key(label)
                    # гарантируем уникальность ключа
                    base, i = key, 2
                    while key in seen_keys:
                        key = f"{base}_{i}"
                        i += 1
                    seen_keys.add(key)
                    input_fields.append(
                        {
                            "key": key,
                            "label": label[:MAX_CATEGORY_NAME],
                            "type": "text",
                            "required": (row.get("required") or "").strip().lower() == "true",
                        }
                    )
            elif kind in VARIANT_KINDS:
                name = (row.get("title_ru") or "").strip()[:MAX_CATEGORY_NAME] or "Без названия"
                current_group = {"name": name, "products": []}
                categories.append(current_group)
                # первый вариант группы — в этой же строке
                _add_variant(current_group, row, warnings)
            else:
                warnings.append(f"Тип параметра «{kind or '—'}» не поддержан — пропущен")
        else:
            # Продолжение текущей группы вариантов
            if current_group is not None:
                _add_variant(current_group, row, warnings)

    # Отбрасываем группы без товаров
    categories = [c for c in categories if c["products"]]

    total_products = sum(len(c["products"]) for c in categories)

    return {
        "categories": categories,
        "input_fields": input_fields,
        "warnings": warnings,
        "stats": {
            "categories": len(categories),
            "products": total_products,
            "input_fields": len(input_fields),
            "warnings": len(warnings),
        },
    }
