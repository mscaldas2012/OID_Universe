"""Shared test fixtures.

Uses testcontainers to spin up a real PostgreSQL 16 instance per test session,
runs all Alembic migrations, then provides an AsyncSession and an HTTPX
AsyncClient wired to the FastAPI app.
"""

import os
import subprocess

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

TEST_ADMIN_KEY = "test-admin-key-insecure"
TEST_ROOT_OID = "2.16.840.1.113762"


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16") as pg:
        yield pg


@pytest.fixture(scope="session")
def database_url(postgres_container: PostgresContainer) -> str:
    url = postgres_container.get_connection_url()
    # Replace psycopg2 driver with asyncpg for SQLAlchemy async
    return url.replace("psycopg2", "asyncpg").replace("postgresql://", "postgresql+asyncpg://")


@pytest.fixture(scope="session", autouse=True)
def run_migrations(database_url: str) -> None:
    # Alembic env.py uses create_async_engine, so pass the asyncpg URL directly.
    # psycopg2 is not installed — only asyncpg is.
    subprocess.run(
        ["alembic", "-c", "alembic.ini", "upgrade", "head"],
        env={**os.environ, "DATABASE_URL": database_url,
             "ROOT_OID": TEST_ROOT_OID, "ADMIN_API_KEY": TEST_ADMIN_KEY},
        cwd=str(os.path.dirname(os.path.dirname(__file__))),
        check=True,
    )


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
