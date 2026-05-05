"""Rate limiting middleware for public read endpoints."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_raw = os.environ.get("PUBLIC_RATE_LIMIT", "60/minute").strip()

# If the value is just a number (e.g. "60"), format it as "{n}/minute"
if _raw.isdigit():
    PUBLIC_RATE_LIMIT = f"{_raw}/minute"
else:
    PUBLIC_RATE_LIMIT = _raw

limiter = Limiter(key_func=get_remote_address)


def get_public_rate_limit() -> str:
    """Dependency that returns the configured public rate limit string."""
    return PUBLIC_RATE_LIMIT
