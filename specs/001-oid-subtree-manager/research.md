# Research: OID Universe — Federated Subtree Manager

**Phase 0 output** | Branch: `001-oid-subtree-manager` | Date: 2026-04-20

All decisions were made before this planning pass. This document records the
rationale so implementers understand *why* each choice was made.

---

## Decision 1: PostgreSQL + `ltree` for tree storage

**Decision**: Use PostgreSQL 16 with the `ltree` extension as the sole database.

**Rationale**: OID paths are dotted-integer strings (`2.16.840.1.113762.3.1`)
that map naturally to `ltree` labels. `ltree` provides:
- `@>` / `<@` operators for ancestor/descendant queries without recursive CTEs
- GiST index for subtree scans
- Unique constraint on `oid_path` enforces Principle V at the DB layer

Visibility cascade and write-guard are implemented as `BEFORE` triggers so the
invariants are enforced regardless of which code path reaches the DB.

**Alternatives considered**:
- *Adjacency list (parent_id FK)*: Requires recursive CTE for subtree queries;
  slower for deep trees; no native path indexing.
- *Nested sets (left/right integers)*: Fast reads but expensive inserts/moves;
  complex trigger logic. Rejected for operational simplicity.
- *Graph database (Neo4j, AWS Neptune)*: Operationally heavy; contradicts
  Principle VI (single `docker compose up`).
- *Redis for caching*: Explicitly deferred to post-v1; single-admin traffic
  does not justify the operational complexity.

---

## Decision 2: Single `oid_nodes` table for all node types

**Decision**: One table holds managed nodes, upward federation context arcs,
and delegated sub-subtrees. `node_type` enum (`managed` | `federated`)
distinguishes them.

**Rationale**: Upward context arcs and downward delegation are semantically the
same thing: "this OID is owned by another instance, here is its pointer." A
single representation satisfies Principle IV and avoids JOIN complexity.

**Alternatives considered**:
- *Separate `federation_pointers` table*: Was the v1.0 design (see constitution
  change log). Rejected at v1.1 because it created two code paths for
  ancestor-chain resolution and complicated the write guard.

---

## Decision 3: FastAPI + SQLAlchemy 2 (async) for the API

**Decision**: Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2.

**Rationale**:
- FastAPI generates an OpenAPI spec automatically, which is required for Phase 6
  documentation.
- SQLAlchemy 2 async mode works with `asyncpg` for non-blocking DB calls and
  supports raw SQL for `ltree` queries that the ORM cannot express natively.
- Alembic provides deterministic, version-controlled schema migrations suitable
  for self-hosted operators upgrading over time.
- Pydantic v2 is built into FastAPI and handles the request/response validation
  boundary cleanly.

**Alternatives considered**:
- *Django + DRF*: Heavier; ORM less suited to custom `ltree` queries; slower
  startup. Rejected.
- *Flask + SQLAlchemy*: No async support out of the box; more boilerplate for
  OpenAPI. Rejected.
- *Rust / Axum*: Faster but adds compile-time friction; harder for small
  self-hosted teams to maintain. Rejected per Principle VI.

---

## Decision 4: Auth — API key (admin) + Bearer token (credentialed read)

**Decision**: Admin writes use `X-Admin-Key` header (long random hex string from
env). Credentialed read-only callers use a Bearer token issued by the admin via
a dedicated endpoint.

**Rationale**: Aligns exactly with Principle II. No third-party auth service
required; no OAuth complexity; tokens can be revoked by the admin. Suitable for
a self-hosted tool with one administrator.

**Alternatives considered**:
- *OAuth2 / OIDC*: Requires an identity provider; contradicts operational
  simplicity goal.
- *Session cookies*: Works for the web UI (NextAuth handles this) but
  unnecessarily stateful for API callers.
- *mTLS*: Operationally complex for self-hosters.

Admin session for the web UI is handled by NextAuth v5 credentials provider
backed by the same `ADMIN_API_KEY` — no separate user database needed.

---

## Decision 5: Node `status` field (active / deprecated / disabled)

**Decision**: Add a `status` enum (`active` | `deprecated` | `disabled`) to
`oid_nodes`. This field is independent of `node_type` and `visibility`.

### Semantic distinction

**Deprecated** — an editorial mark on a *single node*. The OID is superseded or
retired but remains fully resolvable. The API still returns it; public pages
still render it. No cascade — children can remain `active`. Visual: strikethrough
text in the UI. Use when an arc has been reassigned or a standard has moved on
and existing references must keep working.

