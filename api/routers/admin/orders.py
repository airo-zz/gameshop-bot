"""
api/routers/admin/orders.py
─────────────────────────────────────────────────────────────────────────────
Управление заказами в администраторской панели.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import exc as sa_exc
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from api.bot_instance import get_bot
from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.schemas.admin import (
    OrderDetailOut,
    OrderListItem,
    OrderNotesRequest,
    OrderStatusChangeRequest,
    PaginatedResponse,
)
from api.services.order_service import OrderService
from api.utils.admin_log import log_admin_action
from bot.utils.texts import BotTexts
from shared.models import (
    ALLOWED_STATUS_TRANSITIONS,
    Order,
    OrderStatus,
    User,
)

texts = BotTexts()

router = APIRouter()


# ── GET / — список заказов ────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[OrderListItem],
            dependencies=[require_permission("orders.view")])
async def list_orders(
    db: DbSession,
    admin: CurrentAdmin,
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[OrderListItem]:
    """
    Список заказов с фильтрацией и пагинацией.

    - status: фильтр по статусу (new, pending_payment, paid, processing, ...)
    - search: поиск по order_number или username пользователя
    - Сортировка: по created_at DESC
    """
    query = select(Order).join(Order.user).where(Order.deleted_at.is_(None))

    if status_filter:
        try:
            order_status = OrderStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неверный статус: {status_filter}",
            )
        query = query.where(Order.status == order_status)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Order.order_number.ilike(search_term),
                User.username.ilike(search_term),
            )
        )

    # Подсчёт total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Загружаем страницу с items и user
    offset = (page - 1) * page_size
    query = (
        query.options(
            selectinload(Order.user),
            selectinload(Order.items),
        )
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )

    result = await db.execute(query)
    orders = result.scalars().unique().all()

    items = [
        OrderListItem(
            id=o.id,
            order_number=o.order_number,
            status=o.status.value,
            total_amount=float(o.total_amount),
            payment_method=o.payment_method.value if o.payment_method else None,
            user_telegram_id=o.user.telegram_id,
            user_username=o.user.username,
            user_first_name=o.user.first_name,
            created_at=o.created_at,
            paid_at=o.paid_at,
            completed_at=o.completed_at,
            items_count=len(o.items),
            deleted_at=o.deleted_at,
        )
        for o in orders
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total > 0 else 1,
    )


# ── GET /{order_id} — детали заказа ──────────────────────────────────────────


@router.get("/{order_id}", response_model=OrderDetailOut,
            dependencies=[require_permission("orders.view")])
async def get_order(
    order_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> OrderDetailOut:
    """Полная информация о заказе: позиции, история статусов, платежи, данные пользователя."""
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.user),
            selectinload(Order.items),
            selectinload(Order.status_history),
            selectinload(Order.payments),
        )
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    return OrderDetailOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status.value,
        subtotal=float(order.subtotal),
        discount_amount=float(order.discount_amount),
        total_amount=float(order.total_amount),
        payment_method=order.payment_method.value if order.payment_method else None,
        notes=order.notes,
        cancel_reason=order.cancel_reason,
        created_at=order.created_at,
        paid_at=order.paid_at,
        processing_started_at=order.processing_started_at,
        completed_at=order.completed_at,
        cancelled_at=order.cancelled_at,
        user={
            "id": str(order.user.id),
            "telegram_id": order.user.telegram_id,
            "username": order.user.username,
            "first_name": order.user.first_name,
            "last_name": order.user.last_name,
            "balance": float(order.user.balance),
            "orders_count": order.user.orders_count,
            "total_spent": float(order.user.total_spent),
            "is_blocked": order.user.is_blocked,
        },
        items=[
            {
                "id": str(item.id),
                "product_id": str(item.product_id),
                "product_name": item.product_name,
                "lot_name": item.lot_name,
                "quantity": item.quantity,
                "unit_price": float(item.unit_price),
                "total_price": float(item.total_price),
                "input_data": item.input_data,
                "delivery_data": item.delivery_data,
                "delivered_at": item.delivered_at.isoformat() if item.delivered_at else None,
            }
            for item in order.items
        ],
        status_history=[
            {
                "id": str(h.id),
                "from_status": h.from_status.value if h.from_status else None,
                "to_status": h.to_status.value,
                "changed_by_type": h.changed_by_type,
                "reason": h.reason,
                "created_at": h.created_at.isoformat(),
            }
            for h in order.status_history
        ],
        payments=[
            {
                "id": str(p.id),
                "method": p.method.value,
                "status": p.status.value,
                "amount": float(p.amount),
                "currency": p.currency,
                "external_id": p.external_id,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "created_at": p.created_at.isoformat(),
            }
            for p in order.payments
        ],
    )


# ── PATCH /{order_id}/status — смена статуса ─────────────────────────────────


@router.patch("/{order_id}/status",
              dependencies=[require_permission("orders.update_status")])
async def change_order_status(
    order_id: uuid.UUID,
    body: OrderStatusChangeRequest,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """
    Смена статуса заказа.

    Валидирует переход через ALLOWED_STATUS_TRANSITIONS.
    Записывает OrderStatusHistory и AdminActionLog.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    try:
        new_status = OrderStatus(body.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный статус: {body.status}",
        )

    if not order.can_transition_to(new_status):
        allowed = [s.value for s in ALLOWED_STATUS_TRANSITIONS.get(order.status, set())]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Нельзя перейти из '{order.status.value}' в '{new_status.value}'. "
                f"Допустимые переходы: {allowed}"
            ),
        )

    old_status = order.status.value

    svc = OrderService(db)
    await svc.change_status(
        order=order,
        new_status=new_status,
        changed_by_id=admin.id,
        changed_by_type="admin",
        reason=body.reason,
    )

    await log_admin_action(
        db=db,
        admin=admin,
        action="order.status_change",
        entity_type="order",
        entity_id=order.id,
        before_data={"status": old_status},
        after_data={"status": new_status.value},
        description=body.reason,
    )

    return {"ok": True, "new_status": new_status.value}


