from typing import Literal

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from src.config import settings

CallerType = Literal["admin", "credentialed", "anonymous"]


def get_caller_type(request: Request) -> CallerType:
    return request.state.caller_type  # type: ignore[no-any-return]


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
            # Full Bearer validation is wired in Phase 4 (T029).
            # This stub marks the caller as anonymous until ApiToken lookup is added.
            token = bearer.removeprefix("Bearer ").strip()
            request.state.pending_bearer = token
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
