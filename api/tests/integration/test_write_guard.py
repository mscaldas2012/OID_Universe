"""Integration tests: PL/pgSQL write-guard trigger (T062).

Covers all seven trigger rules in migration 002_write_guard_trigger.py:
  1. Reject writes above ROOT_OID
  2. Reject INSERT or managed UPDATE if any ancestor is federated
  3. Reject setting visibility=public if any ancestor is private
  4. Cascade private visibility to all managed descendants
  5. On status→disabled: cascade to descendants, save pre_cascade_status
  6. On disabled→active: restore pre_cascade_status for cascade-disabled descendants
  7. On node_type managed→federated (delegate): cascade to all descendants

Uses arcs in the 800 range to avoid collisions with test_oid_crud.py.
"""

import pytest
from httpx import AsyncClient

ROOT = "2.16.840.1.113762"

# ── helpers ────────────────────────────────────────────────────────────────────

async def _create(client: AsyncClient, admin_headers: dict, path: str, **kwargs) -> dict:
    payload = {
        "oid_path": path,
        "description": f"node {path}",
        "visibility": "public",
        **kwargs,
    }
    r = await client.post("/oid", json=payload, headers=admin_headers)
    assert r.status_code == 201, f"Failed to create {path}: {r.text}"
    return r.json()


async def _put(client: AsyncClient, admin_headers: dict, path: str, **kwargs) -> dict:
    r = await client.put(f"/oid/{path}", json=kwargs, headers=admin_headers)
    assert r.status_code == 200, f"Failed to update {path}: {r.text}"
    return r.json()


