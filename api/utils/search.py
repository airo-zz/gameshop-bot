"""
api/utils/search.py — утилиты для безопасного поиска.
"""


def escape_like(query: str) -> str:
    """
    Экранирует спецсимволы LIKE/ILIKE (`%`, `_`, `\\`).

    Без этого пользовательский ввод `%%%...%` превращается в полный table scan
    по неиндексируемому паттерну — потенциальный DoS. Используется вместе с
    `.ilike(f"%{escape_like(q)}%", escape="\\")`.
    """
    return query.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
