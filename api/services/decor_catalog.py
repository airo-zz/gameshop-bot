"""
api/services/decor_catalog.py
─────────────────────────────────────────────────────────────────────────────
Украшения Discord: общий каталог с UchetFP и discordcatalog.net.

Источник правды — каталог UchetFP (ggsel_bot/discord_decor/catalog: codes.json —
коды, цены Discord, тип; catalog2.json — порядок коллекций). На сервере он лежит
облегчённой git-копией (/opt/decor-catalog, cron `git pull` каждые 10 мин) и
смонтирован в контейнеры только на чтение (settings.DECOR_CATALOG_DIR).

Картинки и английские названия — из опубликованных данных discordcatalog.net
(const DATA в странице, только чтение): сборщик сайта сам качает и называет
webp-файлы, в каталоге UchetFP их нет. Картинка показывается прямо с сайта.

Синхронизация (beat раз в час + кнопка в админке) держит в reDonate игру
«Украшения Discord» (Game.meta.decor_catalog), подкатегорию на коллекцию и товар
на каждый код (Product.meta.decor). Цена — по таблице вариантов в формате лота
GGSel (как в UchetFP, parse_price_tiers): вид + цена с Nitro → «+N ₽».
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import settings
from shared.models import ShopSettings
from shared.models.catalog import Category, DeliveryType, Game, Product

logger = logging.getLogger(__name__)

K_TIERS = "decor_price_tiers"
K_BASE = "decor_base_rub"
K_STATUS = "decor_sync_status"
K_SIG = "decor_sync_signature"

GAME_SLUG = "discord-decor"
GAME_NAME = "Украшения Discord"

TYPE_ORDER = ["набор", "украшение аватара", "эффект профиля", "бейджик", "рамка профиля"]


# ── Таблица цен (порт ggsel_bot/discord_decor/order_check.py) ───────────────

_USD_RANGE_RE = re.compile(r"(\d+[.,]\d{1,2})\s*\$\s*[–—-]\s*(\d+[.,]\d{1,2})\s*\$")
_USD_ONE_RE = re.compile(r"(\d+[.,]\d{1,2})\s*\$")
_TIER_RUB_RE = re.compile(r"\(\s*\+\s*(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:₽|руб|RUB)", re.I)


def _norm(s) -> str:
    return str(s or "").lower().replace("ё", "е")


def option_price_ranges(text: str) -> list[tuple[float, float]]:
    text = str(text or "")
    out = []
    for lo, hi in _USD_RANGE_RE.findall(text):
        out.append((round(float(lo.replace(",", ".")), 2), round(float(hi.replace(",", ".")), 2)))
    rest = _USD_RANGE_RE.sub(" ", text)
    for one in _USD_ONE_RE.findall(rest):
        v = round(float(one.replace(",", ".")), 2)
        out.append((v, v))
    return out


def _tier_kind(text) -> str:
    t = _norm(text)
    return "набор" if "набор" in t else "украшение" if "украшен" in t else ""


def parse_price_tiers(text: str) -> list[tuple[str, float, float, int]]:
    """Строки вариантов лота → [(вид, $ с Nitro, $ без Nitro, +₽)]. Без $-диапазона или
    без «(+N ₽)» — пропуск. Формат как в UchetFP:
    «НАБОР с ценой · 390₽ – 450₽ (8,99$ – 10,99$)(+489 ₽)»."""
    out = []
    for line in str(text or "").splitlines():
        rng = option_price_ranges(line)
        m = _TIER_RUB_RE.search(line)
        if not rng or not m:
            continue
        rub = int(float(re.sub(r"[\s ]", "", m.group(1)).replace(",", ".")))
        out.append((_tier_kind(line), rng[0][0], rng[0][1], rub))
    return out


def tier_kind_of(code_rec: dict) -> str:
    return "набор" if code_rec.get("kind") == "set" else "украшение"


def price_rub(code_rec: dict, tiers: list, base_rub: int) -> int | None:
    """Цена кода в ₽: вариант того же вида с нижней границей = цене Discord (с Nitro).
    Нет варианта или товар не продаётся за деньги → None (товар скрыт)."""
    usd = code_rec.get("price_usd")
    if not usd or not code_rec.get("expected_tzs"):
        return None
    kind = tier_kind_of(code_rec)
    hits = [t[3] for t in tiers if abs(t[1] - float(usd)) < 0.005 and (not t[0] or t[0] == kind)]
    return base_rub + min(hits) if hits else None


# ── Настройки ───────────────────────────────────────────────────────────────


async def _get(db: AsyncSession, key: str) -> str | None:
    row = await db.get(ShopSettings, key)
    return row.value if row else None


async def _set(db: AsyncSession, key: str, value: str, description: str = "") -> None:
    row = await db.get(ShopSettings, key)
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=key, value=value, description=description))


async def get_settings_view(db: AsyncSession) -> dict:
    tiers_text = await _get(db, K_TIERS) or ""
    try:
        status = json.loads(await _get(db, K_STATUS) or "{}")
    except ValueError:
        status = {}
    return {
        "price_tiers": tiers_text,
        "tiers_parsed": len(parse_price_tiers(tiers_text)),
        "base_rub": int(await _get(db, K_BASE) or 0),
        "status": status,
        "catalog_dir_ok": os.path.isfile(os.path.join(settings.DECOR_CATALOG_DIR, "codes.json")),
        "site_url": settings.DECOR_SITE_URL,
    }


async def update_settings(db: AsyncSession, *, price_tiers: str | None, base_rub: int | None) -> None:
    if price_tiers is not None:
        await _set(db, K_TIERS, price_tiers.strip()[:20000], "Украшения Discord: таблица цен (формат лота GGSel)")
    if base_rub is not None:
        await _set(db, K_BASE, str(max(0, int(base_rub))), "Украшения Discord: базовая цена лота, ₽")
    await _set(db, K_SIG, "")   # цены поменялись — следующая синхронизация пересчитает всё
    await db.flush()


# ── Источники ───────────────────────────────────────────────────────────────


def _read_catalog() -> tuple[dict, dict]:
    d = settings.DECOR_CATALOG_DIR
    with open(os.path.join(d, "codes.json"), encoding="utf-8") as f:
        codes = json.load(f)
    with open(os.path.join(d, "catalog2.json"), encoding="utf-8") as f:
        cat2 = json.load(f)
    return codes, cat2


def _fetch_site_media() -> dict[str, dict]:
    """discordcatalog.net: код → {img, hex, en, color_en}. Ошибка — пустой словарь
    (картинки останутся прежними)."""
    try:
        r = httpx.get(settings.DECOR_SITE_URL.rstrip("/") + "/", timeout=20,
                      headers={"User-Agent": "reDonate-catalog-sync"})
        r.raise_for_status()
        s = r.text
        i = s.index("const DATA = ") + len("const DATA = ")
        data, _ = json.JSONDecoder().raw_decode(s[i:])
    except Exception as e:  # noqa: BLE001 — сайт недоступен: синхронизируем без картинок
        logger.warning("decor: данные сайта недоступны: %s", e)
        return {}
    out: dict[str, dict] = {}
    for it in data.get("items") or []:
        try:
            _coll, _name, _type, variants, en = it[0], it[1], it[2], it[3], (it[4] if len(it) > 4 else "")
        except (IndexError, TypeError):
            continue
        for v in variants or []:
            if not v or not v[0]:
                continue
            out[str(v[0])] = {
                "img": v[2] if len(v) > 2 else "",
                "hex": v[3] if len(v) > 3 else "",
                "color_en": v[6] if len(v) > 6 else "",
                "en": en or "",
            }
    return out


# ── Синхронизация ───────────────────────────────────────────────────────────


async def _ensure_game(db: AsyncSession) -> Game:
    games = (await db.execute(select(Game))).scalars().all()
    game = next((g for g in games if (g.meta or {}).get("decor_catalog")), None)
    if game is None:
        game = next((g for g in games if g.slug == GAME_SLUG), None)
    if game is None:
        game = Game(name=GAME_NAME, slug=GAME_SLUG, type="service", is_active=False, sort_order=0,
                    description="Декорации аватара, эффекты и рамки профиля, бейджики и наборы — "
                                "подарком на ваш аккаунт Discord. Nitro не нужен.",
                    meta={"decor_catalog": True}, tags=[], input_fields=[])
        db.add(game)
        await db.flush()
    elif not (game.meta or {}).get("decor_catalog"):
        game.meta = {**(game.meta or {}), "decor_catalog": True}
    return game


def _product_name(rec: dict) -> str:
    name = str(rec.get("name") or rec.get("code"))
    return f"{name} · {rec['color']}" if rec.get("color") else name


async def sync(db: AsyncSession, *, force: bool = False) -> dict:
    """Приводит товары reDonate к каталогу. Возвращает и сохраняет статус."""
    status: dict = {"at": datetime.now(timezone.utc).isoformat(), "error": ""}
    try:
        codes_doc, cat2 = _read_catalog()
    except (OSError, ValueError) as e:
        status["error"] = f"каталог не прочитан: {e}"
        await _set(db, K_STATUS, json.dumps(status, ensure_ascii=False))
        await db.flush()
        return status

    tiers_text = await _get(db, K_TIERS) or ""
    tiers = parse_price_tiers(tiers_text)
    base = int(await _get(db, K_BASE) or 0)
    media = await asyncio.to_thread(_fetch_site_media)

    sig_src = json.dumps([codes_doc.get("count"), len(codes_doc.get("codes") or []), tiers, base,
                          sorted(media)[:5], len(media)], ensure_ascii=False)
    sig = hashlib.sha1((sig_src + json.dumps(codes_doc, sort_keys=True)[:2_000_000]).encode()).hexdigest()
    if not force and sig == (await _get(db, K_SIG) or ""):
        prev = json.loads(await _get(db, K_STATUS) or "{}")
        return {**prev, "skipped": True}

    game = await _ensure_game(db)
    coll_order = {c["name"]: c.get("ordinal", i) for i, c in enumerate(cat2.get("collections") or [])}
    cats = {c.name: c for c in (await db.execute(select(Category).where(Category.game_id == game.id))).scalars()}
    products = (await db.execute(
        select(Product).join(Category, Category.id == Product.category_id).where(Category.game_id == game.id)
    )).scalars().all()
    by_code = {str((p.meta or {}).get("decor", {}).get("code")): p for p in products if (p.meta or {}).get("decor")}

    created = updated = hidden = 0
    unpriced: dict[tuple, int] = {}
    seen: set[str] = set()
    no_image = 0

    for rec in codes_doc.get("codes") or []:
        code = str(rec.get("code") or "")
        if not code:
            continue
        seen.add(code)
        coll = str(rec.get("collection") or "Без коллекции")
        cat = cats.get(coll)
        if cat is None:
            from shared.slug import slugify_latin
            cat = Category(game_id=game.id, name=coll[:128],
                           slug=(slugify_latin(coll) or f"c{len(cats)}")[:60] + f"-{len(cats)}",
                           sort_order=coll_order.get(coll, 999), is_active=True)
            db.add(cat)
            await db.flush()
            cats[coll] = cat
        else:
            cat.sort_order = coll_order.get(coll, cat.sort_order)

        m = media.get(code) or {}
        prev_decor = (by_code.get(code).meta or {}).get("decor", {}) if code in by_code else {}
        img = m.get("img") or prev_decor.get("img") or ""
        if not img and rec.get("expected_tzs"):   # считаем только продаваемые (Orbs/бесплатные — не в счёт)
            no_image += 1
        decor = {
            "code": code, "name": rec.get("name") or code, "sku": str(rec.get("sku") or ""),
            "kind": rec.get("kind"),
            "type": rec.get("type_label") or "", "color": rec.get("color"),
            "collection": coll, "index": rec.get("index", 0),
            "price_usd": rec.get("price_usd"), "expected_tzs": rec.get("expected_tzs"),
            "img": img, "hex": m.get("hex") or prev_decor.get("hex") or "",
            "en": m.get("en") or prev_decor.get("en") or "",
            "color_en": m.get("color_en") or prev_decor.get("color_en") or "",
        }
        rub = price_rub(rec, tiers, base)
        if rub is None and rec.get("expected_tzs"):
            key = (tier_kind_of(rec), rec.get("price_usd"))
            unpriced[key] = unpriced.get(key, 0) + 1
        sellable = rub is not None
        p = by_code.get(code)
        if p is None:
            p = Product(
                category_id=cat.id, name=_product_name(rec)[:256],
                price=Decimal(rub or 0), price_usd=None, delivery_type=DeliveryType.manual,
                input_fields=[], is_active=sellable, sort_order=int(rec.get("index") or 0),
                meta={"decor": decor},
            )
            db.add(p)
            created += 1
        else:
            p.category_id = cat.id
            p.name = _product_name(rec)[:256]
            if sellable:
                p.price = Decimal(rub)
            p.price_usd = None
            p.sort_order = int(rec.get("index") or 0)
            p.is_active = sellable
            p.meta = {**(p.meta or {}), "decor": decor}
            updated += 1
        if not sellable:
            hidden += 1

    for code, p in by_code.items():
        if code not in seen and p.is_active:
            p.is_active = False    # пропал из каталога — скрываем (заказы и история остаются)
            hidden += 1

    status.update({
        "codes": len(seen), "created": created, "updated": updated, "hidden": hidden,
        "collections": len(cats), "no_image": no_image, "site_ok": bool(media),
        "tiers": len(tiers), "game_id": str(game.id), "game_active": bool(game.is_active),
        "unpriced": [{"kind": k[0], "price_usd": k[1], "count": n}
                     for k, n in sorted(unpriced.items(), key=lambda x: (x[0][0], x[0][1] or 0))],
    })
    await _set(db, K_STATUS, json.dumps(status, ensure_ascii=False))
    await _set(db, K_SIG, sig)
    await db.flush()
    _PUBLIC_CACHE.clear()
    return status


# ── Публичная витрина ───────────────────────────────────────────────────────

_PUBLIC_CACHE: dict[str, tuple[float, dict]] = {}
PUBLIC_TTL = 120.0


async def public_catalog(db: AsyncSession) -> dict | None:
    """Всё для страницы-каталога одним ответом (≈1700 позиций, компактно)."""
    import time
    hit = _PUBLIC_CACHE.get("v")
    if hit and time.time() - hit[0] < PUBLIC_TTL:
        return hit[1]
    games = (await db.execute(select(Game).where(Game.is_active.is_(True)))).scalars().all()
    game = next((g for g in games if (g.meta or {}).get("decor_catalog")), None)
    if game is None:
        return None
    cats = (await db.execute(
        select(Category).where(Category.game_id == game.id, Category.is_active.is_(True))
        .order_by(Category.sort_order, Category.name)
    )).scalars().all()
    cat_ids = [c.id for c in cats]
    products = (await db.execute(
        select(Product).where(Product.category_id.in_(cat_ids), Product.is_active.is_(True))
        .order_by(Product.sort_order)
    )).scalars().all() if cat_ids else []
    site = settings.DECOR_SITE_URL.rstrip("/")
    types = [t for t in TYPE_ORDER]
    items = []
    for p in products:
        d = (p.meta or {}).get("decor") or {}
        t = str(d.get("type") or "")
        if t and t not in types:
            types.append(t)
        items.append({
            # i — номер товара в коллекции: цветовые варианты одного украшения
            # делят его, разные типы с одним названием — нет (как в Discord)
            "id": str(p.id), "c": str(p.category_id), "i": d.get("index"), "code": d.get("code"),
            "name": d.get("name") or p.name.split(" · ")[0], "en": d.get("en") or "",
            "t": types.index(t) if t in types else -1, "color": d.get("color") or "",
            "hex": d.get("hex") or "", "img": f"{site}/img/{d['img']}" if d.get("img") else "",
            "price": float(p.price), "out": bool(p.is_out_of_stock),
        })
    data = {
        "game": {"id": str(game.id), "slug": game.slug, "name": game.name},
        "collections": [{"id": str(c.id), "name": c.name} for c in cats],
        "types": types,
        "items": items,
    }
    _PUBLIC_CACHE["v"] = (time.time(), data)
    return data
