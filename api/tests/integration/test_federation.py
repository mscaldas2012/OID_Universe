"""Integration tests: delegate, reclaim, federation cascade, ancestor chain."""

import pytest
from httpx import AsyncClient

ROOT = "2.16.840.1.113762"
DELEGATE_URL = "https://child-registry.example.org/api"
DELEGATE_LABEL = "Child Registry"


async def _create(client: AsyncClient, path: str, desc: str, headers: dict) -> None:
    r = await client.post(
        "/oid",
        json={"oid_path": path, "description": desc, "visibility": "public"},
        headers=headers,
    )
    assert r.status_code == 201, f"Failed to create {path}: {r.text}"


@pytest.mark.asyncio
async def test_delegate_converts_node_to_federated(
    client: AsyncClient, admin_headers: dict
) -> None:
    path = f"{ROOT}.40"
    await _create(client, path, "Delegate target", admin_headers)

    r = await client.post(
        f"/oid/{path}/delegate",
        json={
            "federation_url": DELEGATE_URL,
            "federation_label": DELEGATE_LABEL,
            "delegation_contact": "admin@child.example.org",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["node_type"] == "federated"
    assert data["federation_url"] == DELEGATE_URL
    assert data["federation_label"] == DELEGATE_LABEL


@pytest.mark.asyncio
async def test_delegate_cascades_to_descendants(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.41"
    child = f"{ROOT}.41.1"
    grandchild = f"{ROOT}.41.1.1"
    for path, desc in [(parent, "P41"), (child, "P41C1"), (grandchild, "P41C1G1")]:
        await _create(client, path, desc, admin_headers)

    await client.post(
        f"/oid/{parent}/delegate",
        json={"federation_url": DELEGATE_URL, "federation_label": DELEGATE_LABEL},
        headers=admin_headers,
    )

    for path in (child, grandchild):
        r = await client.get(f"/oid/{path}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["node_type"] == "federated", f"{path} should be federated"


@pytest.mark.asyncio
async def test_write_to_federated_node_returns_409(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.42"
    child = f"{ROOT}.42.1"
    await _create(client, parent, "P42", admin_headers)
    await _create(client, child, "P42C1", admin_headers)

    await client.post(
        f"/oid/{parent}/delegate",
        json={"federation_url": DELEGATE_URL, "federation_label": DELEGATE_LABEL},
        headers=admin_headers,
    )

    # Write to federated parent blocked
    r = await client.put(
        f"/oid/{parent}",
        json={"description": "Attempt to modify federated node"},
        headers=admin_headers,
    )
    assert r.status_code == 409

    # Write to cascaded child blocked
    r2 = await client.post(
        "/oid",
        json={"oid_path": f"{ROOT}.42.2", "description": "New child under federated", "visibility": "public"},
        headers=admin_headers,
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_reclaim_restores_managed_on_node_only(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.43"
    child = f"{ROOT}.43.1"
    for path, desc in [(parent, "P43"), (child, "P43C1")]:
        await _create(client, path, desc, admin_headers)

    await client.post(
        f"/oid/{parent}/delegate",
        json={"federation_url": DELEGATE_URL, "federation_label": DELEGATE_LABEL},
        headers=admin_headers,
    )

    r = await client.post(f"/oid/{parent}/reclaim", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["node_type"] == "managed"
    assert r.json()["federation_url"] is None

    # Child is still federated — reclaim does not cascade
    r2 = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r2.json()["node_type"] == "federated"

    # Write to reclaimed parent now allowed
    r3 = await client.put(
        f"/oid/{parent}",
        json={"description": "Updated after reclaim"},
        headers=admin_headers,
    )
    assert r3.status_code == 200


@pytest.mark.asyncio
async def test_ancestor_chain_includes_federated_nodes(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.44"
    child = f"{ROOT}.44.1"
    for path, desc in [(parent, "P44"), (child, "P44C1")]:
        await _create(client, path, desc, admin_headers)

    await client.post(
        f"/oid/{parent}/delegate",
        json={"federation_url": DELEGATE_URL, "federation_label": DELEGATE_LABEL},
        headers=admin_headers,
    )

    r = await client.get(f"/oid/{child}/ancestors", headers=admin_headers)
    assert r.status_code == 200
    ancestors = r.json()["ancestors"]
    types = {a["oid_path"]: a["node_type"] for a in ancestors}
    assert types.get(parent) == "federated"


@pytest.mark.asyncio
async def test_audit_log_contains_delegate_entries(
    client: AsyncClient, admin_headers: dict
) -> None:
    parent = f"{ROOT}.45"
    child = f"{ROOT}.45.1"
    for path, desc in [(parent, "P45"), (child, "P45C1")]:
        await _create(client, path, desc, admin_headers)

    await client.post(
        f"/oid/{parent}/delegate",
        json={"federation_url": DELEGATE_URL, "federation_label": DELEGATE_LABEL},
        headers=admin_headers,
    )

    r = await client.get(f"/audit?oid_path={parent}", headers=admin_headers)
    assert r.status_code == 200
    actions = [e["action"] for e in r.json()["entries"]]
    assert "DELEGATE" in actions


@pytest.mark.asyncio
async def test_audit_log_contains_reclaim_entry(
    client: AsyncClient, admin_headers: dict
) -> None:
    path = f"{ROOT}.46"
    await _create(client, path, "P46", admin_headers)

    await client.post(
        f"/oid/{path}/delegate",
        json={"federation_url": DELEGATE_URL, "federation_label": DELEGATE_LABEL},
        headers=admin_headers,
    )
    await client.post(f"/oid/{path}/reclaim", headers=admin_headers)

    r = await client.get(f"/audit?oid_path={path}", headers=admin_headers)
    actions = [e["action"] for e in r.json()["entries"]]
    assert "RECLAIM" in actions
