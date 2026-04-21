from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.models.oid_node import NodeStatus, NodeType


class OidNodeCreate(BaseModel):
    oid_path: str
    description: str
    visibility: str = Field(pattern="^(public|private)$")
    status: NodeStatus = NodeStatus.active
    refs: list[str] = []
    metadata: dict[str, Any] | None = None


class OidNodeUpdate(BaseModel):
    description: str | None = None
    visibility: str | None = Field(default=None, pattern="^(public|private)$")
    status: NodeStatus | None = None
    refs: list[str] | None = None
    metadata: dict[str, Any] | None = None


class OidNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    oid_path: str
    node_type: NodeType
    status: NodeStatus
    description: str
    visibility: str
    refs: list[str] = []
    metadata: dict[str, Any] | None = None
    federation_url: str | None = None
    federation_label: str | None = None
    delegation_contact: str | None = None
    created_at: datetime
    updated_at: datetime


class DelegateRequest(BaseModel):
    federation_url: str
    federation_label: str
    delegation_contact: str | None = None


class FederationBlockedError(BaseModel):
    detail: str
    federation_url: str
    federation_label: str | None = None


class AuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    oid_path: str
    action: str
    actor: str
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    recorded_at: datetime


class ChildrenResponse(BaseModel):
    oid_path: str
    children: list[OidNodeResponse]


class AncestorsResponse(BaseModel):
    oid_path: str
    ancestors: list[OidNodeResponse]


class SearchResponse(BaseModel):
    q: str
    total: int
    results: list[OidNodeResponse]


class AuditResponse(BaseModel):
    total: int
    entries: list[AuditLogEntry]


class TokenCreate(BaseModel):
    label: str


class TokenResponse(BaseModel):
    id: int
    token: str
    label: str
