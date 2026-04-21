# Data Model: OID Universe — Federated Subtree Manager

**Phase 1 output** | Branch: `001-oid-subtree-manager` | Date: 2026-04-20

---

## Entities

### 1. `OidNode`

Represents every node in the OID tree: locally managed nodes, upward context
arcs above `ROOT_OID`, and downward-delegated sub-subtrees.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, default `gen_random_uuid()` | |
| `oid_path` | `LTREE` | NOT NULL, UNIQUE | Full dotted-integer OID, dots replaced by `.` (ltree uses `.` natively) |
| `node_type` | `node_type` enum | NOT NULL | `managed` or `federated` |
| `status` | `node_status` enum | NOT NULL, default `active` | `active`, `deprecated`, `disabled` |
| `description` | `TEXT` | NOT NULL | Human-readable name and purpose of the node |
| `visibility` | `TEXT` | NOT NULL, CHECK `IN ('public','private')` | Access tier |
| `refs` | `TEXT[]` | nullable | External reference URLs |
| `metadata` | `JSONB` | nullable | Admin-defined key-value pairs; managed nodes only |
| `federation_url` | `TEXT` | nullable | URL of owning instance (federated nodes only) |
| `federation_label` | `TEXT` | nullable | Org name of owning instance (federated nodes only) |
| `delegation_contact` | `TEXT` | nullable | Contact email for the owning org |
| `disabled_by_cascade` | `BOOLEAN` | NOT NULL, default `false` | True when this node was disabled by a parent's disable cascade (not by direct admin action); used to identify which nodes to re-enable when parent is re-enabled |
| `pre_cascade_status` | `node_status` | nullable | Stores the node's status immediately before it was cascade-disabled; `NULL` when `disabled_by_cascade = false`. Allows re-enable to restore to the original status (`active` or `deprecated`) rather than always promoting to `active`. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` | Updated by trigger on every write |

**Constraints**:
```sql
CREATE TYPE node_type   AS ENUM ('managed', 'federated');
CREATE TYPE node_status AS ENUM ('active', 'deprecated', 'disabled');

-- Federation fields required when node is federated
CONSTRAINT federation_fields_required CHECK (
    node_type = 'managed'
    OR (federation_url IS NOT NULL AND federation_label IS NOT NULL)
)
```

**Indexes**:
```sql
CREATE INDEX oid_gist_idx ON oid_nodes USING GIST (oid_path);   -- subtree queries
CREATE INDEX oid_btree_idx ON oid_nodes USING BTREE (oid_path); -- exact match
CREATE INDEX oid_type_idx  ON oid_nodes (node_type);
CREATE INDEX oid_status_idx ON oid_nodes (status);
CREATE INDEX oid_vis_idx   ON oid_nodes (visibility);
CREATE INDEX oid_fts_idx   ON oid_nodes
    USING GIN (to_tsvector('english', description));
```

**Status semantics**:

| Status | Meaning | Cascades to children? | Still resolves via API? |
|---|---|---|---|
| `active` | In service | — | Yes |
| `deprecated` | Superseded/retired; existing references still work | **No** — per-node editorial mark only | Yes (with deprecated indicator) |
| `disabled` | Operationally out of service | **Yes** — entire subtree disabled | Yes (record returned with `status: disabled`) |

**State transitions** (enforced in service layer and DB trigger):

```
status:
  active ──► deprecated         (no cascade)
  active ──► disabled           (cascades disabled to all managed descendants)
  deprecated ──► active         (no cascade)
  deprecated ──► disabled       (cascades disabled to all managed descendants)
  disabled ──► active           (reverses cascade: re-enables only cascade-disabled descendants)
  disabled ──► deprecated       (no cascade; marks the now-restored node as retired)

visibility:
  public ──► private  (cascade to all managed descendants)
  private ──► public  (rejected if any ancestor is private)

node_type:
  managed ──► federated  (via POST /oid/{path}/delegate; cascades to descendants)
  federated ──► managed  (via POST /oid/{path}/reclaim)
```

**Invariants enforced by DB trigger** (`BEFORE INSERT OR UPDATE`):
1. `oid_path` must be a descendant-or-equal of `ROOT_OID` — no writes above root.
2. No ancestor (including the node itself) within the subtree may be `federated`.
   If violated: `409` with `federation_url` of the blocking node.
3. `visibility = 'public'` rejected if any ancestor is `private`.
4. On `visibility` change to `'private'`: cascade to all managed descendants.
5. On `status` change to `'disabled'`: for each managed descendant, save its current `status` into `pre_cascade_status`, set `status = 'disabled'`, set `disabled_by_cascade = true`; log `DISABLE` per node.
6. On `status` change from `'disabled'` to `'active'`: for each managed descendant where `disabled_by_cascade = true`, restore `status` from `pre_cascade_status` (preserving `deprecated` nodes as `deprecated`), clear `pre_cascade_status = NULL`, clear `disabled_by_cascade = false`; log `UPDATE` per restored node.
7. On `node_type` change to `'federated'` (delegate): cascade `node_type` to all
   descendants and log `DELEGATE` for each.

---

### 2. `AuditLog`

Immutable record of every mutation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK | |
| `oid_path` | `LTREE` | NOT NULL | Path at time of action (not a FK — node may be deleted) |
| `action` | `TEXT` | NOT NULL | See action vocabulary below |
| `actor` | `TEXT` | NOT NULL | Admin key fingerprint or `"admin"` |
| `old_value` | `JSONB` | nullable | Snapshot before change |
| `new_value` | `JSONB` | nullable | Snapshot after change |
| `recorded_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` | |

**Action vocabulary** (matches UI audit log badge colors):

