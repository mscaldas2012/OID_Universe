"""Integration tests: public/private visibility, Bearer token auth, search."""

import pytest
from httpx import AsyncClient

ROOT = "2.16.840.1.113762"


@pytest.mark.asyncio
async def test_anonymous_cannot_read_private_node(
    client: AsyncClient, admin_headers: dict
) -> None:
    path = f"{ROOT}.20"
    await client.post(
        "/oid",
        json={"oid_path": path, "description": "Private node", "visibility": "private"},
        headers=admin_headers,
    )
    r = await client.get(f"/oid/{path}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_admin_can_read_private_node(
    client: AsyncClient, admin_headers: dict
) -> None:
    path = f"{ROOT}.21"
    await client.post(
        "/oid",
        json={"oid_path": path, "description": "Private node admin", "visibility": "private"},
        headers=admin_headers,
    )
    r = await client.get(f"/oid/{path}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["visibility"] == "private"


@pytest.mark.asyncio
async def test_bearer_token_grants_credentialed_access(
    client: AsyncClient, admin_headers: dict
) -> None:
    # Create a private node
    path = f"{ROOT}.22"
    await client.post(
        "/oid",
        json={"oid_path": path, "description": "Private credentialed", "visibility": "private"},
        headers=admin_headers,
    )

    # Issue a token
    r = await client.post("/auth/token", json={"label": "test-token"}, headers=admin_headers)
    assert r.status_code == 201
    token = r.json()["token"]
    token_id = r.json()["id"]

    # Credentialed read works
    r2 = await client.get(f"/oid/{path}", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200

    # Revoke token
    r3 = await client.delete(f"/auth/token/{token_id}", headers=admin_headers)
    assert r3.status_code == 204

    # After revocation, token no longer grants access
    r4 = await client.get(f"/oid/{path}", headers={"Authorization": f"Bearer {token}"})
    assert r4.status_code == 404


@pytest.mark.asyncio
async def test_invalid_bearer_token_treated_as_anonymous(
    client: AsyncClient, admin_headers: dict
) -> None:
    path = f"{ROOT}.23"
    await client.post(
        "/oid",
        json={"oid_path": path, "description": "Private invalid bearer", "visibility": "private"},
        headers=admin_headers,
    )
    r = await client.get(f"/oid/{path}", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_search_returns_public_results(
    client: AsyncClient, admin_headers: dict
) -> None:
    await client.post(
        "/oid",
        json={"oid_path": f"{ROOT}.24", "description": "Searchable value set definition", "visibility": "public"},
        headers=admin_headers,
    )
    r = await client.get("/search?q=value+set")
    assert r.status_code == 200
    data = r.json()
    assert data["q"] == "value set"
    assert data["total"] >= 1
    paths = [n["oid_path"] for n in data["results"]]
    assert f"{ROOT}.24" in paths


@pytest.mark.asyncio
async def test_search_excludes_private_from_anonymous(
    client: AsyncClient, admin_headers: dict
) -> None:
    await client.post(
        "/oid",
        json={"oid_path": f"{ROOT}.25", "description": "Secret genomic registry entry", "visibility": "private"},
        headers=admin_headers,
    )
    r = await client.get("/search?q=genomic+registry")
    assert r.status_code == 200
    paths = [n["oid_path"] for n in r.json()["results"]]
    assert f"{ROOT}.25" not in paths


@pytest.mark.asyncio
async def test_search_includes_private_for_credentialed(
    client: AsyncClient, admin_headers: dict
) -> None:
    await client.post(
        "/oid",
        json={"oid_path": f"{ROOT}.26", "description": "Confidential clinical terminology arc", "visibility": "private"},
        headers=admin_headers,
    )

    r_tok = await client.post("/auth/token", json={"label": "search-test"}, headers=admin_headers)
    token = r_tok.json()["token"]

    r = await client.get("/search?q=clinical+terminology", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    paths = [n["oid_path"] for n in r.json()["results"]]
    assert f"{ROOT}.26" in paths


@pytest.mark.asyncio
async def test_token_revocation_returns_404_for_missing(
    client: AsyncClient, admin_headers: dict
) -> None:
    r = await client.delete("/auth/token/999999", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_token_requires_admin(client: AsyncClient) -> None:
    r = await client.post("/auth/token", json={"label": "no-auth"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_visibility_cascade_anonymous_children(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.27"
    child = f"{ROOT}.27.1"
    for path, desc in [(parent, "Cascade parent"), (child, "Cascade child")]:
        await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )

    # Set parent private — child should cascade
    await client.put(f"/oid/{parent}", json={"visibility": "private"}, headers=admin_headers)

    r_children = await client.get(f"/oid/{parent}/children")
    assert r_children.status_code == 200
    assert r_children.json()["children"] == []
