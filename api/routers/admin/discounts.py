"""
api/routers/admin/discounts.py
─────────────────────────────────────────────────────────────────────────────
Управление правилами скидок и промокодами в администраторской панели.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.schemas.admin import (
    DiscountRuleCreateIn,
    DiscountRuleOut,
    DiscountRuleUpdateIn,
    PromoCodeOut,
    PromoCreateIn,
    PromoCreateDirectIn,
    PromoUpdateIn,
)
from api.utils.admin_log import log_admin_action
from shared.models.discount import DiscountRule, DiscountType, DiscountValueType, PromoCode

router = APIRouter()


def _parse_datetime(value: str | None, field_name: str) -> datetime | None:
    """Парсит ISO-8601 строку в datetime с timezone. None пропускается."""
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неверный формат даты в поле '{field_name}': ожидается ISO-8601",
        )


def _validate_discount_type(value: str) -> DiscountType:
    try:
        return DiscountType(value)
    except ValueError:
        allowed = [t.value for t in DiscountType]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неверный тип скидки: '{value}'. Допустимые: {allowed}",
        )


def _validate_value_type(value: str) -> DiscountValueType:
    try:
        return DiscountValueType(value)
    except ValueError:
        allowed = [t.value for t in DiscountValueType]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неверный тип значения скидки: '{value}'. Допустимые: {allowed}",
        )


def _rule_to_out(rule: DiscountRule) -> DiscountRuleOut:
    return DiscountRuleOut(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        type=rule.type.value,
        target_id=rule.target_id,
        discount_value_type=rule.discount_value_type.value,
        discount_value=float(rule.discount_value),
        min_order_amount=float(rule.min_order_amount),
        max_discount_amount=float(rule.max_discount_amount) if rule.max_discount_amount is not None else None,
        stackable=rule.stackable,
        priority=rule.priority,
        starts_at=rule.starts_at,
        ends_at=rule.ends_at,
        is_active=rule.is_active,
        usage_limit=rule.usage_limit,
        usage_count=rule.usage_count,
        created_at=rule.created_at,
    )


def _promo_to_out(promo: PromoCode) -> PromoCodeOut:
    return PromoCodeOut(
        id=promo.id,
        code=promo.code,
        discount_rule_id=promo.discount_rule_id,
        discount_rule_name=promo.discount_rule.name,
        max_uses=promo.max_uses,
        used_count=promo.used_count,
        per_user_limit=promo.per_user_limit,
        is_active=promo.is_active,
        expires_at=promo.expires_at,
        created_at=promo.created_at,
    )


# ── GET / — список правил скидок ──────────────────────────────────────────────


@router.get("", response_model=list[DiscountRuleOut],
            dependencies=[require_permission("discounts.view")])
async def list_discount_rules(
    db: DbSession,
    admin: CurrentAdmin,
) -> list[DiscountRuleOut]:
    """Все правила скидок, отсортированные по priority DESC."""
    result = await db.execute(
        select(DiscountRule).order_by(DiscountRule.priority.desc())
    )
    rules = result.scalars().all()
    return [_rule_to_out(r) for r in rules]


# ── POST / — создать правило скидки ───────────────────────────────────────────


@router.post("", response_model=DiscountRuleOut, status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("discounts.create")])
async def create_discount_rule(
    body: DiscountRuleCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> DiscountRuleOut:
    """Создаёт новое правило скидки."""
    discount_type = _validate_discount_type(body.type)
    value_type = _validate_value_type(body.discount_value_type)
    starts_at = _parse_datetime(body.starts_at, "starts_at")
    ends_at = _parse_datetime(body.ends_at, "ends_at")

    target_id: uuid.UUID | None = None
    if body.target_id is not None:
        try:
            target_id = uuid.UUID(body.target_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_id должен быть валидным UUID",
            )

    rule = DiscountRule(
        name=body.name,
        description=body.description,
        type=discount_type,
        target_id=target_id,
        discount_value_type=value_type,
        discount_value=body.discount_value,
        min_order_amount=body.min_order_amount if body.min_order_amount is not None else 0,
        max_discount_amount=body.max_discount_amount,
        stackable=body.stackable,
        priority=body.priority,
        starts_at=starts_at,
        ends_at=ends_at,
        is_active=body.is_active,
        usage_limit=body.usage_limit,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    await log_admin_action(
        db=db,
        admin=admin,
        action="discount_rule.create",
        entity_type="discount_rule",
        entity_id=rule.id,
        after_data={
            "name": rule.name,
            "type": rule.type.value,
            "discount_value_type": rule.discount_value_type.value,
            "discount_value": float(rule.discount_value),
            "is_active": rule.is_active,
        },
    )

    return _rule_to_out(rule)


# ── PATCH /{rule_id} — обновить правило скидки ────────────────────────────────


@router.patch("/{rule_id}", response_model=DiscountRuleOut,
              dependencies=[require_permission("discounts.edit")])
async def update_discount_rule(
    rule_id: uuid.UUID,
    body: DiscountRuleUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> DiscountRuleOut:
    """Частичное обновление правила скидки."""
    result = await db.execute(select(DiscountRule).where(DiscountRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Правило скидки не найдено")

    before_data = {
        "name": rule.name,
        "type": rule.type.value,
        "is_active": rule.is_active,
        "priority": rule.priority,
    }

    if body.name is not None:
        rule.name = body.name
    if body.description is not None:
        rule.description = body.description
    if body.type is not None:
        rule.type = _validate_discount_type(body.type)
    if body.target_id is not None:
        try:
            rule.target_id = uuid.UUID(body.target_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_id должен быть валидным UUID",
            )
    if body.discount_value_type is not None:
        rule.discount_value_type = _validate_value_type(body.discount_value_type)
    if body.discount_value is not None:
        rule.discount_value = body.discount_value
    if body.min_order_amount is not None:
        rule.min_order_amount = body.min_order_amount
    if body.max_discount_amount is not None:
        rule.max_discount_amount = body.max_discount_amount
    if body.stackable is not None:
        rule.stackable = body.stackable
    if body.priority is not None:
        rule.priority = body.priority
    if body.starts_at is not None:
        rule.starts_at = _parse_datetime(body.starts_at, "starts_at")
    if body.ends_at is not None:
        rule.ends_at = _parse_datetime(body.ends_at, "ends_at")
    if body.is_active is not None:
        rule.is_active = body.is_active
    if body.usage_limit is not None:
        rule.usage_limit = body.usage_limit

    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="discount_rule.update",
        entity_type="discount_rule",
        entity_id=rule.id,
        before_data=before_data,
        after_data={
            "name": rule.name,
            "type": rule.type.value,
            "is_active": rule.is_active,
            "priority": rule.priority,
        },
    )

    return _rule_to_out(rule)


# ── GET /promos — список промокодов ───────────────────────────────────────────


@router.get("/promos", response_model=list[PromoCodeOut],
            dependencies=[require_permission("discounts.view")])
async def list_promos(
    db: DbSession,
    admin: CurrentAdmin,
) -> list[PromoCodeOut]:
    """Все промокоды с именем привязанного правила скидки."""
    result = await db.execute(
        select(PromoCode)
        .options(selectinload(PromoCode.discount_rule))
        .order_by(PromoCode.created_at.desc())
    )
    promos = result.scalars().all()
    return [_promo_to_out(p) for p in promos]


# ── POST /promos — создать промокод ───────────────────────────────────────────


@router.post("/promos", response_model=PromoCodeOut, status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("discounts.create")])
async def create_promo(
    body: PromoCreateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> PromoCodeOut:
    """Создаёт промокод. Code приводится к верхнему регистру, проверяется уникальность."""
    code_upper = body.code.strip().upper()

    # Проверка уникальности
    existing = await db.execute(select(PromoCode).where(PromoCode.code == code_upper))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Промокод '{code_upper}' уже существует",
        )

    # Проверка существования правила скидки
    try:
        rule_id = uuid.UUID(body.discount_rule_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="discount_rule_id должен быть валидным UUID",
        )

    rule_result = await db.execute(select(DiscountRule).where(DiscountRule.id == rule_id))
    rule = rule_result.scalar_one_or_none()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Правило скидки не найдено",
        )

    expires_at = _parse_datetime(body.expires_at, "expires_at")

    promo = PromoCode(
        code=code_upper,
        discount_rule_id=rule_id,
        max_uses=body.max_uses,
        per_user_limit=body.per_user_limit,
        is_active=body.is_active,
        expires_at=expires_at,
    )
    db.add(promo)
    await db.flush()
    await db.refresh(promo)

    # Подгружаем rule для ответа
    await db.refresh(promo, ["discount_rule"])

    await log_admin_action(
        db=db,
        admin=admin,
        action="promo_code.create",
        entity_type="promo_code",
        entity_id=promo.id,
        after_data={
            "code": promo.code,
            "discount_rule_id": str(rule_id),
            "discount_rule_name": rule.name,
            "max_uses": promo.max_uses,
            "is_active": promo.is_active,
        },
    )

    return _promo_to_out(promo)


# ── POST /promos/direct — создать промокод со встроенным DiscountRule ─────────


@router.post("/promos/direct", response_model=PromoCodeOut, status_code=status.HTTP_201_CREATED,
             dependencies=[require_permission("discounts.create")])
async def create_promo_direct(
    body: PromoCreateDirectIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> PromoCodeOut:
    """Создаёт DiscountRule типа 'promo' автоматически, затем привязывает промокод.
    Упрощённый интерфейс: не требует предварительного создания правила скидки."""
    code_upper = body.code.strip().upper()

    # Проверка уникальности кода
    existing = await db.execute(select(PromoCode).where(PromoCode.code == code_upper))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Промокод '{code_upper}' уже существует",
        )

    value_type = _validate_value_type(body.discount_value_type)

    # Автоматически создаём DiscountRule типа promo
    value_label = (
        f"{int(body.discount_value)}%"
        if value_type == DiscountValueType.percent
        else f"{int(body.discount_value)}₽"
    )
    rule_name = f"Промокод {code_upper} ({value_label})"

    rule = DiscountRule(
        name=rule_name,
        type=DiscountType.promo,
        discount_value_type=value_type,
        discount_value=body.discount_value,
        min_order_amount=body.min_order_amount if body.min_order_amount is not None else 0,
        max_discount_amount=body.max_discount_amount,
        stackable=False,
        priority=0,
        is_active=True,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    expires_at = _parse_datetime(body.expires_at, "expires_at")

    promo = PromoCode(
        code=code_upper,
        discount_rule_id=rule.id,
        max_uses=body.max_uses,
        per_user_limit=body.per_user_limit,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(promo)
    await db.flush()
    await db.refresh(promo)
    await db.refresh(promo, ["discount_rule"])

    await log_admin_action(
        db=db,
        admin=admin,
        action="promo_code.create",
        entity_type="promo_code",
        entity_id=promo.id,
        after_data={
            "code": promo.code,
            "discount_rule_id": str(rule.id),
            "discount_rule_name": rule.name,
            "discount_value_type": value_type.value,
            "discount_value": float(body.discount_value),
            "max_uses": promo.max_uses,
            "expires_at": body.expires_at,
        },
    )

    return _promo_to_out(promo)


# ── PATCH /promos/{promo_id} — обновить промокод ──────────────────────────────


@router.patch("/promos/{promo_id}", response_model=PromoCodeOut,
              dependencies=[require_permission("discounts.edit")])
async def update_promo(
    promo_id: uuid.UUID,
    body: PromoUpdateIn,
    db: DbSession,
    admin: CurrentAdmin,
) -> PromoCodeOut:
    """Частичное обновление промокода (без смены code и discount_rule_id)."""
    result = await db.execute(
        select(PromoCode)
        .options(selectinload(PromoCode.discount_rule))
        .where(PromoCode.id == promo_id)
    )
    promo = result.scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Промокод не найден")

    before_data = {"is_active": promo.is_active, "max_uses": promo.max_uses}

    if body.max_uses is not None:
        promo.max_uses = body.max_uses
    if body.per_user_limit is not None:
        promo.per_user_limit = body.per_user_limit
    if body.is_active is not None:
        promo.is_active = body.is_active
    if body.expires_at is not None:
        promo.expires_at = _parse_datetime(body.expires_at, "expires_at")

    await db.flush()

    await log_admin_action(
        db=db,
        admin=admin,
        action="promo_code.update",
        entity_type="promo_code",
        entity_id=promo.id,
        before_data=before_data,
        after_data={"is_active": promo.is_active, "max_uses": promo.max_uses},
    )

    return _promo_to_out(promo)


# ── DELETE /promos/{promo_id} — удалить промокод ─────────────────────────────


@router.delete("/promos/{promo_id}", status_code=204, dependencies=[require_permission("discounts.manage")])
async def delete_promo(promo_id: uuid.UUID, db: DbSession, admin: CurrentAdmin) -> None:
    result = await db.execute(
        select(PromoCode)
        .options(selectinload(PromoCode.discount_rule))
        .where(PromoCode.id == promo_id)
    )
    promo = result.scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Промокод не найден")

    await log_admin_action(
        db=db,
        admin=admin,
        action="promo.delete",
        entity_type="promo_code",
        entity_id=promo.id,
    )

    await db.delete(promo)
