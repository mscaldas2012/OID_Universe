import hashlib
from typing import Literal

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from src.config import settings

CallerType = Literal["admin", "credentialed", "anonymous"]


def get_caller_type(request: Request) -> CallerType:
    return request.state.caller_type  # type: ignore[no-any-return]


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _validate_bearer(token: str) -> bool:
    from src.db import AsyncSessionLocal
    from src.models.api_token import ApiToken

    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(ApiToken).where(
                    ApiToken.token_hash == _hash_token(token),
                    ApiToken.revoked_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        return row is not None


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        admin_key = request.headers.get("X-Admin-Key")
        bearer = request.headers.get("Authorization", "")

        if admin_key:
            if admin_key != settings.admin_api_key:
                return Response(
                    content='{"detail":"Invalid admin key"}',
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    media_type="application/json",
                )
            request.state.caller_type = "admin"
            request.state.actor = "admin"
        elif bearer.startswith("Bearer "):
            token = bearer.removeprefix("Bearer ").strip()
            if await _validate_bearer(token):
                request.state.caller_type = "credentialed"
                request.state.actor = "credentialed"
            else:
                request.state.caller_type = "anonymous"
                request.state.actor = "anonymous"
        else:
            request.state.caller_type = "anonymous"
            request.state.actor = "anonymous"

        return await call_next(request)


def require_admin(request: Request) -> None:
    if get_caller_type(request) != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin key required",
        )
