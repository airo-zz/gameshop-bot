"""
api/services/sold_counter.py
─────────────────────────────────────────────────────────────────────────────
«Продано: N» на странице игры = продажи на GGSEL + выполненные заказы сайта.

GGSEL число продаж лота не отдаёт (sold_products_count — только для склада,
выгрузки продаж за период нет), поэтому его считает хаб UchetFP по своим
заказам: GET /agent/ggsel_sold → [{offer_id, title, sold}]. Лот → игра — тем же
сопоставлением по названию, что у отзывов (GameMatcher). История GGSEL — с
подключения хаба (03.08.2026).

Итог пишется в games.meta["sold_count"] (worker раз в 6 часов) — страница игры
отдаёт готовое число, без подсчёта на каждый запрос.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services import hub_config
from api.services.ggsel_reviews import GameMatcher
from api.services.hub_bridge import HubError, _check, _client
from shared.models import Category, Game, Order, OrderItem, OrderStatus, Product

logger = logging.getLogger(__name__)


async def _ggsel_by_game(db: AsyncSession, games: list[Game]) -> dict | None:
    """{id игры: продаж на GGSEL} или None, если хаб недоступен (тогда прошлое число не трогаем)."""
    cfg = await hub_config.get_active(db, require_enabled=False)
    if cfg is None:
        return None
    try:
        async with _client(cfg) as c:
            data = _check(await c.get("/agent/ggsel_sold"))
    except (HubError, OSError) as exc:
        logger.warning("ggsel_sold: хаб недоступен: %s", exc)
        return None
    matcher = GameMatcher(games)
    out: dict = {}
    for o in data.get("offers") or []:
        game, _ = matcher.match(o.get("title") or "")
        if game is not None:
            out[game.id] = out.get(game.id, 0) + int(o.get("sold") or 0)
    return out


async def _site_by_game(db: AsyncSession) -> dict:
    """{id игры: позиций в выполненных заказах сайта}."""
    rows = await db.execute(
        select(Category.game_id, func.count(OrderItem.id))
        .join(Product, Product.id == OrderItem.product_id)
        .join(Category, Category.id == Product.category_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.status == OrderStatus.completed)
        .group_by(Category.game_id)
    )
    return {gid: int(n) for gid, n in rows.all()}


async def refresh_sold_counts(db: AsyncSession) -> dict:
    games = list((await db.execute(select(Game))).scalars().all())
    ggsel = await _ggsel_by_game(db, games)
    site = await _site_by_game(db)
    now = datetime.now(timezone.utc).isoformat()
    for g in games:
        meta = dict(g.meta or {})
        gg = ggsel.get(g.id, 0) if ggsel is not None else int(meta.get("sold_ggsel") or 0)
        meta.update(sold_ggsel=gg, sold_site=site.get(g.id, 0), sold_count=gg + site.get(g.id, 0), sold_at=now)
        g.meta = meta
    await db.commit()
    total = sum(int((g.meta or {}).get("sold_count") or 0) for g in games)
    logger.info("Продано: пересчитано игр %d, всего %d (GGSEL %s)", len(games), total,
                "ok" if ggsel is not None else "нет связи с хабом")
    return {"games": len(games), "total": total, "ggsel_ok": ggsel is not None}
