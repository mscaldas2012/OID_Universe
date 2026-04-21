"""Audit service — single INSERT-only write path for all mutations."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.audit_log import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_DELEGATE,
    ACTION_DISABLE,
    ACTION_RECLAIM,
    ACTION_UPDATE,
    ACTION_VISIBILITY,
    AuditLog,
)


async def log_action(
    session: AsyncSession,
    *,
    oid_path: str,
    action: str,
    actor: str,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        oid_path=oid_path,
        action=action,
        actor=actor,
        old_value=old_value,
        new_value=new_value,
    )
    session.add(entry)
    # Caller is responsible for committing the session.


def resolve_update_action(
    old: dict[str, Any],
    new: dict[str, Any],
) -> str:
    """Determine the audit action for a PUT /oid/{path} call."""
    if new.get("status") == "disabled" and old.get("status") != "disabled":
        return ACTION_DISABLE
    if "visibility" in new and new.get("visibility") != old.get("visibility"):
        return ACTION_VISIBILITY
    return ACTION_UPDATE


__all__ = [
    "log_action",
    "resolve_update_action",
    "ACTION_CREATE",
    "ACTION_UPDATE",
    "ACTION_DISABLE",
    "ACTION_DELETE",
    "ACTION_DELEGATE",
    "ACTION_RECLAIM",
    "ACTION_VISIBILITY",
]
