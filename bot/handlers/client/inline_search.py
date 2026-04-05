"""
bot/handlers/client/inline_search.py
─────────────────────────────────────────────────────────────────────────────
Инлайн-режим поиска товаров.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import Router
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
)
from sqlalchemy import select

from shared.config import settings
from shared.database.session import async_session_factory
from shared.models import Product
from bot.utils.texts import texts

router = Router(name="client:inline_search")


def _delivery_label(delivery_type: str) -> str:
    return {
        "auto": "⚡ Авто",
        "manual": "👤 Вручную",
        "mixed": "📦 Смешанная",
    }.get(delivery_type, delivery_type)


@router.inline_query()
async def inline_search(query: InlineQuery) -> None:
    """
    Обработчик inline-запросов.
    Пустой запрос — показываем все/популярные товары (limit 50).
    Запрос >= 2 символов — поиск по name ILIKE.
    """
    search_text = query.query.strip()

    async with async_session_factory() as db:
        stmt = select(Product).where(Product.is_active == True)

        if len(search_text) >= 2:
            stmt = stmt.where(Product.name.ilike(f"%{search_text}%"))

        stmt = stmt.order_by(
            Product.is_featured.desc(),
            Product.sort_order.asc(),
            Product.name.asc(),
        ).limit(50)

        result = await db.execute(stmt)
        products = result.scalars().all()

    results = []
    for product in products:
        delivery_label = _delivery_label(product.delivery_type.value)
        price = float(product.price)

        product_card_text = texts.product_card(
            name=product.name,
            description=product.description or "",
            price=price,
            stock=product.stock,
            delivery_type=product.delivery_type.value,
        )

        thumbnail_url: str | None = None
        if product.images and isinstance(product.images, list) and len(product.images) > 0:
            thumbnail_url = product.images[0]

        results.append(
            InlineQueryResultArticle(
                id=str(product.id),
                title=product.name,
                description=f"{price:.0f} ₽ | {delivery_label}",
                input_message_content=InputTextMessageContent(
                    message_text=product_card_text,
                    parse_mode="HTML",
                ),
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text=f"🛒 Открыть в {settings.SHOP_NAME}",
                                url=f"https://t.me/{settings.BOT_USERNAME}?start=product_{product.id}",
                            )
                        ]
                    ]
                ),
                thumbnail_url=thumbnail_url,
            )
        )

    await query.answer(results, cache_time=30, is_personal=False)
