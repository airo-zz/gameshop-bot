"""
api/routers/admin/session_auth.py
─────────────────────────────────────────────────────────────────────────────
Вход в админку на admin.redonate.gg (cookie-сессии) и управление сессиями.
Логика — api/services/admin_auth_service.py.

  POST /admin/auth/webapp             — внутри Telegram (initData)
  POST /admin/auth/tg-request         — браузер: запрос подтверждения в боте поддержки
  GET  /admin/auth/tg-request/{nonce} — браузер ждёт подтверждения → сессия
  POST /admin/auth/email/start        — почта + пароль → код на почту
  POST /admin/auth/email/verify       — код → сессия
  POST /admin/auth/logout
  GET  /admin/auth/security           — своя почта/пароль и активные сессии
  POST /admin/auth/credentials/request, /admin/auth/credentials — задать почту и пароль
  DELETE /admin/auth/sessions/{id}, POST /admin/auth/sessions/revoke-others
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, check_admin_request
from api.rate_limit import limiter
from api.services import admin_auth_service as aas
from api.utils.admin_log import log_admin_action
from shared.config import settings

router = APIRouter(prefix="/auth")


def _client(request: Request) -> tuple[str | None, str | None]:
    return (request.client.host if request.client else None), request.headers.get("user-agent")


async def _start_session(db, request: Request, response: Response, admin, method: str) -> dict:
    ip, ua = _client(request)
    token = await aas.create_session(db, admin, method, ip, ua)
    response.set_cookie(
        aas.COOKIE, token,
        max_age=settings.ADMIN_SESSION_DAYS * 86400,
        httponly=True, secure=True, samesite="strict", path="/",
    )
    await log_admin_action(db=db, admin=admin, action="admin.login", entity_type="admin_session",
                           after_data={"method": method, "ua": (ua or "")[:120]}, ip_address=ip)
    if method != "telegram_webapp":  # внутри Telegram вход происходит при каждом открытии
        await aas.notify_login(admin, method, ip, ua)
    return {"ok": True}


def _err(e: aas.AdminAuthError) -> HTTPException:
    return HTTPException(e.status, e.message)


# ── Telegram ─────────────────────────────────────────────────────────────────

class WebAppIn(BaseModel):
    init_data: str = Field(..., max_length=4096)


@router.post("/webapp")
@limiter.limit("20/minute")
async def login_webapp(request: Request, response: Response, body: WebAppIn, db: DbSession):
    check_admin_request(request)
    try:
        tg_user = aas.verify_webapp_init_data(body.init_data)
    except aas.AdminAuthError as e:
        raise _err(e)
    admin = await aas.active_admin_by_tg(db, int(tg_user.get("id") or 0))
    if not admin:
        raise HTTPException(403, "У этого аккаунта Telegram нет доступа к админке")
    return await _start_session(db, request, response, admin, "telegram_webapp")


@router.post("/tg-request")
@limiter.limit("10/minute")
async def tg_request(request: Request, response: Response):
    check_admin_request(request)
    ip, ua = _client(request)
    nonce, secret = await aas.create_login_request(ip, ua)
    response.set_cookie(aas.LOGIN_REQUEST_COOKIE, secret, max_age=aas.LOGIN_REQUEST_TTL,
                        httponly=True, secure=True, samesite="strict", path="/")
    return {
        "nonce": nonce,
        "bot_url": f"https://t.me/{settings.SUPPORT_BOT_USERNAME}?start=adminlogin_{nonce}",
        "expires_in": aas.LOGIN_REQUEST_TTL,
    }


@router.get("/tg-request/{nonce}")
@limiter.limit("60/minute")
async def tg_request_status(nonce: str, request: Request, response: Response, db: DbSession):
    check_admin_request(request)
    try:
        admin = await aas.claim_login_request(db, nonce, request.cookies.get(aas.LOGIN_REQUEST_COOKIE, ""))
    except aas.AdminAuthError as e:
        raise _err(e)
    if admin is None:
        return {"status": "pending"}
    response.delete_cookie(aas.LOGIN_REQUEST_COOKIE, path="/")
    await _start_session(db, request, response, admin, "telegram_confirm")
    return {"status": "approved"}


# ── Почта и пароль ───────────────────────────────────────────────────────────

class EmailStartIn(BaseModel):
    email: str = Field(..., max_length=254)
    password: str = Field(..., max_length=200)


class EmailVerifyIn(BaseModel):
    email: str = Field(..., max_length=254)
    code: str = Field(..., max_length=12)


@router.post("/email/start", status_code=204)
@limiter.limit("5/minute")
async def email_start(request: Request, body: EmailStartIn, db: DbSession):
    check_admin_request(request)
    try:
        await aas.email_password_step(db, body.email, body.password)
    except aas.AdminAuthError as e:
        raise _err(e)


@router.post("/email/verify")
@limiter.limit("10/minute")
async def email_verify(request: Request, response: Response, body: EmailVerifyIn, db: DbSession):
    check_admin_request(request)
    try:
        admin = await aas.email_code_step(db, body.email, body.code)
    except aas.AdminAuthError as e:
        raise _err(e)
    return await _start_session(db, request, response, admin, "email")


# ── Выход и сессии ───────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(request: Request, response: Response, admin: CurrentAdmin, db: DbSession):
    sid = getattr(request.state, "admin_session_id", None)
    if sid:
        await aas.revoke_session(db, sid, admin.id)
    response.delete_cookie(aas.COOKIE, path="/")
    return {"ok": True}


class SessionOut(BaseModel):
    id: uuid.UUID
    method: str
    method_label: str
    ip: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    current: bool


def session_out(s, current_id) -> SessionOut:
    return SessionOut(
        id=s.id, method=s.method, method_label=aas.METHOD_LABELS.get(s.method, s.method),
        ip=s.ip, user_agent=s.user_agent, created_at=s.created_at, last_seen_at=s.last_seen_at,
        current=s.id == current_id,
    )


@router.get("/security")
async def security_info(request: Request, admin: CurrentAdmin, db: DbSession):
    current = getattr(request.state, "admin_session_id", None)
    sessions = await aas.list_sessions(db, admin.id)
    return {
        "email": admin.email,
        "has_password": bool(admin.password_hash),
        "password_set_at": admin.password_set_at,
        "sessions": [session_out(s, current) for s in sessions],
    }


@router.delete("/sessions/{session_id}")
async def revoke_one(session_id: uuid.UUID, request: Request, admin: CurrentAdmin, db: DbSession):
    if not await aas.revoke_session(db, session_id, admin.id):
        raise HTTPException(404, "Сессия не найдена")
    await log_admin_action(db=db, admin=admin, action="admin.session_revoke", entity_type="admin_session",
                           entity_id=session_id)
    return {"ok": True}


@router.post("/sessions/revoke-others")
async def revoke_others(request: Request, admin: CurrentAdmin, db: DbSession):
    n = await aas.revoke_all(db, admin.id, except_id=getattr(request.state, "admin_session_id", None))
    await log_admin_action(db=db, admin=admin, action="admin.session_revoke_all", entity_type="admin_session",
                           after_data={"revoked": n})
    return {"revoked": n}


class CredentialsRequestIn(BaseModel):
    email: str = Field(..., max_length=254)


class CredentialsIn(BaseModel):
    email: str = Field(..., max_length=254)
    code: str = Field(..., max_length=12)
    password: str = Field(..., min_length=1, max_length=200)


@router.post("/credentials/request", status_code=204)
@limiter.limit("5/minute")
async def credentials_request(request: Request, body: CredentialsRequestIn, admin: CurrentAdmin, db: DbSession):
    try:
        await aas.credentials_request(db, admin, body.email)
    except aas.AdminAuthError as e:
        raise _err(e)


@router.post("/credentials")
@limiter.limit("10/minute")
async def credentials_save(request: Request, body: CredentialsIn, admin: CurrentAdmin, db: DbSession):
    try:
        await aas.credentials_save(db, admin, body.email, body.code, body.password)
    except aas.AdminAuthError as e:
        raise _err(e)
    # Новый пароль — остальные сессии завершаем
    await aas.revoke_all(db, admin.id, except_id=getattr(request.state, "admin_session_id", None))
    await log_admin_action(db=db, admin=admin, action="admin.credentials_set", entity_type="admin_user",
                           entity_id=admin.id, after_data={"email": admin.email})
    return {"ok": True}
