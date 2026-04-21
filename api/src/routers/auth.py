"""Auth router — API token issuance and revocation (admin only)."""

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.middleware.auth import require_admin
from src.models.api_token import ApiToken

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenCreateRequest(BaseModel):
    label: str


class TokenCreateResponse(BaseModel):
    id: int
    token: str
    label: str


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/token", response_model=TokenCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: TokenCreateRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> TokenCreateResponse:
    require_admin(request)
    raw = secrets.token_hex(32)
    record = ApiToken(token_hash=_hash_token(raw), label=body.label)
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return TokenCreateResponse(id=record.id, token=raw, label=record.label)


@router.delete("/token/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    require_admin(request)
    result = await session.execute(select(ApiToken).where(ApiToken.id == token_id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    from datetime import datetime, timezone
    record.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()
