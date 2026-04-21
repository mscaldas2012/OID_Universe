# API Contract: OID Universe

**Phase 1 output** | Branch: `001-oid-subtree-manager` | Date: 2026-04-20  
**Base URL**: `http://localhost:8000` (local) — configured via `API_URL` env var

---

## Authentication

| Caller | Header | Grants |
|---|---|---|
| Unauthenticated | — | Read public nodes only |
| Credentialed | `Authorization: Bearer <token>` | Read public + private nodes |
| Administrator | `X-Admin-Key: <key>` | Full read + write on managed nodes |

Tokens are issued by the administrator via `POST /auth/token`. The admin key is
set at deploy time via `ADMIN_API_KEY` environment variable.

---

## Common Response Codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Node created |
| `204` | Deleted |
| `400` | Bad request (validation error) |
| `401` | Authentication required |
| `403` | Forbidden (write attempted without admin key) |
| `404` | Node not found or private (visibility-filtered) |
| `409` | Write blocked — target or ancestor is federated; body contains `federation_url` |
| `422` | Request body validation error (Pydantic) |

**409 body shape**:
```json
{
  "detail": "Write blocked: node 2.16.840.1.113762.1.4 is federated.",
  "federation_url": "https://hl7-oid-instance.example.org",
  "federation_label": "HL7 International"
}
```

---

## Node Read Endpoints

### `GET /oid/{oid_path}`

Resolve a node by its full dotted OID path.

**Auth**: unauthenticated (public nodes only) or Bearer/Admin.  
**Path param**: `oid_path` — e.g. `2.16.840.1.113762.1.4`

**Response 200** — managed node:
```json
{
  "id": "uuid",
  "oid_path": "2.16.840.1.113762.1.4",
  "node_type": "managed",
  "status": "active",
  "description": "Value Set Definitions — VSAC sub-arc",
  "visibility": "public",
  "refs": ["https://www.hl7.org/fhir/valueset.html"],
  "metadata": null,
  "federation_url": null,
  "federation_label": null,
  "delegation_contact": null,
  "created_at": "2019-06-15T00:00:00Z",
  "updated_at": "2025-01-20T00:00:00Z"
}
```

**Response 200** — federated node:
```json
{
  "id": "uuid",
  "oid_path": "2.16.840.1.113762.1.4",
  "node_type": "federated",
  "status": "active",
  "description": "Value Set Definitions (managed by HL7 International)",
  "visibility": "public",
  "refs": [],
  "metadata": null,
  "federation_url": "https://hl7-oid-instance.example.org",
  "federation_label": "HL7 International",
  "delegation_contact": "vocab@hl7.org",
  "created_at": "2019-06-15T00:00:00Z",
  "updated_at": "2025-01-20T00:00:00Z"
}
```

**Response 404**: node not found or private without credentials.

---

### `GET /oid/{oid_path}/children`

Immediate children of a node, visibility-filtered.

**Response 200**:
```json
{
  "oid_path": "2.16.840.1.113762.1",
  "children": [ /* array of OidNodeResponse */ ]
}
```

---

### `GET /oid/{oid_path}/ancestors`

Full ancestor chain from root-of-tree to the node, shallowest first.
Includes all federation nodes above `ROOT_OID`.

**Response 200**:
```json
{
  "oid_path": "2.16.840.1.113762.1.4.1",
  "ancestors": [ /* array of OidNodeResponse, ordered shallowest first */ ]
}
```

---

### `GET /search`

Full-text search over `description`. Visibility-filtered.

**Query params**:
- `q` (string, required) — search terms
- `status` (optional) — filter: `active`, `deprecated`, `disabled`, or omit for all
- `visibility` (optional) — filter: `public`, `private`, or omit for all (auth-gated)
- `limit` (int, default 50, max 200)
- `offset` (int, default 0)

**Response 200**:
```json
{
  "q": "value set",
  "total": 12,
  "results": [ /* array of OidNodeResponse */ ]
}
```

---

