"""Integration tests: OID CRUD, write guard, visibility cascade, audit log."""

import pytest
from httpx import AsyncClient

ROOT = "2.16.840.1.113762"
CHILD = f"{ROOT}.1"
GRANDCHILD = f"{ROOT}.1.1"


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["root_oid"] == ROOT


@pytest.mark.asyncio
async def test_create_and_read_node(
    client: AsyncClient, admin_headers: dict
) -> None:
    r = await client.post(
        "/oid",
        json={
            "oid_path": CHILD,
            "description": "Test child node",
            "visibility": "public",
        },
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["oid_path"] == CHILD
    assert data["node_type"] == "managed"
    assert data["visibility"] == "public"

    r2 = await client.get(f"/oid/{CHILD}")
    assert r2.status_code == 200
    assert r2.json()["oid_path"] == CHILD


@pytest.mark.asyncio
async def test_create_requires_description_and_visibility(
    client: AsyncClient, admin_headers: dict
) -> None:
    r = await client.post(
        "/oid",
        json={"oid_path": f"{ROOT}.99"},
        headers=admin_headers,
    )
    assert r.status_code == 422  # Pydantic validation error


@pytest.mark.asyncio
async def test_visibility_cascade_to_private(
    client: AsyncClient, admin_headers: dict
) -> None:
    # Create parent (public) then child (public)
    parent = f"{ROOT}.2"
    child = f"{ROOT}.2.1"
    for path, desc in [(parent, "Parent"), (child, "Child")]:
        r = await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )
        assert r.status_code == 201, r.text

    # Set parent to private → child should cascade
    r = await client.put(
        f"/oid/{parent}",
        json={"visibility": "private"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["visibility"] == "private"

    # Child should now be private too (unauthenticated → 404)
    r2 = await client.get(f"/oid/{child}")
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_disable_cascades_to_children(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.3"
    child = f"{ROOT}.3.1"
    for path, desc in [(parent, "P3"), (child, "P3C1")]:
        await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )

    # Disable parent
    r = await client.put(
        f"/oid/{parent}",
        json={"status": "disabled"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "disabled"

    # Child node is still resolvable (returns record with status=disabled)
    r2 = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == "disabled"


@pytest.mark.asyncio
async def test_reenable_restores_cascade_children(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.4"
    child_dep = f"{ROOT}.4.1"  # will be deprecated before disable
    for path, desc in [(parent, "P4"), (child_dep, "P4C1")]:
        await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )

    # Mark child deprecated first
    await client.put(
        f"/oid/{child_dep}",
        json={"status": "deprecated"},
        headers=admin_headers,
    )

    # Disable parent → cascades to deprecated child
    await client.put(
        f"/oid/{parent}",
        json={"status": "disabled"},
        headers=admin_headers,
    )

    # Re-enable parent → child should restore to deprecated, not active
    r = await client.put(
        f"/oid/{parent}",
        json={"status": "active"},
        headers=admin_headers,
    )
    assert r.status_code == 200

    r2 = await client.get(f"/oid/{child_dep}", headers=admin_headers)
    assert r2.json()["status"] == "deprecated", "pre_cascade_status should restore deprecated"


@pytest.mark.asyncio
async def test_delete_blocked_with_children(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.5"
    child = f"{ROOT}.5.1"
    for path, desc in [(parent, "P5"), (child, "P5C1")]:
        await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )

    r = await client.delete(f"/oid/{parent}", headers=admin_headers)
    assert r.status_code == 409
    assert r.json()["detail"]["child_count"] == 1


@pytest.mark.asyncio
async def test_delete_leaf_succeeds(
    client: AsyncClient, admin_headers: dict
) -> None:
    leaf = f"{ROOT}.6"
    await client.post(
        "/oid",
        json={"oid_path": leaf, "description": "Leaf", "visibility": "public"},
        headers=admin_headers,
    )
    r = await client.delete(f"/oid/{leaf}", headers=admin_headers)
    assert r.status_code == 204

    r2 = await client.get(f"/oid/{leaf}", headers=admin_headers)
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_audit_log_contains_entries(
    client: AsyncClient, admin_headers: dict
) -> None:
    path = f"{ROOT}.7"
    await client.post(
        "/oid",
        json={"oid_path": path, "description": "Audit test", "visibility": "public"},
        headers=admin_headers,
    )
    await client.put(
        f"/oid/{path}",
        json={"visibility": "private"},
        headers=admin_headers,
    )

    r = await client.get(f"/audit?oid_path={path}", headers=admin_headers)
    assert r.status_code == 200
    entries = r.json()["entries"]
    actions = [e["action"] for e in entries]
    assert "CREATE" in actions
    assert "VISIBILITY" in actions


@pytest.mark.asyncio
async def test_write_blocked_above_root(
    client: AsyncClient, admin_headers: dict
) -> None:
    r = await client.post(
        "/oid",
        json={
            "oid_path": "2.16",  # above ROOT_OID 2.16.840.1.113762
            "description": "Above root",
            "visibility": "public",
        },
        headers=admin_headers,
    )
    assert r.status_code in (409, 400, 500)  # trigger raises P0001


@pytest.mark.asyncio
async def test_children_endpoint(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.8"
    child1 = f"{ROOT}.8.1"
    child2 = f"{ROOT}.8.2"
    for path, desc in [(parent, "P8"), (child1, "P8C1"), (child2, "P8C2")]:
        await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )

    r = await client.get(f"/oid/{parent}/children")
    assert r.status_code == 200
    paths = [c["oid_path"] for c in r.json()["children"]]
    assert child1 in paths
    assert child2 in paths
    assert parent not in paths


@pytest.mark.asyncio
async def test_ancestors_endpoint(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.9"
    child = f"{ROOT}.9.1"
    for path, desc in [(parent, "P9"), (child, "P9C1")]:
        await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )

    r = await client.get(f"/oid/{child}/ancestors")
    assert r.status_code == 200
    paths = [a["oid_path"] for a in r.json()["ancestors"]]
    assert parent in paths
    assert child not in paths
