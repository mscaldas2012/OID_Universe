from datetime import datetime

from sqlalchemy import BigInteger, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.models.oid_node import Base


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
