"""OID node router — reads + writes + delegate/reclaim."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.db import get_session
from src.middleware.auth import get_caller_type, require_admin
from src.middleware.rate_limit import PUBLIC_RATE_LIMIT, limiter
from src.models.oid_node import NodeType, OidNode
from src.schemas.oid_node import (
    AncestorsResponse,
    ChildrenResponse,
    DelegateRequest,
    FederationBlockedError,
    OidNodeCreate,
    OidNodeResponse,
    OidNodeUpdate,
)
from src.services.audit_service import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_DELEGATE,
    ACTION_RECLAIM,
    log_action,
    resolve_update_action,
)

router = APIRouter(prefix="/oid", tags=["oid"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_response(node: OidNode) -> OidNodeResponse:
    return OidNodeResponse(
        id=str(node.id),
        oid_path=node.oid_path,
        node_type=node.node_type,  # type: ignore[arg-type]
        status=node.status,  # type: ignore[arg-type]
        description=node.description,
        visibility=node.visibility,
        refs=node.refs or [],
        metadata=node.metadata_,
        federation_url=node.federation_url,
        federation_label=node.federation_label,
        delegation_contact=node.delegation_contact,
        created_at=node.created_at,
        updated_at=node.updated_at,
    )


def _visibility_filter(query: Any, caller_type: str) -> Any:
    if caller_type == "anonymous":
        return query.where(OidNode.visibility == "public")
    return query  # admin and credentialed see all


async def _get_node_or_404(
    session: AsyncSession,
    oid_path: str,
    caller_type: str,
) -> OidNode:
    q = select(OidNode).where(
        text("oid_path = CAST(:path AS ltree)")
    ).params(path=oid_path)
    q = _visibility_filter(q, caller_type)
    result = await session.execute(q)
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return node


# ── Read endpoints ─────────────────────────────────────────────────────────────

@limiter.limit(PUBLIC_RATE_LIMIT)
@router.get(
    "/{oid_path:path}/children",
    response_model=ChildrenResponse,
    summary="List immediate children of an OID node",
    description=(
        "Returns the direct children (depth 1) of the node at `oid_path` using an ltree lquery. "
        "No auth required for public nodes; anonymous callers see only public children. "
        "Credentialed (Bearer token) and admin (X-Admin-Key) callers see all visibility levels."
    ),
    responses={
        404: {"description": "Parent node not found or not visible to caller"},
    },
)
async def get_children(
    oid_path: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ChildrenResponse:
    caller_type = get_caller_type(request)
    # Immediate children: lquery 'parent.*{1}'
    lquery = f"{oid_path}.*{{1}}"
    q = select(OidNode).where(text("oid_path ~ CAST(:lq AS lquery)")).params(lq=lquery)
    q = _visibility_filter(q, caller_type)
    result = await session.execute(q)
    children = [_to_response(n) for n in result.scalars().all()]
    return ChildrenResponse(oid_path=oid_path, children=children)


@limiter.limit(PUBLIC_RATE_LIMIT)
@router.get(
    "/{oid_path:path}/ancestors",
    response_model=AncestorsResponse,
    summary="Get all ancestors of an OID node",
    description=(
        "Returns the full upward chain of ancestor nodes for `oid_path`, ordered from root to direct parent. "
        "Includes federated arc nodes that sit above the local root. "
        "Visibility filtering applies: anonymous callers only see public ancestors."
    ),
    responses={
        404: {"description": "Node not found or not visible to caller"},
    },
)
async def get_ancestors(
    oid_path: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AncestorsResponse:
    caller_type = get_caller_type(request)
    q = (
        select(OidNode)
        .where(text("oid_path @> CAST(:path AS ltree) AND oid_path != CAST(:path AS ltree)"))
        .params(path=oid_path)
        .order_by(func.nlevel(text("oid_path")))
    )
    q = _visibility_filter(q, caller_type)
    result = await session.execute(q)
    ancestors = [_to_response(n) for n in result.scalars().all()]
    return AncestorsResponse(oid_path=oid_path, ancestors=ancestors)


@limiter.limit(PUBLIC_RATE_LIMIT)
@router.get(
    "/{oid_path:path}",
    response_model=OidNodeResponse,
    summary="Fetch a single OID node",
    description=(
        "Returns the OID node at `oid_path`. "
        "Anonymous callers (no auth) can only retrieve public nodes. "
        "Credentialed callers (Authorization: Bearer <token>) and admins (X-Admin-Key) see nodes of any visibility."
    ),
    responses={
        404: {"description": "Node not found or not visible to caller"},
    },
)
async def get_node(
    oid_path: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> OidNodeResponse:
    caller_type = get_caller_type(request)
    node = await _get_node_or_404(session, oid_path, caller_type)
    return _to_response(node)


# ── Write endpoints (admin only) ───────────────────────────────────────────────

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=OidNodeResponse,
    summary="Create a new OID node",
    description=(
        "Creates a managed OID node at the path specified in the request body. "
        "Requires admin authentication via the X-Admin-Key header. "
        "Returns 409 if the OID path already exists or if a federated ancestor blocks the write."
    ),
    responses={
        400: {"description": "Parent node does not exist"},
        401: {"description": "Missing or invalid X-Admin-Key header"},
        409: {"description": "OID path already exists, or a federated ancestor blocks this write"},
    },
)
async def create_node(
    body: OidNodeCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> OidNodeResponse:
    require_admin(request)
    actor = request.state.actor

    # Validate parent exists (unless this IS the configured root or has no parent)
    parent_path = ".".join(body.oid_path.split(".")[:-1])
    if parent_path and body.oid_path != settings.root_oid:
        parent_q = select(OidNode).where(
            text("oid_path = CAST(:path AS ltree)")
        ).params(path=parent_path)
        parent = (await session.execute(parent_q)).scalar_one_or_none()
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parent node '{parent_path}' does not exist",
            )

    node = OidNode(
        oid_path=body.oid_path,
        node_type=NodeType.managed,
        status=body.status,
        description=body.description,
        visibility=body.visibility,
        refs=body.refs or None,
        metadata_=body.metadata,
    )

    # Set app.root_oid + app.actor for the trigger
    await session.execute(
        text("SELECT set_config('app.root_oid', :v, true)"), {"v": settings.root_oid}
    )
    await session.execute(
        text("SELECT set_config('app.actor', :v, true)"), {"v": actor}
    )

    session.add(node)
    try:
        await session.flush()
    except (IntegrityError, DBAPIError) as exc:
        await session.rollback()
        msg = str(exc.orig)
        if "federated" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"detail": msg, "federation_url": "", "federation_label": None},
            ) from exc
        if "unique" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"OID path '{body.oid_path}' already exists",
            ) from exc
        # Any other write-guard trigger violation (e.g. rule 3: public under private
        # ancestor) also maps to 409.  All trigger messages begin with "Write rejected"
        # or "Write blocked".
        if "write rejected" in msg.lower() or "write blocked" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=msg,
            ) from exc
        raise

    await log_action(
        session,
        oid_path=node.oid_path,
        action=ACTION_CREATE,
        actor=actor,
        new_value={"oid_path": node.oid_path, "visibility": node.visibility},
    )
    await session.commit()
    await session.refresh(node)
    return _to_response(node)


@router.put(
    "/{oid_path:path}",
    response_model=OidNodeResponse,
    summary="Partially update an OID node",
    description=(
        "Applies a partial update to the node at `oid_path`; only fields present in the request body are changed. "
        "Requires admin authentication via the X-Admin-Key header. "
        "Returns 409 if the node is federated, as writes to federated nodes are blocked."
    ),
    responses={
        401: {"description": "Missing or invalid X-Admin-Key header"},
        404: {"description": "Node not found"},
        409: {"description": "Node is federated; writes are blocked"},
    },
)
async def update_node(
    oid_path: str,
    body: OidNodeUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> OidNodeResponse:
    require_admin(request)
    actor = request.state.actor

    node = await _get_node_or_404(session, oid_path, "admin")

    if node.node_type == NodeType.federated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": f"Write blocked: node {oid_path} is federated.",
                    "federation_url": node.federation_url or "",
                    "federation_label": node.federation_label},
        )

    old_snapshot: dict[str, Any] = {
        "status": node.status,
        "visibility": node.visibility,
        "description": node.description,
    }

    # Apply partial updates
    if body.description is not None:
        node.description = body.description
    if body.visibility is not None:
        node.visibility = body.visibility
    if body.status is not None:
        node.status = body.status
    if body.refs is not None:
        node.refs = body.refs
    if body.metadata is not None:
        node.metadata_ = body.metadata

    new_snapshot: dict[str, Any] = {
        "status": node.status,
        "visibility": node.visibility,
        "description": node.description,
    }

    await session.execute(
        text("SELECT set_config('app.root_oid', :v, true)"), {"v": settings.root_oid}
    )
    await session.execute(
        text("SELECT set_config('app.actor', :v, true)"), {"v": actor}
    )

    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc.orig),
        ) from exc

    action = resolve_update_action(old_snapshot, new_snapshot)
    await log_action(
        session,
        oid_path=oid_path,
        action=action,
        actor=actor,
        old_value=old_snapshot,
        new_value=new_snapshot,
    )
    await session.commit()
    await session.refresh(node)
    return _to_response(node)


@router.delete(
    "/{oid_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an OID node",
    description=(
        "Permanently deletes the node at `oid_path`. "
        "Requires admin authentication via the X-Admin-Key header. "
        "Returns 409 if the node has children (delete children first) or if the node is federated."
    ),
    responses={
        204: {"description": "Node deleted successfully"},
        401: {"description": "Missing or invalid X-Admin-Key header"},
        404: {"description": "Node not found"},
        409: {"description": "Node has children and cannot be deleted, or node is federated"},
    },
)
async def delete_node(
    oid_path: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    require_admin(request)
    actor = request.state.actor

    node = await _get_node_or_404(session, oid_path, "admin")

    if node.node_type == NodeType.federated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": f"Write blocked: node {oid_path} is federated.",
                    "federation_url": node.federation_url or "",
                    "federation_label": node.federation_label},
        )

    # Count immediate children
    child_q = select(func.count()).select_from(OidNode).where(
        text("oid_path ~ CAST(:lq AS lquery)")
    ).params(lq=f"{oid_path}.*{{1}}")
    child_count = (await session.execute(child_q)).scalar_one()

    if child_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "Cannot delete node with children. Delete children first.",
                    "child_count": child_count},
        )

    await log_action(
        session,
        oid_path=oid_path,
        action=ACTION_DELETE,
        actor=actor,
        old_value={"oid_path": oid_path},
    )
    await session.delete(node)
    await session.commit()


# ── Federation endpoints ───────────────────────────────────────────────────────

@router.post(
    "/{oid_path:path}/delegate",
    response_model=OidNodeResponse,
    summary="Delegate an OID subtree to an external registry",
    description=(
        "Marks the node at `oid_path` as federated and sets its federation URL, label, and contact. "
        "A database trigger cascades the federated status to all descendant nodes. "
        "Requires admin authentication via the X-Admin-Key header."
    ),
    responses={
        401: {"description": "Missing or invalid X-Admin-Key header"},
        404: {"description": "Node not found"},
    },
)
async def delegate_node(
    oid_path: str,
    body: DelegateRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> OidNodeResponse:
    require_admin(request)
    actor = request.state.actor

    node = await _get_node_or_404(session, oid_path, "admin")

    node.node_type = NodeType.federated
    node.federation_url = body.federation_url
    node.federation_label = body.federation_label
    node.delegation_contact = body.delegation_contact

    await session.execute(
        text("SELECT set_config('app.root_oid', :v, true)"), {"v": settings.root_oid}
    )
    await session.execute(
        text("SELECT set_config('app.actor', :v, true)"), {"v": actor}
    )

    await session.flush()  # trigger cascades federation to descendants

    await log_action(
        session,
        oid_path=oid_path,
        action=ACTION_DELEGATE,
        actor=actor,
        old_value={"node_type": "managed"},
        new_value={"node_type": "federated", "federation_url": body.federation_url},
    )
    await session.commit()
    await session.refresh(node)
    return _to_response(node)


@router.post(
    "/{oid_path:path}/reclaim",
    response_model=OidNodeResponse,
    summary="Reclaim a delegated OID node",
    description=(
        "Clears federation metadata on the node at `oid_path`, reverting it to managed status. "
        "Only the targeted node is changed; descendant federation state is not automatically cleared. "
        "Requires admin authentication via the X-Admin-Key header."
    ),
    responses={
        401: {"description": "Missing or invalid X-Admin-Key header"},
        404: {"description": "Node not found"},
    },
)
async def reclaim_node(
    oid_path: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> OidNodeResponse:
    require_admin(request)
    actor = request.state.actor

    node = await _get_node_or_404(session, oid_path, "admin")

    node.node_type = NodeType.managed
    node.federation_url = None
    node.federation_label = None
    node.delegation_contact = None

    await session.flush()

    await log_action(
        session,
        oid_path=oid_path,
        action=ACTION_RECLAIM,
        actor=actor,
        old_value={"node_type": "federated"},
        new_value={"node_type": "managed"},
    )
    await session.commit()
    await session.refresh(node)
    return _to_response(node)
