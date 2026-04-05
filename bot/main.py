"""
bot/main.py
─────────────────────────────────────────────────────────────────────────────
Точка входа Telegram-бота.
Режим: webhook (prod) или polling (dev).
─────────────────────────────────────────────────────────────────────────────
"""

import asyncio
import logging
import structlog
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import ErrorEvent
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web

from shared.config import settings
from shared.database.session import engine
from bot.utils.texts import texts

from bot.middlewares.auth import AuthMiddleware
from bot.middlewares.admin_auth import AdminAuthMiddleware
from bot.middlewares.throttle import ThrottleMiddleware
from bot.middlewares.logging import LoggingMiddleware

from bot.handlers.client import (
    start, catalog, cart, orders, profile, support,
    checkout, favorites, inline_search,
)
from bot.handlers.admin import (
    admin_main,
    admin_catalog,
    admin_orders,
    admin_stats,
    admin_users,
    admin_discounts,
)

# ── Логирование ───────────────────────────────────────────────────────────────
logging.basicConfig(level=settings.LOG_LEVEL)
log = structlog.get_logger()


async def on_startup(bot: Bot) -> None:
    log.info("bot.startup", shop_name=settings.SHOP_NAME, env=settings.ENVIRONMENT)
    if not settings.WEBHOOK_SECRET:
        log.warning("WEBHOOK_SECRET не задан — webhook не защищён от подделки запросов!")

    if settings.ENVIRONMENT == "production" and settings.WEBHOOK_HOST:
        await bot.set_webhook(
            url=settings.webhook_url,
            secret_token=settings.WEBHOOK_SECRET,
            drop_pending_updates=True,
        )
        log.info("bot.webhook_set", url=settings.webhook_url)
    else:
        await bot.delete_webhook(drop_pending_updates=True)
        log.info("bot.polling_mode")


async def on_shutdown(bot: Bot) -> None:
    log.info("bot.shutdown")
    if settings.ENVIRONMENT == "production":
        await bot.delete_webhook()
    await engine.dispose()


def create_bot() -> Bot:
    return Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


def create_dispatcher() -> Dispatcher:
    storage = RedisStorage.from_url(settings.REDIS_URL)
    dp = Dispatcher(storage=storage)

    # ── Middlewares (порядок важен) ───────────────────────────────────────────
    dp.message.middleware(LoggingMiddleware())
    dp.callback_query.middleware(LoggingMiddleware())
    dp.message.middleware(AuthMiddleware())
    dp.callback_query.middleware(AuthMiddleware())

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    # ── Global error handler ──────────────────────────────────────────────────
    @dp.errors()
    async def global_error_handler(event: ErrorEvent) -> None:
        log.exception(
            "Необработанная ошибка",
            exc_info=event.exception,
        )
        try:
            if event.update.message:
                await event.update.message.answer(
                    texts.error_general
                )
            elif event.update.callback_query:
                await event.update.callback_query.answer(
                    "Произошла ошибка", show_alert=True
                )
        except Exception:
            pass

    # ── Client routers (с rate limiting для клиентов) ─────────────────────────
    _client_routers = [
        start.router, catalog.router, cart.router,
        orders.router, profile.router, support.router,
        checkout.router, favorites.router,
    ]
    for _r in _client_routers:
        _r.message.middleware(ThrottleMiddleware(rate_limit=settings.RATE_LIMIT_CLIENT))
        _r.callback_query.middleware(ThrottleMiddleware(rate_limit=settings.RATE_LIMIT_CLIENT))
        dp.include_router(_r)

    # ── Inline search router (отдельно — свой middleware) ─────────────────────
    inline_search.router.inline_query.middleware(
        ThrottleMiddleware(rate_limit=settings.RATE_LIMIT_CLIENT)
    )
    dp.include_router(inline_search.router)

    # ── Admin routers ─────────────────────────────────────────────────────────
    _admin_routers = [
        admin_main.router,
        admin_catalog.router,
        admin_orders.router,
        admin_stats.router,
        admin_users.router,
        admin_discounts.router,
    ]
    for _r in _admin_routers:
        _r.message.middleware(AdminAuthMiddleware())
        _r.callback_query.middleware(AdminAuthMiddleware())
        dp.include_router(_r)

    return dp


async def run_polling() -> None:
    """Режим разработки — long polling."""
    bot = create_bot()
    dp = create_dispatcher()
    log.info("bot.polling_start", shop=settings.SHOP_NAME)
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


async def health_handler(request: web.Request) -> web.Response:
    return web.Response(text="ok")


def run_webhook() -> None:
    """Режим продакшена — webhook через aiohttp."""
    bot = create_bot()
    dp = create_dispatcher()

    app = web.Application()
    handler = SimpleRequestHandler(
        dispatcher=dp,
        bot=bot,
        secret_token=settings.WEBHOOK_SECRET,
    )
    handler.register(app, path=settings.WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)

    # Health endpoint для Docker healthcheck и nginx depends_on
    app.router.add_get("/health", health_handler)

    log.info("bot.webhook_start", path=settings.WEBHOOK_PATH)
    web.run_app(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    if settings.ENVIRONMENT == "production" and settings.WEBHOOK_HOST:
        run_webhook()
    else:
        asyncio.run(run_polling())
