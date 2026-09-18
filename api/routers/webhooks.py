"""api/routers/webhooks.py"""
import hmac
import ipaddress

from fastapi import APIRouter, Header, HTTPException, Request

from api.deps import DbSession
from api.services.payment_service import PaymentService
from shared.config import settings

router = APIRouter()

# Официальные IP-диапазоны ЮKassa
# https://yookassa.ru/developers/using-api/webhooks
_YUKASSA_NETWORKS = [
    ipaddress.ip_network("185.71.76.0/27"),
    ipaddress.ip_network("185.71.77.0/27"),
    ipaddress.ip_network("77.75.153.0/25"),
    ipaddress.ip_network("77.75.156.11/32"),
    ipaddress.ip_network("77.75.156.35/32"),
    ipaddress.ip_network("77.75.154.128/25"),
    ipaddress.ip_network("2a02:5180::/32"),
]


def _is_yukassa_ip(ip_str: str) -> bool:
    """Проверяет, принадлежит ли IP одному из диапазонов ЮKassa."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _YUKASSA_NETWORKS)
    except ValueError:
        return False


@router.post("/yukassa")
async def yukassa_webhook(request: Request, db: DbSession):
    """
    Webhook от ЮKassa.
    Верификация: проверяем IP отправителя по whitelist ЮKassa.
    X-Real-IP передаётся nginx-ом.
    В dev-окружении проверка пропускается.
    """
    if settings.ENVIRONMENT != "development":
        real_ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "")
        if not _is_yukassa_ip(real_ip):
            raise HTTPException(403, "Forbidden: IP not in ЮKassa whitelist")

    payload = await request.json()

    svc = PaymentService(db)
    ok = await svc.handle_yukassa_webhook(payload)

    if not ok:
        raise HTTPException(400, "Ошибка обработки webhook")

    return {"ok": True}


@router.post("/platega")
async def platega_webhook(
    request: Request,
    db: DbSession,
    x_merchantid: str = Header(None),
    x_secret: str = Header(None),
):
    """
    Webhook от Platega.
    Верификация: заголовки x-merchantid / x-secret должны совпадать с нашими
    кредами (constant-time сравнение). Тело — {Id, amount, currency, status,
    paymentMethod, payload}.
    """
    if not settings.PLATEGA_MERCHANT_ID or not settings.PLATEGA_SECRET:
        raise HTTPException(500, "Platega не настроена")
    if not x_merchantid or not x_secret:
        raise HTTPException(401, "Отсутствуют заголовки авторизации")
    ok_merchant = hmac.compare_digest(x_merchantid, settings.PLATEGA_MERCHANT_ID)
    ok_secret = hmac.compare_digest(x_secret, settings.PLATEGA_SECRET)
    if not (ok_merchant and ok_secret):
        raise HTTPException(401, "Неверные креды Platega")

    payload = await request.json()

    svc = PaymentService(db)
    ok = await svc.handle_platega_webhook(payload)

    if not ok:
        raise HTTPException(400, "Ошибка обработки webhook")

    return {"ok": True}
