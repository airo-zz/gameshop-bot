"""
api/main.py
─────────────────────────────────────────────────────────────────────────────
FastAPI приложение — REST API для Telegram Mini App.
Все эндпоинты требуют авторизацию через Telegram WebApp initData или JWT.
─────────────────────────────────────────────────────────────────────────────
"""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from shared.config import settings
from shared.database.session import engine

from api.routers import catalog, cart, orders, payments, profile, support, webhooks, uploads
from api.routers.admin import router as admin_router

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("api.startup", shop=settings.SHOP_NAME, env=settings.ENVIRONMENT)
    yield
    await engine.dispose()
    log.info("api.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.SHOP_NAME} API",
        description="REST API для Telegram Mini App игрового магазина",
        version="1.0.0",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # ── CORS (только Telegram домены в prod) ─────────────────────────────────
    miniapp_origin = (
        settings.MINIAPP_URL.rstrip("/").rsplit("/app", 1)[0]
        if settings.MINIAPP_URL
        else ""
    )
    allowed_origins = (
        ["*"]
        if settings.DEBUG
        else [
            "https://web.telegram.org",
            "https://k.web.telegram.org",
            "https://z.web.telegram.org",
            miniapp_origin,
        ]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type", "X-Telegram-Init-Data"],
    )

    # ── Роутеры ───────────────────────────────────────────────────────────────
    prefix = "/api/v1"
    app.include_router(catalog.router, prefix=f"{prefix}/catalog", tags=["Catalog"])
    app.include_router(cart.router, prefix=f"{prefix}/cart", tags=["Cart"])
    app.include_router(orders.router, prefix=f"{prefix}/orders", tags=["Orders"])
    app.include_router(payments.router, prefix=f"{prefix}/payments", tags=["Payments"])
    app.include_router(profile.router, prefix=f"{prefix}/profile", tags=["Profile"])
    app.include_router(support.router, prefix=f"{prefix}/support", tags=["Support"])
    app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])
    app.include_router(uploads.router, prefix=f"{prefix}/admin", tags=["Admin Uploads"])
    app.include_router(admin_router, prefix=f"{prefix}/admin", tags=["Admin"])

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", include_in_schema=False)
    async def health():
        return {"status": "ok"}

    # ── Глобальный обработчик ошибок ─────────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        log.error(
            "api.unhandled_error", path=request.url.path, error=str(exc), exc_info=True
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Внутренняя ошибка сервера"},
        )

    return app


app = create_app()
