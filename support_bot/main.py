"""
support_bot/main.py
─────────────────────────────────────────────────────────────────────────────
Точка входа бота поддержки.
Отдельный процесс, общая БД и сервисы с основным ботом.
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
from support_bot.middlewares.auth import SupportAuthMiddleware
from support_bot.handlers import start, chat
from support_bot.utils.texts import texts

# ── Логирование ──────────────────────────────────────────────────────────────
logging.basicConfig(level=settings.LOG_LEVEL)
log = structlog.get_logger()

WEBHOOK_PATH = "/webhook/support_bot"


async def on_startup(bot: Bot) -> None:
    log.info("support_bot.startup", env=settings.ENVIRONMENT)

    if settings.ENVIRONMENT == "production" and settings.WEBHOOK_HOST:
        url = f"{settings.WEBHOOK_HOST}{WEBHOOK_PATH}"
        await bot.set_webhook(
            url=url,
            secret_token=settings.WEBHOOK_SECRET,
            drop_pending_updates=True,
        )
        log.info("support_bot.webhook_set", url=url)
    else:
        await bot.delete_webhook(drop_pending_updates=True)
        log.info("support_bot.polling_mode")


async def on_shutdown(bot: Bot) -> None:
    log.info("support_bot.shutdown")
    if settings.ENVIRONMENT == "production":
        await bot.delete_webhook()
    await engine.dispose()


def create_bot() -> Bot:
    return Bot(
        token=settings.effective_support_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


def create_dispatcher() -> Dispatcher:
    storage = RedisStorage.from_url(settings.REDIS_URL)
    dp = Dispatcher(storage=storage)

    # ── Middlewares ───────────────────────────────────────────────────────────
    dp.message.middleware(SupportAuthMiddleware())
    dp.callback_query.middleware(SupportAuthMiddleware())

    # ── Lifecycle ────────────────────────────────────────────────────────────
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    # ── Error handler ────────────────────────────────────────────────────────
    @dp.errors()
    async def global_error_handler(event: ErrorEvent) -> None:
        log.exception("support_bot.error", exc_info=event.exception)
        try:
            if event.update.message:
                await event.update.message.answer(texts.error_general)
            elif event.update.callback_query:
                await event.update.callback_query.answer(
                    "Произошла ошибка", show_alert=True
                )
        except Exception:
            pass

    # ── Routers (порядок важен: start перед chat) ────────────────────────────
    dp.include_router(start.router)
    dp.include_router(chat.router)

    return dp


async def run_polling() -> None:
    bot = create_bot()
    dp = create_dispatcher()
    log.info("support_bot.polling_start")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


async def health_handler(request: web.Request) -> web.Response:
    return web.Response(text="ok")


def run_webhook() -> None:
    bot = create_bot()
    dp = create_dispatcher()

    app = web.Application()
    handler = SimpleRequestHandler(
        dispatcher=dp,
        bot=bot,
        secret_token=settings.WEBHOOK_SECRET,
    )
    handler.register(app, path=WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)

    app.router.add_get("/health", health_handler)

    log.info("support_bot.webhook_start", path=WEBHOOK_PATH)
    web.run_app(app, host="0.0.0.0", port=8081)


if __name__ == "__main__":
    if settings.ENVIRONMENT == "production" and settings.WEBHOOK_HOST:
        run_webhook()
    else:
        asyncio.run(run_polling())
