"""api/routers/webhooks.py"""
import hashlib
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
    """
    real_ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "")
    if not _is_yukassa_ip(real_ip):
        raise HTTPException(403, "Forbidden: IP not in ЮKassa whitelist")

    body = await request.body()
    payload = await request.json()

    svc = PaymentService(db)
    ok = await svc.handle_yukassa_webhook(payload)

    if not ok:
        raise HTTPException(400, "Ошибка обработки webhook")

    return {"ok": True}


@router.post("/cryptobot")
async def cryptobot_webhook(
    request: Request,
    db: DbSession,
    crypto_pay_api_signature: str = Header(None),
):
    """
    Webhook от CryptoBot.
    Верификация через HMAC-SHA256 подпись в заголовке.
    """
    body = await request.body()

    # Верифицируем подпись — токен обязан быть настроен, заголовок обязателен
    if not settings.CRYPTOBOT_TOKEN:
        raise HTTPException(500, "CRYPTOBOT_TOKEN не настроен")
    if not crypto_pay_api_signature:
        raise HTTPException(401, "Отсутствует подпись")
    secret = hashlib.sha256(settings.CRYPTOBOT_TOKEN.encode()).digest()
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, crypto_pay_api_signature):
        raise HTTPException(401, "Неверная подпись")

    payload = await request.json()
    if payload.get("update_type") != "invoice_paid":
        return {"ok": True}  # Игнорируем другие события

    svc = PaymentService(db)
    ok = await svc.handle_cryptobot_webhook(payload.get("payload", {}))

    return {"ok": ok}
