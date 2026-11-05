"""api/routers/webhooks.py — вебхуки платёжки Platega (единственный шлюз оплаты)."""
import hmac

from fastapi import APIRouter, Header, HTTPException, Request

from api.deps import DbSession
from api.services.payment_service import PaymentService
from shared.config import settings

router = APIRouter()

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
