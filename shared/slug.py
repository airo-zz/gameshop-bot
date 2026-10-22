"""
shared/slug.py — латинские адреса страниц (ЧПУ) из названий.

«Бриллианты» → «brillianty», «FC Поинты» → «fc-pointy», эмодзи и знаки
выкидываются. Транслитерация как у Яндекса (близко к ГОСТ 7.79-2000 «Б»),
чтобы адрес читался и совпадал с тем, что люди вводят латиницей.
"""
import re

_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}


def slugify_latin(text: str, max_len: int = 64) -> str:
    s = "".join(_MAP.get(ch, ch) for ch in (text or "").lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:max_len].strip("-") or "razdel"


def unique_slug(base: str, taken: set[str], max_len: int = 64) -> str:
    """base, base-2, base-3… — первый свободный; добавляет результат в taken."""
    slug, n = base, 2
    while slug in taken:
        suffix = f"-{n}"
        slug = base[: max_len - len(suffix)] + suffix
        n += 1
    taken.add(slug)
    return slug
