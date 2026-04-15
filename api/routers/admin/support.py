"""
api/routers/admin/support.py
─────────────────────────────────────────────────────────────────────────────
Управление тикетами поддержки в администраторской панели.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DbSession
from api.deps_admin import CurrentAdmin, require_permission
from api.schemas.admin import PaginatedResponse
from api.schemas.support import (
    AdminReplyRequest,
    AdminTicketDetail,
    AdminTicketListItem,
    AssignRequest,
    StatusChangeRequest,
    TemplateOut,
    TicketMessageOut,
)
from api.services.support_service import SupportService
from api.utils.admin_log import log_admin_action
from shared.models import TicketStatus

router = APIRouter()


# ── GET /tickets — список тикетов ────────────────────────────────────────────


@router.get(
    "/tickets",
    response_model=PaginatedResponse[AdminTicketListItem],
    dependencies=[require_permission("support.view")],
)
async def list_tickets(
    db: DbSession,
    admin: CurrentAdmin,
    status_filter: str | None = Query(None, alias="status"),
    assigned_to: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    svc = SupportService(db)

    ticket_status = None
    if status_filter:
        try:
            ticket_status = TicketStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неверный статус: {status_filter}",
            )

    assigned_to_id = None
    if assigned_to == "me":
        assigned_to_id = admin.id
    elif assigned_to == "unassigned":
        pass  # handled below
    elif assigned_to:
        try:
            assigned_to_id = uuid.UUID(assigned_to)
        except ValueError:
            pass

    tickets, total = await svc.list_all_tickets(
        status=ticket_status,
        assigned_to_id=assigned_to_id,
        search=search,
        page=page,
        page_size=page_size,
    )

    pages = (total + page_size - 1) // page_size if total > 0 else 1
    return PaginatedResponse(
        items=[AdminTicketListItem.model_validate(t) for t in tickets],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ── GET /tickets/{id} — тикет с сообщениями ─────────────────────────────────


@router.get(
    "/tickets/{ticket_id}",
    response_model=AdminTicketDetail,
    dependencies=[require_permission("support.view")],
)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: DbSession,
    admin: CurrentAdmin,
):
    svc = SupportService(db)
    ticket = await svc.get_ticket_with_messages(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    return AdminTicketDetail.model_validate(ticket)


# ── POST /tickets/{id}/reply — ответ оператора ──────────────────────────────


@router.post(
    "/tickets/{ticket_id}/reply",
    response_model=TicketMessageOut,
    dependencies=[require_permission("support.reply")],
)
async def reply_to_ticket(
    ticket_id: uuid.UUID,
    body: AdminReplyRequest,
    db: DbSession,
    admin: CurrentAdmin,
):
    svc = SupportService(db)
    ticket = await svc.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    msg = await svc.add_message(
        ticket_id=ticket_id,
        sender_type="admin",
        sender_id=admin.id,
        text=body.text,
        attachments=body.attachments,
        is_template=body.is_template,
    )

    await log_admin_action(
        db=db,
        admin=admin,
        action="support.reply",
        entity_type="support_ticket",
        entity_id=ticket_id,
        description=f"Ответ на тикет: {body.text[:100]}",
    )

    return TicketMessageOut.model_validate(msg)


# ── PATCH /tickets/{id}/status — смена статуса ──────────────────────────────


@router.patch(
    "/tickets/{ticket_id}/status",
    response_model=AdminTicketDetail,
    dependencies=[require_permission("support.update")],
)
async def change_ticket_status(
    ticket_id: uuid.UUID,
    body: StatusChangeRequest,
    db: DbSession,
    admin: CurrentAdmin,
):
    try:
        new_status = TicketStatus(body.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный статус: {body.status}",
        )

    svc = SupportService(db)
    ticket = await svc.change_status(ticket_id, new_status, admin.id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    await log_admin_action(
        db=db,
        admin=admin,
        action="support.status_change",
        entity_type="support_ticket",
        entity_id=ticket_id,
        description=f"Статус → {new_status.value}",
    )

    # Reload with messages for response
    ticket = await svc.get_ticket_with_messages(ticket_id)
    return AdminTicketDetail.model_validate(ticket)


# ── PATCH /tickets/{id}/assign — назначение оператора ────────────────────────


@router.patch(
    "/tickets/{ticket_id}/assign",
    response_model=AdminTicketDetail,
    dependencies=[require_permission("support.assign")],
)
async def assign_ticket(
    ticket_id: uuid.UUID,
    body: AssignRequest,
    db: DbSession,
    admin: CurrentAdmin,
):
    svc = SupportService(db)
    admin_id = body.admin_id or admin.id
    ticket = await svc.assign_ticket(ticket_id, admin_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    await log_admin_action(
        db=db,
        admin=admin,
        action="support.assign",
        entity_type="support_ticket",
        entity_id=ticket_id,
        description=f"Назначен на {admin_id}",
    )

    ticket = await svc.get_ticket_with_messages(ticket_id)
    return AdminTicketDetail.model_validate(ticket)


# ── GET /templates — шаблоны быстрых ответов ─────────────────────────────────


@router.get(
    "/templates",
    response_model=list[TemplateOut],
    dependencies=[require_permission("support.view")],
)
async def list_templates(
    db: DbSession,
    admin: CurrentAdmin,
    category: str | None = Query(None),
):
    svc = SupportService(db)
    templates = await svc.list_templates(category)
    return [TemplateOut.model_validate(t) for t in templates]
