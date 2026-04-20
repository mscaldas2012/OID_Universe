# OID Universe: Implementation Plan

**Date**: 2026-04-20
**Spec**: [constitution.md](constitution.md) | [technical-stack.md](technical-stack.md)

---

## Summary

A self-hosted, federated OID subtree manager. The administrator installs the
tool with a configured root OID and manages the entire subtree below it. Nodes
are `managed` or `federated` — a single unified type covering both upward
context (arcs above root) and downward delegation (sub-subtrees handed off to
child instances). Write operations are blocked on federated nodes and their
descendants. Visibility is public/private with downward cascade enforcement.

---

## Constitution Check

| Principle | Gate |
|---|---|
| I. Federated Subtree Ownership | Root OID from env; writes blocked above root and on federated descendants |
| II. Administrator-Centric Governance | All write paths require admin key; no other write roles |
| III. Two-Tier Visibility + Inheritance | Trigger enforces cascade; explicit visibility required on create |
| IV. Unified Federation Nodes | Single `node_type` field; write guard returns `federation_url` on block; `delegate`/`reclaim` actions audited |
| V. Subtree Integrity | Unique constraint on `oid_path`; immutable audit log including `delegate` action |
| VI. Simplicity | No live federation resolution, no cross-instance search in v1 |

---

## Technical Context

| | |
|---|---|
| **Language / Version** | Python 3.12 (API), TypeScript / Node 20 (Frontend) |
| **Primary Dependencies** | FastAPI, SQLAlchemy 2, Alembic, Next.js 14, shadcn/ui |
| **Storage** | PostgreSQL 16 + `ltree` |
| **Testing** | pytest + pytest-asyncio (API); Playwright (frontend E2E) |
| **Target Platform** | Self-hosted via Docker Compose |
| **Performance Goals** | p99 < 100ms for tree reads at single-instance scale |
| **Constraints** | Single `docker compose up` brings full stack; no external services required |

---

## Project Structure

```
oid-universe/
├── api/
│   ├── src/
│   │   ├── models/         # SQLAlchemy ORM models (OidNode, AuditLog)
│   │   ├── routers/        # FastAPI route handlers
│   │   ├── services/       # Business logic (write guard, visibility cascade, audit)
│   │   └── db/             # Alembic migrations + session management
│   └── tests/
│       ├── integration/    # Tests against real PostgreSQL
│       └── unit/
├── web/
│   ├── app/
│   │   ├── oid/[...path]/  # Public OID pages (SSR)
│   │   └── admin/          # Protected admin UI
│   └── components/
│       ├── tree/           # Recursive OID tree navigator
│       └── admin/          # Create/edit/delete/delegate forms
├── specs/
├── docker-compose.yml
└── .env.example
```

---

## Phases

### Phase 1: Foundation

**Goal**: Database schema + API skeleton + Docker Compose running end-to-end.

- [ ] `node_type` enum, `oid_nodes` table with federation fields + constraint
- [ ] `audit_log` table (append-only)
- [ ] Write guard trigger (blocks above-root writes + federated-ancestor writes)
- [ ] Visibility cascade trigger (private inheritance + cascade on update)
- [ ] Alembic migration setup
- [ ] FastAPI project skeleton with health check endpoint
- [ ] Admin key middleware
- [ ] Docker Compose wiring (db + api)
- [ ] `ROOT_OID` configured from environment variable; validated at startup

**Checkpoint**: `docker compose up` → health check passes → schema applied → trigger rejects a write above root.

---

### Phase 2: OID Node Management (Admin)

**Goal**: Administrator can CRUD managed nodes; write guard and visibility cascade enforced.

- [ ] `OidNode` SQLAlchemy model
- [ ] `GET /oid/{path}` — resolve node (auth-aware; federated nodes return pointer metadata)
- [ ] `GET /oid/{path}/children` — immediate children (managed + federated)
- [ ] `GET /oid/{path}/ancestors` — full ancestor chain including upward federation nodes
- [ ] `POST /oid` — create managed node (admin; explicit visibility required)
- [ ] `PUT /oid/{path}` — update label/description/metadata/visibility (managed only)
- [ ] `DELETE /oid/{path}` — delete managed node and all managed descendants
- [ ] Write endpoints return `409` with `federation_url` when target or ancestor is federated
- [ ] Audit log write on every mutation

**Checkpoint**: Create a tree; attempt to create a child of a federated node → 409 with federation_url; flip node to private → descendants cascade; delete subtree.

---

### Phase 3: Public & Credentialed Read Access

**Goal**: Unauthenticated callers see public nodes; credentialed callers see all.

- [ ] Bearer token issuance endpoint (admin creates tokens)
- [ ] Read middleware: filter private nodes for unauthenticated callers
- [ ] `GET /search?q=` — full-text search over managed nodes, visibility-filtered
- [ ] Structured error when a private node is requested without credentials

**Checkpoint**: Anonymous → public nodes only. Token bearer → private nodes visible.

---

### Phase 4: Federation Node Management

**Goal**: Administrator can seed upward context arcs and delegate sub-subtrees to child instances.

- [ ] `POST /oid/{path}/delegate` — convert managed node to federated; cascades to all descendants; logs `delegate` per node
- [ ] `POST /oid/{path}/reclaim` — convert federated node back to managed (admin undoes delegation)
- [ ] Seed script: pre-populate upward context arcs above `ROOT_OID` as federated nodes (e.g., `2`, `2.16`, `2.16.840`) from a config file
- [ ] `GET /oid/{path}/ancestors` correctly includes upward federated context
- [ ] Federated node response includes `federation_url` and `federation_label`

**Checkpoint**: Delegate `ROOT_OID.3` to a child instance → writes to `ROOT_OID.3.1` return 409. Reclaim → writes succeed again. Ancestors of any node include upward federation context.

---

### Phase 5: Admin Frontend

**Goal**: Web UI for the administrator; public tree browser.

- [ ] Next.js 14 project scaffold with Tailwind + shadcn/ui
- [ ] Public `/oid/[...path]` SSR pages with breadcrumb and children list
- [ ] Federated nodes display "managed by [label]" badge with link to `federation_url`
- [ ] JSON-LD `DefinedTerm` structured data on public managed node pages
- [ ] Admin login (NextAuth credentials provider, backed by admin key)
- [ ] Admin node create/edit/delete forms
- [ ] Admin delegate/reclaim UI with confirmation dialog
- [ ] Admin audit log viewer

**Checkpoint**: Browse public tree; federated nodes show badge. Log in as admin; delegate a node; verify writes to it are blocked in UI; reclaim it.

---

### Phase 6: Polish & Hardening

- [ ] OpenAPI spec review and documentation
- [ ] `.env.example` with all required variables and inline comments
- [ ] `README.md`: installation, configuration, first-run walkthrough, federation setup
- [ ] Rate limiting on public read endpoints
- [ ] Playwright E2E: public browse, admin CRUD, visibility cascade, delegate/reclaim flow

---

## Out of Scope (v1)

- Federated discovery or cross-instance search
- Live federation endpoint validation or proxying to remote instances
- Contributor or multi-user write roles
- Hierarchical admin delegation
- Redis caching layer (add when latency measurements justify it)

---

*Version 1.1 — April 2026.*