| Action | Trigger | UI badge color |
|---|---|---|
| `CREATE` | `POST /oid` | green |
| `UPDATE` | `PUT /oid/{path}` (non-status) | accent |
| `DISABLE` | `PUT /oid/{path}` with `status=disabled` | amber |
| `DELETE` | `DELETE /oid/{path}` | red |
| `DELEGATE` | `POST /oid/{path}/delegate` (one per affected node) | purple |
| `RECLAIM` | `POST /oid/{path}/reclaim` | accent |
| `VISIBILITY` | `PUT /oid/{path}` with visibility change | accent |

`DISABLE` is recorded as a distinct action (not generic `UPDATE`) so the UI
can render the amber badge without inspecting the payload.

**Append-only enforcement**:
```sql
-- No UPDATE or DELETE privileges granted to the application role on audit_log
REVOKE UPDATE, DELETE ON audit_log FROM oid_app_role;
```

---

## Full DDL

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- Enums
CREATE TYPE node_type   AS ENUM ('managed', 'federated');
CREATE TYPE node_status AS ENUM ('active', 'deprecated', 'disabled');

-- Main node table
CREATE TABLE oid_nodes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    oid_path            LTREE       NOT NULL,
    node_type           node_type   NOT NULL,
    status              node_status NOT NULL DEFAULT 'active',
    description         TEXT        NOT NULL,
    visibility          TEXT        NOT NULL CHECK (visibility IN ('public', 'private')),
    refs                TEXT[],
    metadata            JSONB,
    federation_url      TEXT,
    federation_label    TEXT,
    delegation_contact  TEXT,
    disabled_by_cascade BOOLEAN     NOT NULL DEFAULT false,
    pre_cascade_status  node_status,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT oid_path_unique UNIQUE (oid_path),
    CONSTRAINT federation_fields_required CHECK (
        node_type = 'managed'
        OR (federation_url IS NOT NULL AND federation_label IS NOT NULL)
    )
);

CREATE INDEX oid_gist_idx   ON oid_nodes USING GIST  (oid_path);
CREATE INDEX oid_btree_idx  ON oid_nodes USING BTREE (oid_path);
CREATE INDEX oid_type_idx   ON oid_nodes (node_type);
CREATE INDEX oid_status_idx ON oid_nodes (status);
CREATE INDEX oid_vis_idx    ON oid_nodes (visibility);
CREATE INDEX oid_fts_idx    ON oid_nodes
    USING GIN (to_tsvector('english', description));

-- Audit log
CREATE TABLE audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    oid_path    LTREE       NOT NULL,
    action      TEXT        NOT NULL,
    actor       TEXT        NOT NULL,
    old_value   JSONB,
    new_value   JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_path_idx ON audit_log (oid_path);
CREATE INDEX audit_ts_idx   ON audit_log (recorded_at DESC);
```

---

## SQLAlchemy Models (Python)

```python
# api/src/models/oid_node.py
import enum
from sqlalchemy import Column, String, Text, ARRAY, JSON, DateTime, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy_utils import LtreeType   # or raw Text with cast
from .base import Base

class NodeType(str, enum.Enum):
    managed   = "managed"
    federated = "federated"

class NodeStatus(str, enum.Enum):
    active     = "active"
    deprecated = "deprecated"
    disabled   = "disabled"

class OidNode(Base):
    __tablename__ = "oid_nodes"

    id                 = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    oid_path           = Column(Text, nullable=False, unique=True)   # stored as ltree via cast
    node_type          = Column(String, nullable=False)
    status             = Column(String, nullable=False, default="active")
    description        = Column(Text, nullable=False)
    visibility         = Column(Text, nullable=False)
    refs               = Column(ARRAY(Text))
    metadata_          = Column("metadata", JSONB)
    federation_url     = Column(Text)
    federation_label   = Column(Text)
    delegation_contact = Column(Text)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id          = Column("id", nullable=False, primary_key=True)  # BIGSERIAL
    oid_path    = Column(Text, nullable=False)
    action      = Column(Text, nullable=False)
    actor       = Column(Text, nullable=False)
    old_value   = Column(JSONB)
    new_value   = Column(JSONB)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
```

---

## Pydantic Schemas (API request/response)

```python
# api/src/schemas/oid_node.py
from pydantic import BaseModel, HttpUrl
from typing import Optional
from enum import Enum

class NodeType(str, Enum):
    managed   = "managed"
    federated = "federated"

class NodeStatus(str, Enum):
    active     = "active"
    deprecated = "deprecated"
    disabled   = "disabled"

class Visibility(str, Enum):
    public  = "public"
    private = "private"

class OidNodeBase(BaseModel):
    description: str
    visibility:  Visibility
    status:      NodeStatus = NodeStatus.active
    refs:        list[str]  = []
    metadata:    Optional[dict] = None

class OidNodeCreate(OidNodeBase):
    oid_path: str   # full dotted OID; parent must exist

class OidNodeUpdate(BaseModel):
    description: Optional[str]        = None
    visibility:  Optional[Visibility] = None
    status:      Optional[NodeStatus] = None
    refs:        Optional[list[str]]  = None
    metadata:    Optional[dict]       = None

class OidNodeResponse(OidNodeBase):
    id:                 str
    oid_path:           str
    node_type:          NodeType
    federation_url:     Optional[str] = None
    federation_label:   Optional[str] = None
    delegation_contact: Optional[str] = None
    created_at:         str
    updated_at:         str

class DelegateRequest(BaseModel):
    federation_url:     str
    federation_label:   str          # org name
    delegation_contact: Optional[str] = None  # contact email

class AuditLogEntry(BaseModel):
    id:          int
    oid_path:    str
    action:      str
    actor:       str
    old_value:   Optional[dict] = None
    new_value:   Optional[dict] = None
    recorded_at: str
```
