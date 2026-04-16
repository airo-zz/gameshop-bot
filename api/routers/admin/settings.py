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
from api.utils.admin_log import log_admin_action
from shared.models import LoyaltyLevel, ShopSettings

router = APIRouter()

REFERRAL_BONUS_KEY = "referral_bonus_amount"
REFERRAL_BONUS_DEFAULT = Decimal("100")


# ── Pydantic schemas ──────────────────────────────────────────────────────────


class LoyaltyLevelOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    min_spent: float
    min_orders: int
    discount_percent: float
    cashback_percent: float
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
    bonus_amount: float
    description: str


class ReferralSettingsUpdateIn(BaseModel):
    bonus_amount: float = Field(..., gt=0, le=100_000)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _level_to_out(level: LoyaltyLevel) -> LoyaltyLevelOut:
    return LoyaltyLevelOut(
        id=level.id,
        name=level.name,
        min_spent=float(level.min_spent),
        min_orders=level.min_orders,
        discount_percent=float(level.discount_percent),
        cashback_percent=float(level.cashback_percent),
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


# ── GET /settings/referral — текущий реферальный бонус ───────────────────────


@router.get(
    "/referral",
    response_model=ReferralSettingsOut,
    dependencies=[require_permission("settings.view")],
)
async def get_referral_settings(
    db: DbSession,
    admin: CurrentAdmin,
) -> ReferralSettingsOut:
    """Возвращает текущую сумму реферального бонуса."""
    row = await _get_setting(db, REFERRAL_BONUS_KEY)
    amount = Decimal(row.value) if row else REFERRAL_BONUS_DEFAULT
    return ReferralSettingsOut(
        bonus_amount=float(amount),
        description=(
            row.description
            if row and row.description
            else "Сумма в ₽, начисляемая рефереру при первой оплате реферала"
        ),
    )


# ── PATCH /settings/referral — обновить реферальный бонус ────────────────────


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
    """Обновляет сумму реферального бонуса."""
    row = await _get_setting(db, REFERRAL_BONUS_KEY)
    new_value = str(Decimal(str(body.bonus_amount)))

    before_amount = float(Decimal(row.value)) if row else float(REFERRAL_BONUS_DEFAULT)

    if row:
        row.value = new_value
    else:
        row = ShopSettings(
            key=REFERRAL_BONUS_KEY,
            value=new_value,
            description="Сумма в ₽, начисляемая рефереру при первой оплате реферала",
        )
        db.add(row)

    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="shop_settings.update",
        entity_type="shop_settings",
        entity_id=None,
        before_data={"referral_bonus_amount": before_amount},
        after_data={"referral_bonus_amount": body.bonus_amount},
    )

    return ReferralSettingsOut(
        bonus_amount=float(Decimal(row.value)),
        description=row.description or "",
    )
