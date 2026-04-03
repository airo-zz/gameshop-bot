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
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web

from shared.config import settings
from shared.database.session import engine

from bot.middlewares.auth import AuthMiddleware
from bot.middlewares.throttle import ThrottleMiddleware
from bot.middlewares.logging import LoggingMiddleware

from bot.handlers.client import start, catalog, cart, orders, profile, support
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
    dp.message.middleware(ThrottleMiddleware(rate_limit=settings.RATE_LIMIT_CLIENT))
    dp.callback_query.middleware(
        ThrottleMiddleware(rate_limit=settings.RATE_LIMIT_CLIENT)
    )

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    # ── Client routers ────────────────────────────────────────────────────────
    dp.include_router(start.router)
    dp.include_router(catalog.router)
    dp.include_router(cart.router)
    dp.include_router(orders.router)
    dp.include_router(profile.router)
    dp.include_router(support.router)

    # ── Admin routers ─────────────────────────────────────────────────────────
    dp.include_router(admin_main.router)
    dp.include_router(admin_catalog.router)
    dp.include_router(admin_orders.router)
    dp.include_router(admin_stats.router)
    dp.include_router(admin_users.router)
    dp.include_router(admin_discounts.router)

    return dp


async def run_polling() -> None:
    """Режим разработки — long polling."""
    bot = create_bot()
    dp = create_dispatcher()
    log.info("bot.polling_start", shop=settings.SHOP_NAME)
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


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

    log.info("bot.webhook_start", path=settings.WEBHOOK_PATH)
    web.run_app(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    if settings.ENVIRONMENT == "production" and settings.WEBHOOK_HOST:
        run_webhook()
    else:
        asyncio.run(run_polling())
