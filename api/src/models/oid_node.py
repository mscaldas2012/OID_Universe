import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class NodeType(str, enum.Enum):
    managed = "managed"
    federated = "federated"


class NodeStatus(str, enum.Enum):
    active = "active"
    deprecated = "deprecated"
    disabled = "disabled"


class OidNode(Base):
    __tablename__ = "oid_nodes"
    __table_args__ = (
        UniqueConstraint("oid_path", name="oid_path_unique"),
        CheckConstraint(
            "visibility IN ('public', 'private')",
            name="visibility_check",
        ),
        CheckConstraint(
            "node_type = 'managed' OR "
            "(federation_url IS NOT NULL AND federation_label IS NOT NULL)",
            name="federation_fields_required",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # oid_path stored as TEXT cast to LTREE at the DB layer
    oid_path: Mapped[str] = mapped_column(Text, nullable=False)
    node_type: Mapped[str] = mapped_column(
        SAEnum(NodeType, name="node_type", create_type=False), nullable=False
    )
    status: Mapped[str] = mapped_column(
        SAEnum(NodeStatus, name="node_status", create_type=False),
        nullable=False,
        server_default="active",
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(String(10), nullable=False)
    refs: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    federation_url: Mapped[str | None] = mapped_column(Text)
    federation_label: Mapped[str | None] = mapped_column(Text)
    delegation_contact: Mapped[str | None] = mapped_column(Text)
    disabled_by_cascade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pre_cascade_status: Mapped[str | None] = mapped_column(
        SAEnum(NodeStatus, name="node_status", create_type=False)
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
