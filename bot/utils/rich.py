"""
bot/utils/rich.py
─────────────────────────────────────────────────────────────────────────────
Экраны бота — Rich Messages (Bot API 10.1+): заголовки, таблицы, разделители,
сворачиваемые блоки и картинка прямо внутри сообщения.

Тексты пишутся обычным Telegram-HTML с переносами строк (так же их правят в
админке) плюс, где нужно, блочные теги Rich HTML: <h2>, <table>, <hr/>, <footer>,
<details>, <ul>. to_rich_html() превращает переносы в абзацы и <br> (в Rich HTML
обычный \\n схлопывается в пробел), картинка экрана встаёт первым блоком.

Если Telegram не принял rich-сообщение, экран уходит обычным сообщением:
to_classic_html() сводит блочные теги к тому, что понимает обычный HTML.
Выключатель — BOT_RICH_MESSAGES в .env.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import re
from html import escape

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import SendRichMessage
from aiogram.types import InputRichMessage, Message

from shared.config import settings

log = logging.getLogger(__name__)

# Блочные теги Rich HTML, внутри которых переносы не трогаем (кроме цитаты и details)
_BLOCK_RE = re.compile(
    r"(<(h[1-6]|table|details|ul|ol|blockquote|footer|figure|pre|aside|p)\b[^>]*>.*?</\2>|<hr\s*/?>|<img\b[^>]*/?>)",
    re.S | re.I,
)


def rich_enabled() -> bool:
    return settings.BOT_RICH_MESSAGES


def _paragraphs(segment: str) -> str:
    """Обычный текст с переносами → <p>…</p>: пустая строка — новый абзац, \\n — <br>."""
    out = []
    for para in re.split(r"\n\s*\n", segment.strip("\n")):
        para = para.strip()
        if para:
            out.append("<p>" + para.replace("\n", "<br>") + "</p>")
    return "".join(out)


def to_rich_html(text: str, photo_url: str | None = None) -> str:
    """Telegram-HTML с переносами (+ блочные rich-теги) → Rich HTML. Картинка — первым блоком."""
    parts: list[str] = []
    if photo_url:
        parts.append(f'<img src="{escape(photo_url, quote=True)}"/>')
    pos = 0
    for m in _BLOCK_RE.finditer(text):
        parts.append(_paragraphs(text[pos:m.start()]))
        block = m.group(1)
        tag = (m.group(2) or "").lower()
        if tag in ("blockquote", "details", "p", "footer"):
            # переносы внутри — строки, как в обычном Telegram
            block = re.sub(r"\n(?=[^\n])", "<br>", block.strip())
        parts.append(block)
        pos = m.end()
    parts.append(_paragraphs(text[pos:]))
    return "".join(parts)


def to_classic_html(text: str) -> str:
    """Rich-разметка → обычный Telegram-HTML (запасной путь, если rich не приняли)."""
    s = text
    s = re.sub(r"<h[1-6][^>]*>(.*?)</h[1-6]>", r"<b>\1</b>\n", s, flags=re.S | re.I)
    s = re.sub(r"<hr\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<footer[^>]*>(.*?)</footer>", r"\n<i>\1</i>", s, flags=re.S | re.I)
    s = re.sub(r"<details[^>]*>\s*<summary>(.*?)</summary>(.*?)</details>",
               r"<b>\1</b>\n\2\n", s, flags=re.S | re.I)
    s = re.sub(r"<li[^>]*>(.*?)</li>", r"• \1\n", s, flags=re.S | re.I)
    s = re.sub(r"</?(ul|ol)[^>]*>", "", s, flags=re.I)

    def table(m: re.Match) -> str:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(0), flags=re.S | re.I)
        lines = []
        for row in rows:
            cells = [c.strip() for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, flags=re.S | re.I)]
            if "<th" in row.lower():
                continue  # шапка таблицы в обычном тексте лишняя
            lines.append(" · ".join(c for c in cells if c))
        return "\n".join(lines) + "\n"

    s = re.sub(r"<table[^>]*>.*?</table>", table, s, flags=re.S | re.I)
    s = re.sub(r"<caption[^>]*>.*?</caption>", "", s, flags=re.S | re.I)
    s = re.sub(r"<p[^>]*>(.*?)</p>", r"\1\n\n", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<img\b[^>]*/?>", "", s, flags=re.I)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def _is_not_modified(e: TelegramBadRequest) -> bool:
    return "message is not modified" in str(e)


async def send_screen(bot: Bot, chat_id: int, text: str, photo_url: str | None = None,
                      reply_markup=None) -> Message:
    """Новое сообщение-экран: rich (картинка внутри), иначе — обычное фото/текст."""
    if rich_enabled():
        try:
            return await bot(SendRichMessage(
                chat_id=chat_id,
                rich_message=InputRichMessage(html=to_rich_html(text, photo_url)),
                reply_markup=reply_markup,
            ))
        except TelegramBadRequest as e:
            log.warning("rich send failed, fallback to classic: %s", e)
    classic = to_classic_html(text)
    if photo_url and len(classic) <= 1024:
        try:
            return await bot.send_photo(chat_id, photo=photo_url, caption=classic,
                                        reply_markup=reply_markup, parse_mode="HTML")
        except TelegramBadRequest as e:
            log.warning("photo send failed, text only: %s", e)
    return await bot.send_message(chat_id, classic, reply_markup=reply_markup, parse_mode="HTML")


async def edit_screen(bot: Bot, chat_id: int, message_id: int, text: str,
                      photo_url: str | None = None, reply_markup=None) -> bool:
    """
    Редактирует экран на месте (текст и rich-сообщения). True — получилось
    (или содержимое не изменилось). False — сообщение не редактируется так
    (фото со старых экранов, удалено) — вызывающий отправит новое.
    """
    if not rich_enabled():
        return False
    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            rich_message=InputRichMessage(html=to_rich_html(text, photo_url)),
            reply_markup=reply_markup,
        )
        return True
    except TelegramBadRequest as e:
        if _is_not_modified(e):
            return True
        log.info("rich edit not possible (%s), will resend", e)
        return False