async def _delegate(client: AsyncClient, admin_headers: dict, path: str) -> dict:
    r = await client.post(
        f"/oid/{path}/delegate",
        json={
            "federation_url": "https://example.com/registry",
            "federation_label": "External Registry",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, f"Failed to delegate {path}: {r.text}"
    return r.json()


async def _delete(client: AsyncClient, admin_headers: dict, path: str) -> None:
    await client.delete(f"/oid/{path}", headers=admin_headers)


# ── Rule 1: Reject writes above ROOT_OID ──────────────────────────────────────

@pytest.mark.asyncio
async def test_write_above_root_oid_rejected(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Attempting to create a node above ROOT_OID must be rejected by the trigger."""
    r = await client.post(
        "/oid",
        json={
            "oid_path": "2.16",  # above ROOT 2.16.840.1.113762
            "description": "Above root node",
            "visibility": "public",
        },
        headers=admin_headers,
    )
    # Trigger raises P0001; router translates DB errors to 409/400/500
    assert r.status_code in (400, 409, 500), (
        f"Expected 4xx/5xx for above-root write, got {r.status_code}: {r.text}"
    )


# ── Rule 2: Reject INSERT under a federated ancestor ──────────────────────────

@pytest.mark.asyncio
async def test_write_to_federated_ancestor_rejected(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Creating a child under a federated node must be rejected (P0002)."""
    parent = f"{ROOT}.800"
    child = f"{ROOT}.800.1"

    await _create(client, admin_headers, parent)
    await _delegate(client, admin_headers, parent)

    r = await client.post(
        "/oid",
        json={"oid_path": child, "description": "Child under federated", "visibility": "public"},
        headers=admin_headers,
    )
    assert r.status_code == 409, (
        f"Expected 409 for write under federated ancestor, got {r.status_code}: {r.text}"
    )

    # Cleanup: reclaim parent first so we can delete it
    await client.post(f"/oid/{parent}/reclaim", headers=admin_headers)
    await _delete(client, admin_headers, parent)


# ── Rule 3: Reject public visibility when any ancestor is private ──────────────

@pytest.mark.asyncio
async def test_public_under_private_rejected(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Cannot create a public node when its parent is private."""
    parent = f"{ROOT}.801"
    child = f"{ROOT}.801.1"

    await _create(client, admin_headers, parent, visibility="private")

    r = await client.post(
        "/oid",
        json={"oid_path": child, "description": "Public child of private parent", "visibility": "public"},
        headers=admin_headers,
    )
    assert r.status_code == 409, (
        f"Expected 409 for public child under private ancestor, got {r.status_code}: {r.text}"
    )

    # Cleanup
    await _delete(client, admin_headers, parent)


# ── Rule 4: Cascade private visibility to managed descendants ─────────────────

@pytest.mark.asyncio
async def test_visibility_cascade_private(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Setting a node to private cascades private visibility to all managed descendants."""
    parent = f"{ROOT}.802"
    child = f"{ROOT}.802.1"

    await _create(client, admin_headers, parent, visibility="public")
    await _create(client, admin_headers, child, visibility="public")

    # Anonymous GET confirms child is public before cascade
    r = await client.get(f"/oid/{child}")
    assert r.status_code == 200, "Child should be visible anonymously before cascade"

    # Set parent to private — trigger cascades to child
    r = await client.put(
        f"/oid/{parent}",
        json={"visibility": "private"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["visibility"] == "private"

    # Anonymous GET should now return 404 because child was cascaded to private
    r2 = await client.get(f"/oid/{child}")
    assert r2.status_code == 404, (
        f"Child should be private (404 for anonymous) after cascade, got {r2.status_code}"
    )

    # Admin can still see it and confirm visibility=private
    r3 = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r3.status_code == 200
    assert r3.json()["visibility"] == "private"

    # Cleanup (children first)
    await _delete(client, admin_headers, child)
    await _delete(client, admin_headers, parent)


# ── Rule 5: Cascade disabled status with pre_cascade_status saved ─────────────

@pytest.mark.asyncio
async def test_disable_cascade_saves_pre_cascade_status(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Disabling a parent cascades disabled to managed descendants and records pre_cascade_status."""
    parent = f"{ROOT}.803"
    child_dep = f"{ROOT}.803.1"   # will be deprecated before parent is disabled
    child_act = f"{ROOT}.803.2"   # stays active before parent is disabled

    await _create(client, admin_headers, parent)
    await _create(client, admin_headers, child_dep)
    await _create(client, admin_headers, child_act)

    # Deprecate first child
    await _put(client, admin_headers, child_dep, status="deprecated")

    # Disable parent — trigger cascades to both children
    r = await client.put(
        f"/oid/{parent}",
        json={"status": "disabled"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "disabled"

    # Both children should now be disabled
    r_dep = await client.get(f"/oid/{child_dep}", headers=admin_headers)
    assert r_dep.status_code == 200
    assert r_dep.json()["status"] == "disabled", (
        f"Deprecated child should be disabled after cascade, got {r_dep.json()['status']}"
    )

    r_act = await client.get(f"/oid/{child_act}", headers=admin_headers)
    assert r_act.status_code == 200
    assert r_act.json()["status"] == "disabled", (
        f"Active child should be disabled after cascade, got {r_act.json()['status']}"
    )

    # Cleanup (children first)
    await _delete(client, admin_headers, child_dep)
    await _delete(client, admin_headers, child_act)
    await _delete(client, admin_headers, parent)


# ── Rule 5 (audit): Disable cascade inserts DISABLE audit entries ─────────────

@pytest.mark.asyncio
async def test_disable_cascade_audit_entries(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Disabling a parent must produce DISABLE audit log entries for each cascaded descendant."""
    parent = f"{ROOT}.803"
    child_dep = f"{ROOT}.803.1"
    child_act = f"{ROOT}.803.2"

    # Nodes may already exist from the previous test (session-scoped DB).
    # Re-create only if they don't exist, otherwise just re-disable via re-enable first.
    for path, desc in [(parent, "P803"), (child_dep, "P803C1"), (child_act, "P803C2")]:
        r = await client.post(
            "/oid",
            json={"oid_path": path, "description": desc, "visibility": "public"},
            headers=admin_headers,
        )
        # 201 = fresh create, 409 = already exists — both are fine
        assert r.status_code in (201, 409), f"Unexpected status for {path}: {r.text}"

    # Ensure parent is active before disabling (re-enable if needed)
    parent_data = (await client.get(f"/oid/{parent}", headers=admin_headers)).json()
    if parent_data.get("status") == "disabled":
        await _put(client, admin_headers, parent, status="active")

    # Ensure children are active
    for child in (child_dep, child_act):
        cd = (await client.get(f"/oid/{child}", headers=admin_headers)).json()
        if cd.get("status") != "active":
            await _put(client, admin_headers, child, status="active")

    # Disable parent — trigger inserts DISABLE audit entries for children
    r = await client.put(
        f"/oid/{parent}",
        json={"status": "disabled"},
        headers=admin_headers,
    )
    assert r.status_code == 200

    # Verify DISABLE audit entry exists for child_dep
    r_audit = await client.get(f"/audit?oid_path={child_dep}", headers=admin_headers)
    assert r_audit.status_code == 200
    entries = r_audit.json()["entries"]
    actions = [e["action"] for e in entries]
    assert "DISABLE" in actions, (
        f"Expected DISABLE audit entry for {child_dep}, found actions: {actions}"
    )

    # Verify DISABLE audit entry exists for child_act
    r_audit2 = await client.get(f"/audit?oid_path={child_act}", headers=admin_headers)
    assert r_audit2.status_code == 200
    entries2 = r_audit2.json()["entries"]
    actions2 = [e["action"] for e in entries2]
    assert "DISABLE" in actions2, (
        f"Expected DISABLE audit entry for {child_act}, found actions: {actions2}"
    )

    # Cleanup (children first)
    await _delete(client, admin_headers, child_dep)
    await _delete(client, admin_headers, child_act)
    await _delete(client, admin_headers, parent)


# ── Rule 6: Re-enable restores pre_cascade_status ─────────────────────────────

@pytest.mark.asyncio
async def test_reenable_cascade_restores_pre_cascade_status(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Re-enabling a parent restores cascade-disabled descendants to their pre_cascade_status."""
    parent = f"{ROOT}.804"
    child_dep = f"{ROOT}.804.1"   # deprecated before cascade
    child_act = f"{ROOT}.804.2"   # active before cascade

    await _create(client, admin_headers, parent)
    await _create(client, admin_headers, child_dep)
    await _create(client, admin_headers, child_act)

    # Deprecate first child before the cascade
    await _put(client, admin_headers, child_dep, status="deprecated")

    # Disable parent → both children cascade to disabled
    await _put(client, admin_headers, parent, status="disabled")

    r_dep = await client.get(f"/oid/{child_dep}", headers=admin_headers)
    assert r_dep.json()["status"] == "disabled", "child_dep should be disabled after cascade"
    r_act = await client.get(f"/oid/{child_act}", headers=admin_headers)
    assert r_act.json()["status"] == "disabled", "child_act should be disabled after cascade"

    # Re-enable parent → trigger restores pre_cascade_status on cascade-disabled descendants
    r = await client.put(
        f"/oid/{parent}",
        json={"status": "active"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    # child_dep should be restored to deprecated (pre_cascade_status=deprecated)
    r_dep2 = await client.get(f"/oid/{child_dep}", headers=admin_headers)
    assert r_dep2.status_code == 200
    assert r_dep2.json()["status"] == "deprecated", (
        "child_dep should be restored to deprecated, not active"
    )

    # child_act should be restored to active (pre_cascade_status=active)
    r_act2 = await client.get(f"/oid/{child_act}", headers=admin_headers)
    assert r_act2.status_code == 200
    assert r_act2.json()["status"] == "active", (
        "child_act should be restored to active"
    )

    # Cleanup
    await _delete(client, admin_headers, child_dep)
    await _delete(client, admin_headers, child_act)
    await _delete(client, admin_headers, parent)


# ── Rule 6: Re-enable skips non-cascade-disabled descendants ──────────────────

@pytest.mark.asyncio
async def test_reenable_skips_independently_deprecated_nodes(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Re-enabling a parent does NOT restore nodes that were deprecated independently (not by cascade)."""
    parent = f"{ROOT}.805"
    child = f"{ROOT}.805.1"

    await _create(client, admin_headers, parent)
    await _create(client, admin_headers, child)

    # Deprecate child independently (no cascade involved)
    await _put(client, admin_headers, child, status="deprecated")

    # Disable parent → trigger sets child to disabled, pre_cascade_status=deprecated, disabled_by_cascade=true
    await _put(client, admin_headers, parent, status="disabled")

    r_child = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r_child.json()["status"] == "disabled", "child should be disabled after cascade"

    # Re-enable parent → child should revert to deprecated (pre_cascade_status), not active
    await _put(client, admin_headers, parent, status="active")

    r_child2 = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r_child2.status_code == 200
    assert r_child2.json()["status"] == "deprecated", (
        "child pre-existed as deprecated; re-enable should restore deprecated, not active"
    )

    # Cleanup
    await _delete(client, admin_headers, child)
    await _delete(client, admin_headers, parent)


# ── Rule 7: Delegate cascades node_type=federated to all descendants ──────────

@pytest.mark.asyncio
async def test_delegate_cascade_to_descendants(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Delegating a node cascades node_type=federated to all descendant nodes."""
    parent = f"{ROOT}.806"
    child = f"{ROOT}.806.1"
    grandchild = f"{ROOT}.806.1.1"

    await _create(client, admin_headers, parent)
    await _create(client, admin_headers, child)
    await _create(client, admin_headers, grandchild)

    # Verify both descendants are managed before delegation
    r_child_before = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r_child_before.json()["node_type"] == "managed"
    r_gc_before = await client.get(f"/oid/{grandchild}", headers=admin_headers)
    assert r_gc_before.json()["node_type"] == "managed"

    # Delegate parent — trigger cascades federated to child and grandchild
    await _delegate(client, admin_headers, parent)

    # Direct child should now be federated
    r_child = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r_child.status_code == 200
    assert r_child.json()["node_type"] == "federated", (
        f"child should be federated after delegate cascade, got {r_child.json()['node_type']}"
    )

    # Grandchild should also be federated
    r_gc = await client.get(f"/oid/{grandchild}", headers=admin_headers)
    assert r_gc.status_code == 200
    assert r_gc.json()["node_type"] == "federated", (
        f"grandchild should be federated after delegate cascade, got {r_gc.json()['node_type']}"
    )

    # Reclaim parent (leaves descendants federated, per spec — tested next)
    await client.post(f"/oid/{parent}/reclaim", headers=admin_headers)

    # Cleanup
    await _delete(client, admin_headers, grandchild)
    await _delete(client, admin_headers, child)
    await _delete(client, admin_headers, parent)


# ── Reclaim: only reverts the root node, leaves descendants federated ─────────

@pytest.mark.asyncio
async def test_reclaim_clears_only_root_node(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Reclaiming a delegated node reverts only that node; descendants remain federated."""
    parent = f"{ROOT}.807"
    child = f"{ROOT}.807.1"
    grandchild = f"{ROOT}.807.1.1"

    await _create(client, admin_headers, parent)
    await _create(client, admin_headers, child)
    await _create(client, admin_headers, grandchild)

    # Delegate parent (cascades to child and grandchild)
    await _delegate(client, admin_headers, parent)

    # Confirm cascade happened
    r_child = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r_child.json()["node_type"] == "federated", "child should be federated after delegate"

    # Reclaim parent only
    r_reclaim = await client.post(f"/oid/{parent}/reclaim", headers=admin_headers)
    assert r_reclaim.status_code == 200
    assert r_reclaim.json()["node_type"] == "managed", (
        "reclaimed parent should be managed"
    )

    # Parent is now managed
    r_parent = await client.get(f"/oid/{parent}", headers=admin_headers)
    assert r_parent.status_code == 200
    assert r_parent.json()["node_type"] == "managed", (
        "parent node_type should be managed after reclaim"
    )

    # Child remains federated (reclaim does NOT cascade back)
    r_child2 = await client.get(f"/oid/{child}", headers=admin_headers)
    assert r_child2.status_code == 200
    assert r_child2.json()["node_type"] == "federated", (
        "child should still be federated after reclaim of parent (reclaim is non-cascading)"
    )

    # Grandchild also remains federated
    r_gc = await client.get(f"/oid/{grandchild}", headers=admin_headers)
    assert r_gc.status_code == 200
    assert r_gc.json()["node_type"] == "federated", (
        "grandchild should still be federated after reclaim of parent"
    )

    # Cleanup: reclaim top-down (parent → child → grandchild) because the trigger
    # blocks reclaiming a node whose ancestor is still federated.
    await client.post(f"/oid/{child}/reclaim", headers=admin_headers)
    await client.post(f"/oid/{grandchild}/reclaim", headers=admin_headers)
    await _delete(client, admin_headers, grandchild)
    await _delete(client, admin_headers, child)
    await _delete(client, admin_headers, parent)
