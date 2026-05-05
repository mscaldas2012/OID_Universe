"""Search router — full-text search over OID node descriptions."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.middleware.auth import get_caller_type
from src.middleware.rate_limit import PUBLIC_RATE_LIMIT, limiter
from src.models.oid_node import OidNode
from src.routers.oid import _to_response, _visibility_filter
from src.schemas.oid_node import OidNodeResponse

router = APIRouter(tags=["search"])


class SearchResponse(BaseModel):
    q: str
    total: int
    results: list[OidNodeResponse]


@limiter.limit(PUBLIC_RATE_LIMIT)
@router.get(
    "/search",
    response_model=SearchResponse,
    summary="Full-text search over OID node descriptions",
    description=(
        "Searches OID node descriptions using PostgreSQL full-text search (`plainto_tsquery`). "
        "Results are visibility-filtered: anonymous callers only see public nodes, while credentialed "
        "(Bearer token) and admin (X-Admin-Key) callers see all. "
        "Supports optional `status` and `visibility` filters and `limit`/`offset` pagination (max limit 200)."
    ),
    responses={
        200: {"description": "Paginated search results with total count"},
    },
)
async def search_nodes(
    q: str,
    request: Request,
    status: str | None = None,
    visibility: str | None = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> Any:
    if limit > 200:
        limit = 200

    caller_type = get_caller_type(request)

    base = select(OidNode).where(
        text("to_tsvector('english', description) @@ plainto_tsquery('english', :q)")
    ).params(q=q)

    base = _visibility_filter(base, caller_type)

    if status:
        base = base.where(OidNode.status == status)
    if visibility and caller_type != "anonymous":
        base = base.where(OidNode.visibility == visibility)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_q)).scalar_one()

    results_q = base.order_by(OidNode.oid_path).limit(limit).offset(offset)
    rows = (await session.execute(results_q)).scalars().all()

    return SearchResponse(q=q, total=total, results=[_to_response(n) for n in rows])
