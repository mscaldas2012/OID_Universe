import subprocess
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

from src.config import settings
from src.middleware.auth import AuthMiddleware


def _run_migrations() -> None:
    subprocess.run(
        ["alembic", "upgrade", "head"],
        check=True,
        cwd="/app",
    )


async def _seed_root_node() -> None:
    """Insert the root OID node if it doesn't already exist."""
    from src.models.oid_node import NodeType, OidNode

    engine = create_async_engine(settings.database_url)
    async with AsyncSession(engine) as session:
        existing = (
            await session.execute(
                select(OidNode).where(text("oid_path = CAST(:p AS ltree)")).params(p=settings.root_oid)
            )
        ).scalar_one_or_none()

        if existing is None:
            await session.execute(
                text("SELECT set_config('app.root_oid', :v, true)"), {"v": settings.root_oid}
            )
            await session.execute(
                text("SELECT set_config('app.actor', :v, true)"), {"v": "system"}
            )
            session.add(
                OidNode(
                    oid_path=settings.root_oid,
                    node_type=NodeType.managed,
                    status="active",
                    description=f"Root OID node ({settings.root_oid})",
                    visibility="public",
                )
            )
            await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _run_migrations()
    await _seed_root_node()
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
