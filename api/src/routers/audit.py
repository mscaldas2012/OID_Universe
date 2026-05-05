from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.middleware.auth import require_admin
from src.models.audit_log import AuditLog
from src.schemas.oid_node import AuditResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get(
    "",
    response_model=AuditResponse,
    summary="List audit log entries",
    description=(
        "Returns a paginated, reverse-chronological list of audit log entries. "
        "Requires admin authentication via the X-Admin-Key header. "
        "Filter by `oid_path` to see history for a specific node, or by `action` "
        "(CREATE, UPDATE, DISABLE, DELETE, DELEGATE, RECLAIM, VISIBILITY) to narrow by event type. "
        "Max 500 entries per page."
    ),
    responses={
        401: {"description": "Missing or invalid X-Admin-Key header"},
    },
)
async def list_audit(
    request: Request,
    oid_path: str | None = None,
    action: str | None = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> AuditResponse:
    require_admin(request)

    q = select(AuditLog).order_by(AuditLog.recorded_at.desc())
    if oid_path:
        q = q.where(AuditLog.oid_path == oid_path)
    if action:
        q = q.where(AuditLog.action == action.upper())

    count_q = select(func.count()).select_from(q.subquery())
    total = (await session.execute(count_q)).scalar_one()

    q = q.limit(min(limit, 500)).offset(offset)
    entries = (await session.execute(q)).scalars().all()

    return AuditResponse(total=total, entries=list(entries))  # type: ignore[arg-type]
