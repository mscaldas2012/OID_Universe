import subprocess
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.middleware.auth import AuthMiddleware


def _run_migrations() -> None:
    subprocess.run(
        ["alembic", "upgrade", "head"],
        check=True,
        cwd="/app",
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Run Alembic migrations at startup (single-instance — no race condition)
    _run_migrations()
    yield


app = FastAPI(
    title="OID Universe",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tightened per deployment env
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers are imported here after models are loaded; avoids circular imports
from src.routers import oid, audit  # noqa: E402

app.include_router(oid.router)
app.include_router(audit.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "root_oid": settings.root_oid}