# ── POST /{order_id}/notify — отправить уведомление пользователю ─────────────


@router.post("/{order_id}/notify",
             dependencies=[require_permission("orders.update_status")])
async def notify_user(
    order_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """Отправляет пользователю уведомление о текущем статусе заказа через бота."""
    result = await db.execute(
        select(Order).options(selectinload(Order.user)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    bot = get_bot()
    try:
        await bot.send_message(
            chat_id=order.user.telegram_id,
            text=texts.order_status_changed(order.order_number, order.status.value),
            parse_mode="HTML",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Не удалось отправить уведомление: {exc}",
        ) from exc

    await log_admin_action(
        db=db,
        admin=admin,
        action="order.notify_user",
        entity_type="order",
        entity_id=order.id,
        description=f"Отправлено уведомление о статусе {order.status.value}",
    )

    return {"ok": True}


# ── GET /trash — список мягко удалённых заказов ──────────────────────────────
# NOTE: /trash must be registered BEFORE /{order_id} to avoid route collision.


@router.get("/trash", response_model=PaginatedResponse[OrderListItem],
            dependencies=[require_permission("orders.manage")])
async def list_trash_orders(
    db: DbSession,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[OrderListItem]:
    """Список мягко удалённых заказов (корзина). Отображает только deleted_at IS NOT NULL."""
    query = (
        select(Order)
        .join(Order.user)
        .where(Order.deleted_at.is_not(None))
    )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = (
        query.options(
            selectinload(Order.user),
            selectinload(Order.items),
        )
        .order_by(Order.deleted_at.desc())
        .offset(offset)
        .limit(page_size)
    )

    result = await db.execute(query)
    orders = result.scalars().unique().all()

    items = [
        OrderListItem(
            id=o.id,
            order_number=o.order_number,
            status=o.status.value,
            total_amount=float(o.total_amount),
            payment_method=o.payment_method.value if o.payment_method else None,
            user_telegram_id=o.user.telegram_id,
            user_first_name=o.user.first_name,
            user_username=o.user.username,
            created_at=o.created_at,
            paid_at=o.paid_at,
            completed_at=o.completed_at,
            items_count=len(o.items),
            deleted_at=o.deleted_at,
        )
        for o in orders
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total > 0 else 1,
    )


# ── DELETE /{order_id} — мягкое удаление заказа ──────────────────────────────


@router.delete("/{order_id}", status_code=204, dependencies=[require_permission("orders.manage")])
async def delete_order(
    order_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
    reason: str | None = Query(None),
) -> None:
    """Мягкое удаление заказа: устанавливает deleted_at и delete_reason. Заказ попадает в корзину."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    forbidden_statuses = {OrderStatus.paid, OrderStatus.processing, OrderStatus.completed}
    if order.status in forbidden_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя удалить заказ в статусе {order.status.value}",
        )

    order.deleted_at = func.now()
    order.delete_reason = reason

    await log_admin_action(
        db=db,
        admin=admin,
        action="order.soft_delete",
        entity_type="order",
        entity_id=order.id,
        description=reason,
    )


# ── POST /{order_id}/restore — восстановить из корзины ───────────────────────


@router.post("/{order_id}/restore", dependencies=[require_permission("orders.manage")])
async def restore_order(
    order_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """Восстанавливает мягко удалённый заказ: снимает deleted_at и delete_reason."""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_not(None))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден в корзине",
        )

    order.deleted_at = None
    order.delete_reason = None

    await log_admin_action(
        db=db,
        admin=admin,
        action="order.restore",
        entity_type="order",
        entity_id=order.id,
    )

    return {"ok": True, "order_id": str(order.id)}


# ── DELETE /{order_id}/force — перманентное удаление из корзины ───────────────


@router.delete("/{order_id}/force", status_code=204, dependencies=[require_permission("orders.manage")])
async def force_delete_order(
    order_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
) -> None:
    """
    Перманентное удаление заказа из корзины.
    Работает только для заказов с deleted_at IS NOT NULL.
    Каскадное удаление дочерних записей выполняется на уровне БД (ondelete=CASCADE).
    """
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_not(None))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден в корзине",
        )

    await log_admin_action(
        db=db,
        admin=admin,
        action="order.force_delete",
        entity_type="order",
        entity_id=order.id,
    )

    try:
        await db.delete(order)
        await db.flush()
    except sa_exc.IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Невозможно удалить заказ: существуют связанные записи",
        ) from exc


# ── POST /{order_id}/notes — добавить заметку ─────────────────────────────────


@router.post("/{order_id}/notes",
             dependencies=[require_permission("orders.add_notes")])
async def add_order_notes(
    order_id: uuid.UUID,
    body: OrderNotesRequest,
    db: DbSession,
    admin: CurrentAdmin,
) -> dict:
    """Добавляет заметку оператора к заказу (append к существующим)."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    if order.notes:
        order.notes = f"{order.notes}\n{body.text}"
    else:
        order.notes = body.text

    await log_admin_action(
        db=db,
        admin=admin,
        action="order.add_notes",
        entity_type="order",
        entity_id=order.id,
        description=body.text,
    )

    return {"ok": True}
