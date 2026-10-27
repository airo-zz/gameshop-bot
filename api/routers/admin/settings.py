"""
api/routers/admin/settings.py
─────────────────────────────────────────────────────────────────────────────
Управление настройками магазина:
  - CRUD для уровней лояльности (LoyaltyLevel)
  - Чтение/обновление суммы реферального бонуса (ShopSettings)
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.services.rapira_service import (
    MARKUP_KEYS,
    RATE_UPDATED_KEY,
    get_all_markups,
    get_usd_rub_rate,
)
from api.services.fragment_config import get_admin_view, update_config
from api.services.loyalty_service import (
    REFERRAL_DISCOUNT_KEY, REFERRAL_MONTHS_KEY, REFERRAL_PERCENT_KEY, LoyaltyService,
)
from api.utils.admin_log import log_admin_action
from shared.models import LoyaltyLevel, ShopSettings

router = APIRouter()



# ── Pydantic schemas ──────────────────────────────────────────────────────────


class LoyaltyLevelOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    min_spent: float
    min_orders: int
    discount_percent: float
    cashback_percent: float
    monthly_cashback_cap: float | None
    priority: int
    is_active: bool
    color_hex: str
    icon_emoji: str
    description: str | None


class LoyaltyLevelCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)
    min_spent: float = Field(0, ge=0)
    min_orders: int = Field(0, ge=0)
    discount_percent: float = Field(0, ge=0, le=100)
    cashback_percent: float = Field(0, ge=0, le=100)
    monthly_cashback_cap: float | None = Field(None, ge=0)  # None — без потолка
    priority: int = Field(0, ge=0)
    is_active: bool = True
    color_hex: str = Field("#CD7F32", max_length=7)
    icon_emoji: str = Field("", max_length=8)
    description: str | None = None

    @field_validator("color_hex")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("color_hex должен быть в формате #RGB или #RRGGBB")
        return v


class LoyaltyLevelUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=32)
    min_spent: float | None = Field(None, ge=0)
    min_orders: int | None = Field(None, ge=0)
    discount_percent: float | None = Field(None, ge=0, le=100)
    cashback_percent: float | None = Field(None, ge=0, le=100)
    # Явный null снимает потолок; поле не передано — не меняем (см. model_fields_set)
    monthly_cashback_cap: float | None = Field(None, ge=0)
    priority: int | None = Field(None, ge=0)
    is_active: bool | None = None
    color_hex: str | None = Field(None, max_length=7)
    icon_emoji: str | None = Field(None, max_length=8)
    description: str | None = None

    @field_validator("color_hex")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and (not v.startswith("#") or len(v) not in (4, 7)):
            raise ValueError("color_hex должен быть в формате #RGB или #RRGGBB")
        return v


class ReferralSettingsOut(BaseModel):
    percent: float                    # % пригласившему с каждого заказа друга
    period_months: int                # сколько месяцев платим (0 — бессрочно)
    new_user_discount_percent: float  # скидка другу на первый заказ
    description: str


class ReferralSettingsUpdateIn(BaseModel):
    percent: float | None = Field(None, ge=0, le=50)
    period_months: int | None = Field(None, ge=0, le=120)
    new_user_discount_percent: float | None = Field(None, ge=0, le=90)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _level_to_out(level: LoyaltyLevel) -> LoyaltyLevelOut:
    return LoyaltyLevelOut(
        id=level.id,
        name=level.name,
        min_spent=float(level.min_spent),
        min_orders=level.min_orders,
        discount_percent=float(level.discount_percent),
        cashback_percent=float(level.cashback_percent),
        monthly_cashback_cap=(
            float(level.monthly_cashback_cap) if level.monthly_cashback_cap is not None else None
        ),
        priority=level.priority,
        is_active=level.is_active,
        color_hex=level.color_hex,
        icon_emoji=level.icon_emoji,
        description=level.description,
    )


async def _get_setting(db: DbSession, key: str) -> ShopSettings | None:
    result = await db.execute(select(ShopSettings).where(ShopSettings.key == key))
    return result.scalar_one_or_none()


# ── GET /settings/loyalty — список уровней лояльности ────────────────────────


@router.get(
    "/loyalty",
    response_model=list[LoyaltyLevelOut],
    dependencies=[require_permission("settings.view")],
)
async def list_loyalty_levels(
    db: DbSession,
    admin: CurrentAdmin,
) -> list[LoyaltyLevelOut]:
    """Все уровни лояльности, отсортированные по priority DESC."""
    result = await db.execute(
        select(LoyaltyLevel).order_by(LoyaltyLevel.priority.desc())
    )
    levels = result.scalars().all()
    return [_level_to_out(lv) for lv in levels]


# ── POST /settings/loyalty — создать уровень ─────────────────────────────────


@router.post(
    "/loyalty",
    response_model=LoyaltyLevelOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("settings.edit")],
)
async def create_loyalty_level(
    body: LoyaltyLevelCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> LoyaltyLevelOut:
    """Создаёт новый уровень лояльности."""
    level = LoyaltyLevel(
        name=body.name,
        min_spent=Decimal(str(body.min_spent)),
        min_orders=body.min_orders,
        discount_percent=Decimal(str(body.discount_percent)),
        cashback_percent=Decimal(str(body.cashback_percent)),
        monthly_cashback_cap=(
            Decimal(str(body.monthly_cashback_cap)) if body.monthly_cashback_cap is not None else None
        ),
        priority=body.priority,
        is_active=body.is_active,
        color_hex=body.color_hex,
        icon_emoji=body.icon_emoji,
        description=body.description,
    )
    db.add(level)
    await db.flush()
    await db.refresh(level)

    await log_admin_action(
        db=db,
        admin=admin,
        action="loyalty_level.create",
        entity_type="loyalty_level",
        entity_id=level.id,
        after_data={
            "name": level.name,
            "min_spent": float(level.min_spent),
            "discount_percent": float(level.discount_percent),
            "cashback_percent": float(level.cashback_percent),
            "priority": level.priority,
            "is_active": level.is_active,
        },
    )

    return _level_to_out(level)


# ── PATCH /settings/loyalty/{id} — обновить уровень ──────────────────────────


@router.patch(
    "/loyalty/{level_id}",
    response_model=LoyaltyLevelOut,
    dependencies=[require_permission("settings.edit")],
)
async def update_loyalty_level(
    level_id: uuid.UUID,
    body: LoyaltyLevelUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> LoyaltyLevelOut:
    """Частичное обновление уровня лояльности."""
    result = await db.execute(select(LoyaltyLevel).where(LoyaltyLevel.id == level_id))
    level = result.scalar_one_or_none()
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уровень лояльности не найден",
        )

    before_data = {
        "name": level.name,
        "discount_percent": float(level.discount_percent),
        "cashback_percent": float(level.cashback_percent),
        "is_active": level.is_active,
    }

    if body.name is not None:
        level.name = body.name
    if body.min_spent is not None:
        level.min_spent = Decimal(str(body.min_spent))
    if body.min_orders is not None:
        level.min_orders = body.min_orders
    if body.discount_percent is not None:
        level.discount_percent = Decimal(str(body.discount_percent))
    if body.cashback_percent is not None:
        level.cashback_percent = Decimal(str(body.cashback_percent))
    if "monthly_cashback_cap" in body.model_fields_set:
        level.monthly_cashback_cap = (
            Decimal(str(body.monthly_cashback_cap)) if body.monthly_cashback_cap is not None else None
        )
    if body.priority is not None:
        level.priority = body.priority
    if body.is_active is not None:
        level.is_active = body.is_active
    if body.color_hex is not None:
        level.color_hex = body.color_hex
    if body.icon_emoji is not None:
        level.icon_emoji = body.icon_emoji
    if body.description is not None:
        level.description = body.description

    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="loyalty_level.update",
        entity_type="loyalty_level",
        entity_id=level.id,
        before_data=before_data,
        after_data={
            "name": level.name,
            "discount_percent": float(level.discount_percent),
            "cashback_percent": float(level.cashback_percent),
            "is_active": level.is_active,
        },
    )

    return _level_to_out(level)


# ── DELETE /settings/loyalty/{id} — удалить уровень ──────────────────────────


@router.delete(
    "/loyalty/{level_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("settings.edit")],
)
async def delete_loyalty_level(
    level_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    """Удаляет уровень лояльности. Пользователи с этим уровнем получат loyalty_level_id=NULL."""
    result = await db.execute(select(LoyaltyLevel).where(LoyaltyLevel.id == level_id))
    level = result.scalar_one_or_none()
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уровень лояльности не найден",
        )

    await log_admin_action(
        db=db,
        admin=admin,
        action="loyalty_level.delete",
        entity_type="loyalty_level",
        entity_id=level.id,
        before_data={"name": level.name, "priority": level.priority},
    )

    await db.delete(level)


# ── GET /settings/referral — настройки реферальной программы ─────────────────


_REFERRAL_FIELDS = {
    # поле API → ключ shop_settings, описание
    "percent": (REFERRAL_PERCENT_KEY, "% пригласившему с каждого выполненного заказа друга"),
    "period_months": (
        REFERRAL_MONTHS_KEY, "Сколько месяцев с регистрации друга начисляется процент (0 — бессрочно)",
    ),
    "new_user_discount_percent": (
        REFERRAL_DISCOUNT_KEY, "Скидка в % на первый заказ приглашённому",
    ),
}


async def _referral_out(db: DbSession) -> ReferralSettingsOut:
    cfg = await LoyaltyService(db).get_referral_settings()
    return ReferralSettingsOut(
        percent=float(cfg[REFERRAL_PERCENT_KEY]),
        period_months=int(cfg[REFERRAL_MONTHS_KEY]),
        new_user_discount_percent=float(cfg[REFERRAL_DISCOUNT_KEY]),
        description=(
            "Пригласивший получает процент с каждого выполненного заказа друга на баланс "
            "в течение заданного срока с регистрации друга. Друг получает скидку на первый заказ."
        ),
    )


@router.get(
    "/referral",
    response_model=ReferralSettingsOut,
    dependencies=[require_permission("settings.view")],
)
async def get_referral_settings(
    db: DbSession,
    admin: CurrentAdmin,
) -> ReferralSettingsOut:
    return await _referral_out(db)


# ── PATCH /settings/referral — обновить настройки рефералки ──────────────────


@router.patch(
    "/referral",
    response_model=ReferralSettingsOut,
    dependencies=[require_permission("settings.edit")],
)
async def update_referral_settings(
    body: ReferralSettingsUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> ReferralSettingsOut:
    before = (await _referral_out(db)).model_dump(exclude={"description"})

    for field, (key, description) in _REFERRAL_FIELDS.items():
        value = getattr(body, field)
        if value is None:
            continue
        row = await _get_setting(db, key)
        if row:
            row.value = str(Decimal(str(value)))
        else:
            db.add(ShopSettings(key=key, value=str(Decimal(str(value))), description=description))
    await db.flush()

    out = await _referral_out(db)
    await log_admin_action(
        db=db,
        admin=admin,
        action="shop_settings.update",
        entity_type="shop_settings",
        entity_id=None,
        before_data=before,
        after_data=out.model_dump(exclude={"description"}),
    )
    return out


# ── Ценообразование (USD-курс RAPIRA + наценка платёжки) ─────────────────────


class PricingOut(BaseModel):
    usd_rub_rate: float
    usd_rub_rate_updated_at: str | None
    markup_crypto: float   # база показа (крипта)
    markup_card: float     # карта / SberPay
    markup_sbp: float      # СБП НСПК
    markup_balance: float  # баланс (обычно 0)


class PricingUpdateIn(BaseModel):
    markup_crypto: float = Field(..., ge=0, le=100)
    markup_card: float = Field(..., ge=0, le=100)
    markup_sbp: float = Field(..., ge=0, le=100)
    markup_balance: float = Field(..., ge=0, le=100)


@router.get(
    "/pricing",
    response_model=PricingOut,
    dependencies=[require_permission("settings.view")],
)
async def get_pricing_settings(db: DbSession, admin: CurrentAdmin) -> PricingOut:
    """Курс USD/RUB (RAPIRA) и наценки по группам методов оплаты."""
    rate = await get_usd_rub_rate(db)
    markups = await get_all_markups(db)
    updated = await _get_setting(db, RATE_UPDATED_KEY)
    return PricingOut(
        usd_rub_rate=float(rate),
        usd_rub_rate_updated_at=updated.value if updated else None,
        markup_crypto=markups["crypto"],
        markup_card=markups["card"],
        markup_sbp=markups["sbp"],
        markup_balance=markups["balance"],
    )


@router.patch(
    "/pricing",
    response_model=PricingOut,
    dependencies=[require_permission("settings.edit")],
)
async def update_pricing_settings(
    body: PricingUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> PricingOut:
    """Обновляет наценки крипта/баланс и карта (%). Курс тянется автоматически."""
    async def _set(key: str, value: float, desc: str) -> None:
        row = await _get_setting(db, key)
        if row:
            row.value = str(Decimal(str(value)))
        else:
            db.add(ShopSettings(key=key, value=str(Decimal(str(value))), description=desc))

    await _set(MARKUP_KEYS["crypto"], body.markup_crypto, "Наценка крипта, %")
    await _set(MARKUP_KEYS["card"], body.markup_card, "Наценка карта/SberPay, %")
    await _set(MARKUP_KEYS["sbp"], body.markup_sbp, "Наценка СБП НСПК, %")
    await _set(MARKUP_KEYS["balance"], body.markup_balance, "Наценка баланс, %")
    await db.flush()

    # Пересчитываем ₽-цену показа для всех USD-товаров под наценку группы показа
    # (по умолчанию balance = 0 → база без наценки). Наценка метода добавляется
    # на оплате, а не в каталоге.
    from decimal import Decimal as _D

    from sqlalchemy import select as _select

    from api.services.pricing import has_quantity_field, usd_to_rub
    from api.services.rapira_service import DISPLAY_GROUP
    from shared.models import Product

    rate_now = float(await get_usd_rub_rate(db))
    display_markup = {
        "crypto": body.markup_crypto, "card": body.markup_card,
        "sbp": body.markup_sbp, "balance": body.markup_balance,
    }[DISPLAY_GROUP]
    products = (await db.execute(_select(Product).where(Product.price_usd.is_not(None)))).scalars().all()
    for p in products:
        round_nine = not has_quantity_field(p.input_fields)
        p.price = _D(str(usd_to_rub(float(p.price_usd), rate_now, display_markup, round_nine)))

    await log_admin_action(
        db=db, admin=admin, action="shop_settings.update",
        entity_type="shop_settings", entity_id=None,
        after_data={
            "markup_crypto": body.markup_crypto, "markup_card": body.markup_card,
            "markup_sbp": body.markup_sbp, "markup_balance": body.markup_balance,
        },
    )

    rate = await get_usd_rub_rate(db)
    updated = await _get_setting(db, RATE_UPDATED_KEY)
    return PricingOut(
        usd_rub_rate=float(rate),
        usd_rub_rate_updated_at=updated.value if updated else None,
        markup_crypto=body.markup_crypto,
        markup_card=body.markup_card,
        markup_sbp=body.markup_sbp,
        markup_balance=body.markup_balance,
    )


# ── Интеграции: Fragment (Stars/Premium автопополнение) ─────────────────────


class IntegrationsOut(BaseModel):
    enabled: bool
    ssid_set: bool
    ssid_masked: str
    token_set: bool
    token_masked: str
    ton_token_set: bool
    ton_token_masked: str
    seed_set: bool
    seed_masked: str
    payment_method: str
    stars_min: int
    stars_max: int
    show_sender: bool


class IntegrationsUpdateIn(BaseModel):
    enabled: bool | None = None
    # Три куки fragment.com (пусто/не передано = не менять). Можно вставлять
    # как значение, так и «имя=значение» — бэк очистит префикс.
    stel_ssid: str | None = None
    stel_token: str | None = None
    stel_ton_token: str | None = None
    ton_seed: str | None = None    # пусто/не передано = не менять
    payment_method: str | None = Field(None, pattern="^(ton|usdt_ton)$")
    stars_min: int | None = Field(None, ge=1)
    stars_max: int | None = Field(None, ge=1)
    show_sender: bool | None = None


@router.get(
    "/integrations",
    response_model=IntegrationsOut,
    dependencies=[require_permission("settings.view")],
)
async def get_integrations(db: DbSession, admin: CurrentAdmin) -> IntegrationsOut:
    return IntegrationsOut(**await get_admin_view(db))


@router.patch(
    "/integrations",
    response_model=IntegrationsOut,
    dependencies=[require_permission("settings.edit")],
)
async def update_integrations(
    body: IntegrationsUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> IntegrationsOut:
    await update_config(
        db,
        enabled=body.enabled,
        stel_ssid=body.stel_ssid,
        stel_token=body.stel_token,
        stel_ton_token=body.stel_ton_token,
        ton_seed=body.ton_seed,
        payment_method=body.payment_method,
        stars_min=body.stars_min,
        stars_max=body.stars_max,
        show_sender=body.show_sender,
    )
    # В лог НЕ пишем секреты — только факт изменения
    await log_admin_action(
        db=db, admin=admin, action="shop_settings.integrations_update",
        entity_type="shop_settings", entity_id=None,
        after_data={"enabled": body.enabled, "payment_method": body.payment_method},
    )
    return IntegrationsOut(**await get_admin_view(db))


# ── Главная сайта: какие игры и разделы в блоках ─────────────────────────────


class HomeBannerIO(BaseModel):
    image_url: str = Field(max_length=500)
    title: str = Field(default="", max_length=120)
    subtitle: str = Field(default="", max_length=240)
    button: str = Field(default="", max_length=40)
    link: str = Field(default="", max_length=500)
    is_active: bool = True


class HomeBlocksIO(BaseModel):
    hero_game_ids: list[uuid.UUID] = Field(default_factory=list, max_length=6)
    popular_category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=8)
    banners: list[HomeBannerIO] = Field(default_factory=list, max_length=8)


@router.get("/home", response_model=HomeBlocksIO, dependencies=[require_permission("settings.view")])
async def get_home_blocks(db: DbSession, admin: CurrentAdmin) -> HomeBlocksIO:
    from api.services.home_service import get_banners, get_config

    cfg = await get_config(db)
    return HomeBlocksIO(hero_game_ids=cfg["hero"], popular_category_ids=cfg["popular"],
                        banners=await get_banners(db))


@router.put("/home", response_model=HomeBlocksIO, dependencies=[require_permission("settings.edit")])
async def update_home_blocks(body: HomeBlocksIO, db: DbSession, admin: CurrentAdmin) -> HomeBlocksIO:
    from api.services.home_service import get_banners, get_config, set_banners, set_config

    await set_config(db, body.hero_game_ids, body.popular_category_ids)
    await set_banners(db, [b.model_dump() for b in body.banners])
    await log_admin_action(
        db=db, admin=admin, action="shop_settings.home_update",
        entity_type="shop_settings", entity_id=None,
        after_data={"hero": [str(i) for i in body.hero_game_ids],
                    "popular": [str(i) for i in body.popular_category_ids],
                    "banners": len(body.banners)},
    )
    cfg = await get_config(db)
    return HomeBlocksIO(hero_game_ids=cfg["hero"], popular_category_ids=cfg["popular"],
                        banners=await get_banners(db))
