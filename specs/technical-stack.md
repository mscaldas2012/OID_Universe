# OID Universe: Technical Stack

---

## Guiding Constraint

This is a self-hosted, single-administrator tool. Every technology choice MUST
favor operational simplicity and easy deployment over scale or ecosystem breadth.
A single `docker compose up` MUST bring the entire stack online.

---

## 1. Database: PostgreSQL 16 + `ltree`

The OID tree is a deep hierarchy with a single relationship type (`parent_of`).
PostgreSQL's `ltree` extension handles ancestor/descendant queries natively and
efficiently — no graph database required.

A single `oid_nodes` table represents the entire tree: managed nodes, delegated
sub-subtrees, and upward context arcs above the root. `node_type` controls
write access; `ltree` operators handle all traversal.

```sql
CREATE TYPE node_type AS ENUM ('managed', 'federated');

CREATE TABLE oid_nodes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oid_path         LTREE NOT NULL UNIQUE,
    node_type        node_type NOT NULL,
    label            TEXT NOT NULL,
    description      TEXT,
    visibility       TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    metadata         JSONB,
    -- populated only when node_type = 'federated'
    federation_url   TEXT,
    federation_label TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT federation_fields_required CHECK (
        node_type = 'managed'
        OR (federation_url IS NOT NULL AND federation_label IS NOT NULL)
    )
);

CREATE INDEX oid_gist_idx  ON oid_nodes USING GIST (oid_path);
CREATE INDEX oid_btree_idx ON oid_nodes USING BTREE (oid_path);
CREATE INDEX oid_type_idx  ON oid_nodes (node_type);
CREATE INDEX oid_fts_idx   ON oid_nodes
    USING GIN (to_tsvector('english',
        coalesce(label,'') || ' ' || coalesce(description,'')));

CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    oid_path    LTREE NOT NULL,
    action      TEXT NOT NULL,   -- 'create'|'update'|'delete'|'visibility'|'delegate'
    actor       TEXT NOT NULL,
    old_value   JSONB,
    new_value   JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- audit_log is append-only; no UPDATE or DELETE granted on this table
```

**Write guard trigger** — fires `BEFORE INSERT OR UPDATE` on `oid_nodes`:

```sql
-- Pseudologic (implemented as PL/pgSQL):
-- 1. Reject if target path is not a descendant-or-equal of ROOT_OID
--    (blocks writes above the root).
-- 2. Reject if any ancestor (including the node itself) within the subtree
--    has node_type = 'federated'. Return error with that node's federation_url.
-- 3. Reject if new visibility = 'public' and any ancestor is 'private'.
-- 4. On visibility change to 'private': cascade to all managed descendants.
-- 5. On delegate (node_type changed to 'federated'): cascade federation_type
--    to all descendants, log 'delegate' action for each.
```

**Ancestor chain query** (includes upward federation context + in-tree nodes):

```sql
-- All nodes on the path from root-of-tree to a given OID, ordered shallowest first
SELECT * FROM oid_nodes
WHERE oid_path @> '2.16.840.1.113762.3.1'::ltree
ORDER BY nlevel(oid_path);
-- Returns both 'federated' nodes above root and 'managed'/'federated' nodes below
```

---

## 2. Backend: Python + FastAPI

| Concern | Choice | Rationale |
|---|---|---|
| Framework | FastAPI | Async, OpenAPI spec auto-generated, minimal boilerplate |
| ORM | SQLAlchemy 2 (async) | Full ltree support via raw SQL; mature |
| Migrations | Alembic | Standard, deterministic, version-controlled schema changes |
| Auth | API key (admin) + Bearer token (credentialed read) | No OAuth complexity; tokens issued by the admin |
| Validation | Pydantic v2 | Built into FastAPI; fast |
| Testing | pytest + pytest-asyncio | Straightforward async test support |

**API surface (v1)**:

```
-- Read (visibility-filtered by auth level)
GET  /oid/{oid_path}            → node detail; federated nodes return pointer metadata
GET  /oid/{oid_path}/children   → immediate children (managed + federated)
GET  /oid/{oid_path}/ancestors  → full ancestor chain including upward federation nodes
GET  /search?q=                 → full-text search over label + description

-- Write (admin only; rejected for federated nodes or their descendants)
POST   /oid                     → create managed node (explicit visibility required)
PUT    /oid/{oid_path}          → update label/description/metadata/visibility
DELETE /oid/{oid_path}          → delete node + all managed descendants
POST   /oid/{oid_path}/delegate → convert managed node to federated (delegation)
POST   /oid/{oid_path}/reclaim  → convert federated node back to managed

-- Audit
GET  /audit?oid={oid_path}      → audit log for a node (admin only)
```

Write endpoints return `409 Conflict` with `{ "federation_url": "..." }` when
the target node or any ancestor within the subtree is federated.

---

## 3. Frontend: Next.js 14 (App Router)

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR for public OID pages; RSC for tree components |
| UI | shadcn/ui + Tailwind CSS | Unstyled, composable; no design-system lock-in |
| Tree navigation | Custom recursive component | OID hierarchy maps directly to a recursive list |
| State | React Server Components + minimal Zustand | No complex client state needed |
| Auth | Next-Auth v5 (credentials provider) | Simple session for the admin UI |

**Public pages**: Every public OID node is server-rendered at `/oid/<path>`.
Federated nodes display as read-only entries with a visible "managed by [label]"
badge linking to the `federation_url`. Ancestors above root appear in the
breadcrumb as federated entries with the same treatment.

**Admin UI**: Protected routes under `/admin` — create/edit/delete managed
nodes, delegate a node to a child instance, reclaim a delegated node, manage
visibility, view audit log.

---

## 4. Deployment

```yaml
# docker-compose.yml (complete local stack)
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: oid_universe
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./api
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres@db/oid_universe
      ADMIN_API_KEY: ${ADMIN_API_KEY}
      ROOT_OID: ${ROOT_OID}           # e.g. 2.16.840.1.113762
    depends_on: [db]

  web:
    build: ./web
    environment:
      API_URL: http://api:8000
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
    depends_on: [api]
    ports:
      - "3000:3000"
```

No Redis cache in v1 — PostgreSQL query performance is sufficient for
single-instance admin tool traffic. Add when measured latency justifies it.

---

## 5. Full Stack Summary

```
  Browser / API Client
         │
         ▼
  Next.js 14  (port 3000)
  ├─ Public tree browser (SSR — federated nodes shown with badge)
  └─ Admin UI (/admin — delegate, reclaim, edit, audit)
         │
         ▼
  FastAPI  (port 8000)
  ├─ Public endpoints  (no auth → public nodes only)
  ├─ Credentialed      (Bearer token → public + private)
  └─ Admin             (X-Admin-Key → write to managed nodes only)
         │
         ▼
  PostgreSQL 16 + ltree
  └─ oid_nodes  (managed + federated, write-guarded by trigger)
  └─ audit_log  (append-only, includes delegate/reclaim actions)
```

---

*Version 1.1 — April 2026.*