**Disabled** — an operational shutdown. The node and its *entire subtree* are
taken offline. Cascades `disabled` status to all managed descendants (analogous
to `visibility → private` cascade). The API still returns node records (with
`status: disabled`) so the audit trail is preserved, but the subtree is treated
as inactive. Visual: 45 % opacity in the UI. Use when an arc must be suspended
entirely and children cannot remain in service independently.

### Status transition rules

- `active` → `deprecated` ✅ (no cascade)
- `active` → `disabled` ✅ (confirmation modal; cascades to all managed descendants)
- `disabled` → `active` ✅ (re-enable; cascade: restore children to `active` only if they were set to `disabled` by this cascade — children independently deprecated stay deprecated)
- `deprecated` → `active` ✅ (no cascade)
- `deprecated` → `disabled` ✅ (cascades to all managed descendants)
- `disabled` → `deprecated` ✅ (no cascade; reverses the operational shutdown but marks the node as retired)

### Cascade implementation

The disable cascade is enforced in the DB trigger (`BEFORE UPDATE` on
`oid_nodes`): when `status` changes to `disabled`, all managed descendants have
their `status` set to `disabled` as well. The trigger records a `DISABLE` audit
entry for each affected node. Re-enable (`disabled → active`) restores only
direct cascade victims (tracked via a `disabled_by_cascade` boolean flag or a
`cascade_source_id` reference on each affected row — implementation detail for
the trigger to decide), leaving independently deprecated children alone.

---

## Decision 6: `refs` array field for external URLs

**Decision**: Add `refs TEXT[]` to `oid_nodes` for external reference URLs.

**Rationale**: OID standards frequently reference external documents (e.g.,
HL7 FHIR specs, LOINC pages). The UI prototype shows a "References" section
on the node detail panel. Storing as a PostgreSQL text array avoids a separate
`node_references` join table for a simple list.

---

## Decision 7: `delegation_contact` alongside `federation_url` / `federation_label`

**Decision**: Federation nodes carry three fields: `federation_url` (technical
pointer to the child instance), `federation_label` (org name, e.g. "HL7
International"), and `delegation_contact` (email or contact string).

**Rationale**: The UI prototype stores delegation as `{ org, contact }`. The
constitution requires `federation_url` + `federation_label`. These are additive:
`federation_label` ↔ org name, `delegation_contact` ↔ contact email,
`federation_url` ↔ instance URL. All three are stored; the UI exposes org +
contact; the API exposes all three.

---

## Decision 8: Next.js 14 (App Router) + shadcn/ui for the frontend

**Decision**: TypeScript / Node 20, Next.js 14, shadcn/ui + Tailwind, NextAuth
v5, Zustand (minimal), Playwright for E2E.

**Rationale**: Next.js App Router enables SSR for public OID pages (SEO, JSON-LD
structured data) while keeping the admin UI as a protected client-rendered shell.
shadcn/ui provides accessible, unstyled primitives that can be themed to the
OKLCH dark palette from the prototype without fighting a design system.

**Alternatives considered**:
- *SvelteKit*: Simpler mental model but smaller ecosystem; shadcn/ui equivalent
  is less mature.
- *Remix*: Good SSR story but App Router is now the better-documented path for
  Next.js operators.
- *Pure SPA (Vite + React)*: Loses SSR for public pages; SEO matters for OID
  resolution.

---

## Decision 9: Write-guard and visibility-cascade in DB triggers, not application layer

**Decision**: Both the write guard and the visibility cascade are implemented as
PostgreSQL `BEFORE` triggers on `oid_nodes`.

**Rationale**: DB-level enforcement means the invariants hold regardless of which
code path writes to the table — direct SQL during migrations, tests, or future
clients. Application-layer guards can be bypassed or forgotten; DB triggers
cannot. This is the implementation of Principle IV's "MUST enforce" language.

---

## Decision 10: Delete blocked when node has children (leaf-only delete)

**Decision**: `DELETE /oid/{path}` returns `409` if the node has managed
children. The UI disables the delete button with a tooltip in this case.

**Rationale**: OID assignments are meant to be stable. Requiring the admin to
delete children bottom-up prevents accidental subtree erasure. This is stricter
than the constitution's "delete node + all managed descendants" language in the
Phase 2 checkpoint — the UI prototype enforces the leaf-only rule and that
design decision is locked in.

**Amendment**: `specs/plan.md` Phase 2 was updated to reflect this. If bulk
subtree delete is needed in a future version, it should be a separate
`DELETE /oid/{path}?cascade=true` endpoint with an explicit confirmation step.
