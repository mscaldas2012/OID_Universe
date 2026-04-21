from datetime import datetime

from sqlalchemy import BigInteger, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.models.oid_node import Base, LtreeType

# Action vocabulary (must match audit_service.py and UI badge mapping)
ACTION_CREATE = "CREATE"
ACTION_UPDATE = "UPDATE"
ACTION_DISABLE = "DISABLE"
ACTION_DELETE = "DELETE"
ACTION_DELEGATE = "DELEGATE"
ACTION_RECLAIM = "RECLAIM"
ACTION_VISIBILITY = "VISIBILITY"


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    oid_path: Mapped[str] = mapped_column(LtreeType, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)
    recorded_at: Mapped[datetime] = mapped_column(server_default=func.now())
