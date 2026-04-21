"""Shared test fixtures.

When TEST_DATABASE_URL is set (e.g. inside Docker Compose), uses that database
directly. Otherwise spins up a throwaway PostgreSQL 16 via testcontainers.
"""

import os
import subprocess

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_ADMIN_KEY = "test-admin-key-insecure"
TEST_ROOT_OID = "2.16.840.1.113762"

# ── Database URL resolution ────────────────────────────────────────────────────
# Inside Docker Compose, set TEST_DATABASE_URL to skip testcontainers.

def _use_testcontainers() -> bool:
    return not os.environ.get("TEST_DATABASE_URL")


@pytest.fixture(scope="session")
def postgres_container():
    if _use_testcontainers():
        from testcontainers.postgres import PostgresContainer
        with PostgresContainer("postgres:16") as pg:
            yield pg
    else:
        yield None


@pytest.fixture(scope="session")
def database_url(postgres_container) -> str:
    if not _use_testcontainers():
        return os.environ["TEST_DATABASE_URL"]
    url = postgres_container.get_connection_url()
    return url.replace("psycopg2", "asyncpg").replace("postgresql://", "postgresql+asyncpg://")


@pytest.fixture(scope="session", autouse=True)
def run_migrations_and_truncate(database_url: str) -> None:
    subprocess.run(
        ["alembic", "-c", "alembic.ini", "upgrade", "head"],
        env={**os.environ, "DATABASE_URL": database_url,
             "ROOT_OID": TEST_ROOT_OID, "ADMIN_API_KEY": TEST_ADMIN_KEY},
        cwd=str(os.path.dirname(os.path.dirname(__file__))),
        check=True,
    )
    # Wipe all data so repeated runs on a shared DB start clean.
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    async def _truncate() -> None:
        engine = create_async_engine(database_url)
        async with engine.begin() as conn:
            await conn.execute(text("TRUNCATE audit_log, oid_nodes RESTART IDENTITY CASCADE"))
        await engine.dispose()

    asyncio.get_event_loop().run_until_complete(_truncate())


@pytest.fixture(scope="session")
def async_engine(database_url: str):
    return create_async_engine(database_url, echo=False)


@pytest.fixture(scope="session")
def session_factory(async_engine):
    return async_sessionmaker(async_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def session(session_factory) -> AsyncSession:
    async with session_factory() as s:
        yield s
        await s.rollback()


@pytest_asyncio.fixture(scope="session")
async def client(database_url: str) -> AsyncClient:
    os.environ["DATABASE_URL"] = database_url
    os.environ["ROOT_OID"] = TEST_ROOT_OID
    os.environ["ADMIN_API_KEY"] = TEST_ADMIN_KEY

    # Import app after env vars are set
    from src.main import app  # noqa: PLC0415

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return {"X-Admin-Key": TEST_ADMIN_KEY}


@pytest_asyncio.fixture(scope="session", autouse=True)
async def seed_root_node(client: AsyncClient) -> None:
    """Ensure the root OID node exists before any tests run."""
    r = await client.post(
        "/oid",
        json={
            "oid_path": TEST_ROOT_OID,
            "description": "Root OID for testing",
            "visibility": "public",
        },
        headers={"X-Admin-Key": TEST_ADMIN_KEY},
    )
    # 201 = created, 409 = already exists — both are fine
    assert r.status_code in (201, 409), f"Failed to seed root node: {r.text}"
