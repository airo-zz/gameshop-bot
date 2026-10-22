"""
shared/mailer.py
─────────────────────────────────────────────────────────────────────────────
Транзакционные письма через Unisender Go: коды входа на сайт и уведомления
пользователям, зарегистрированным по почте (у них нет Telegram — то, что
остальным приходит от бота, им приходит письмом).

Без UNISENDER_GO_API_KEY письма не отправляются, а пишутся в лог — удобно,
пока сервис не подключён.

Есть async-версия (API) и sync-версия (Celery worker).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import html
import logging
import re

import httpx

from shared.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0

# ── Шаблон ────────────────────────────────────────────────────────────────────

_BTN = (
    '<a href="{url}" style="display:inline-block;background:#2563EB;color:#ffffff;'
    'text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;'
    'border-radius:10px">{label}</a>'
)


def _layout(body_html: str) -> str:
    site = settings.FRONTEND_URL.rstrip("/")
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F3F5F9;font-family:Arial,Helvetica,sans-serif;color:#101C36">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F9;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:20px">{html.escape(settings.SHOP_NAME)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55">{body_html}</td></tr>
</table>
<p style="font-size:12px;color:#7D8799;margin:16px 0 0">
Письмо отправлено автоматически, отвечать на него не нужно.<br>
<a href="{site}" style="color:#7D8799">{html.escape(site.split("//")[-1])}</a>
</p>
</td></tr></table>
</body></html>"""


def _strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def code_email(code: str) -> tuple[str, str, str]:
    """(subject, html, plaintext) письма с кодом входа."""
    subject = f"Код для входа: {code}"
    body = (
        "<p style=\"margin:0 0 16px\">Ваш код для входа на сайт:</p>"
        f"<p style=\"margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px\">{code}</p>"
        "<p style=\"margin:0;color:#4A5568\">Код действует 10 минут. Если вы не запрашивали вход — "
        "просто проигнорируйте это письмо.</p>"
    )
    text = f"Ваш код для входа: {code}\nКод действует 10 минут."
    return subject, _layout(body), text


def notice_email(subject: str, tg_html: str, path: str = "/", button: str = "Открыть") -> tuple[str, str, str]:
    """
    Письмо-уведомление из текста, подготовленного для Telegram (HTML-подмножество
    <b>/<i>/<code>/<a>, переносы строк). path — страница сайта для кнопки.
    """
    url = settings.FRONTEND_URL.rstrip("/") + path
    body = tg_html.strip().replace("\n", "<br>")
    body_html = f'<p style="margin:0 0 24px">{body}</p>' + _BTN.format(url=url, label=html.escape(button))
    text = _strip_tags(tg_html) + f"\n\n{url}"
    return subject, _layout(body_html), text


# ── Отправка ─────────────────────────────────────────────────────────────────


def _request(to: str, subject: str, html_body: str, text: str) -> tuple[str, dict, dict] | None:
    if not settings.UNISENDER_GO_API_KEY:
        logger.warning("mailer: UNISENDER_GO_API_KEY не задан, письмо не отправлено (to=%s, subject=%s)", to, subject)
        return None
    url = settings.UNISENDER_GO_API_URL.rstrip("/") + "/email/send.json"
    headers = {"X-API-KEY": settings.UNISENDER_GO_API_KEY, "Content-Type": "application/json"}
    payload = {
        "message": {
            "recipients": [{"email": to}],
            "subject": subject,
            "from_email": settings.EMAIL_FROM,
            "from_name": settings.EMAIL_FROM_NAME,
            "body": {"html": html_body, "plaintext": text},
            "track_links": 0,
            "track_read": 0,
        }
    }
    return url, headers, payload


def _ok(resp: httpx.Response, to: str) -> bool:
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if resp.status_code == 200 and data.get("status") == "success":
        return True
    logger.warning("mailer: ошибка отправки to=%s: %s %s", to, resp.status_code, resp.text[:300])
    return False


async def send_email(to: str, subject: str, html_body: str, text: str) -> bool:
    """Отправляет письмо. Не бросает исключений; True — принято сервисом."""
    req = _request(to, subject, html_body, text)
    if req is None:
        return False
    url, headers, payload = req
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
        return _ok(resp, to)
    except Exception as exc:
        logger.warning("mailer: сбой отправки to=%s: %s", to, exc)
        return False


def send_email_sync(to: str, subject: str, html_body: str, text: str) -> bool:
    """Sync-версия для Celery worker."""
    req = _request(to, subject, html_body, text)
    if req is None:
        return False
    url, headers, payload = req
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, json=payload, headers=headers)
        return _ok(resp, to)
    except Exception as exc:
        logger.warning("mailer: сбой отправки to=%s: %s", to, exc)
        return False
