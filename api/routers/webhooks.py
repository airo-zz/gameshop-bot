"""api/routers/webhooks.py"""
import hashlib
import hmac

from fastapi import APIRouter, Header, HTTPException, Request

from api.deps import DbSession
from api.services.payment_service import PaymentService
from shared.config import settings

router = APIRouter()


@router.post("/yukassa")
async def yukassa_webhook(request: Request, db: DbSession):
    """
    Webhook от ЮKassa.
    Верификация: проверяем что запрос пришёл с IP ЮKassa.
    В продакшене добавь IP-whitelist: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25...
    """
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