## Node Write Endpoints (Admin only — requires `X-Admin-Key`)

### `POST /oid`

Create a new managed node.

**Request body**:
```json
{
  "oid_path": "2.16.840.1.113762.1.4.3",
  "description": "Genomic Variant Codes — germline and somatic variant classification",
  "visibility": "public",
  "status": "active",
  "refs": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
  "metadata": { "owner_team": "genomics" }
}
```

- `description` and `visibility` are **required** — no silent defaults (Principles I/III).
- `oid_path`'s parent node must already exist.
- `status` defaults to `active` if omitted.

**Response 201**: `OidNodeResponse`  
**Response 409**: parent or ancestor is federated.

---

### `PUT /oid/{oid_path}`

Update a managed node's mutable fields.

**Request body** (all fields optional; omitted fields unchanged):
```json
{
  "description": "Updated description",
  "visibility": "private",
  "status": "deprecated",
  "refs": ["https://new-ref.example.org"],
  "metadata": { "key": "value" }
}
```

**Visibility change rules**:
- `public → private`: cascades `private` to all managed descendants.
- `private → public`: rejected if any ancestor is `private`.

**Status change rules**: any transition listed in [data-model.md](../data-model.md) is allowed.
`status=disabled` is recorded as action `DISABLE` in the audit log (not generic `UPDATE`).

**Response 200**: updated `OidNodeResponse`  
**Response 409**: node or ancestor is federated.

---

### `DELETE /oid/{oid_path}`

Delete a leaf managed node. Blocked if the node has children.

**Response 204**: deleted.  
**Response 409**: node has children — body:
```json
{
  "detail": "Cannot delete node with children. Delete children first.",
  "child_count": 3
}
```

---

## Federation Endpoints (Admin only)

### `POST /oid/{oid_path}/delegate`

Convert a managed node (and cascade to all its descendants) to a federation node.

**Request body**:
```json
{
  "federation_url": "https://child-instance.example.org",
  "federation_label": "Child Org Name",
  "delegation_contact": "admin@child-instance.example.org"
}
```

- One `DELEGATE` audit log entry is written per affected node.
- After delegation, all writes to this node or its descendants return `409`.

**Response 200**: updated `OidNodeResponse` (node_type = `federated`)

---

### `POST /oid/{oid_path}/reclaim`

Convert a federated node back to managed. Does **not** cascade to descendants
(each descendant retains its own `node_type`; admin must reclaim individually).

**Response 200**: updated `OidNodeResponse` (node_type = `managed`)

---

## Audit Endpoint (Admin only)

### `GET /audit`

**Query params**:
- `oid_path` (optional) — filter to entries for a specific node
- `action` (optional) — filter by action type
- `limit` (int, default 50, max 500)
- `offset` (int, default 0)

**Response 200**:
```json
{
  "total": 42,
  "entries": [
    {
      "id": 8,
      "oid_path": "2.16.840.1.113762.1.4.1.6",
      "action": "UPDATE",
      "actor": "admin",
      "old_value": { "status": "draft" },
      "new_value": { "status": "active" },
      "recorded_at": "2024-11-01T15:33:00Z"
    }
  ]
}
```

---

## Auth Endpoint

### `POST /auth/token`

Issue a read-only Bearer token. Admin only.

**Request body**:
```json
{ "label": "API consumer description" }
```

**Response 200**:
```json
{ "id": 1, "token": "hex-string", "label": "API consumer description" }
```

### `DELETE /auth/token/{token_id}`

Revoke a Bearer token by its numeric ID. Admin only.

**Path param**: `token_id` — integer ID returned in the `POST /auth/token` response (add `id` field to response).

**Response 204**: token revoked.  
**Response 404**: token not found.

> After revocation the token is rejected immediately on next use. The `revoked_at` timestamp is set; the row is retained for audit purposes.

---

### `GET /health`

Health check. No auth required.

**Response 200**: `{ "status": "ok", "root_oid": "2.16.840.1.113762" }`
