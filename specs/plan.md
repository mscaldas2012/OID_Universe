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

## UI Design Reference

The prototype in `specs/design/` (React + plain JS, single-page) defines the target admin interface. Key design decisions locked in by the prototype:

**Two layout modes** (togglable via header control):
- **Explorer** — 290 px tree sidebar (`TreePanel`) + `NodeDetail` main panel
- **Registry** — full-width table (`RegistryPanel`) with optional `NodeDetail` side panel (360 px) when a row is selected

**Component inventory**:

| Component | File | Purpose |
|---|---|---|
| `TreePanel` | `oid-tree.jsx` | Sidebar: expand/collapse tree, inline search, status legend, stats footer |
| `RegistryPanel` | `oid-tree.jsx` | Table view: OID / Description / Status / Visibility / Delegation / Modified; status + visibility filters |
| `NodeDetail` | `oid-detail.jsx` | Detail pane: breadcrumb, OID heading, action bar, details grid (status, visibility, dates, refs, child list) |
| `AuditLog` | `oid-detail.jsx` | Slide-in 320 px right drawer; action-colored badges, clickable node IDs, user + timestamp |
| `NodeModal` | `oid-modals.jsx` | Add/edit node: arc preview, auto-suggested next arc, description, status, visibility, refs (one URL per line) |
| `DelegateModal` | `oid-modals.jsx` | Delegate arc: org name + contact/email |
| `ConfirmModal` | `oid-modals.jsx` | Reusable confirm dialog; `warn` variant for disable, `danger` variant for delete |
| `Toast` | `oid-app.jsx` | 2.2 s bottom-center notification |
| `TweaksPanel` | `oid-app.jsx` | Dev/demo panel: layout toggle, accent color (green/blue/amber via `--accent-hue`), density (comfortable/compact) |

**Design system** (from the HTML prototype):
- Dark OKLCH color palette; accent hue driven by a single `--accent-hue` CSS custom property
- Two font stacks: `--font-mono` (JetBrains Mono / monospace) for OID strings and metadata, `--font-ui` (Inter / sans-serif) for labels and prose
- Three status states: `active` (green glow dot), `deprecated` (amber, strikethrough), `disabled` (gray, 45 % opacity)
- Two visibility states: `public` (globe icon, blue badge), `private` (lock icon, purple badge)
- `localStorage` persists the last-selected node ID across reloads

**Node data shape** (from `oid-data.js`):
```
{
  id: string,           // full dotted OID, e.g. "2.16.840.1.113762.1.4"
  description: string,
  status: "active" | "deprecated" | "disabled",
  visibility: "public" | "private",
  delegation: { org: string, contact: string } | null,
  created: "YYYY-MM-DD",
  modified: "YYYY-MM-DD",
  refs: string[],       // external URLs
  children: Node[]
}
```

**UX rules enforced by the prototype** (must be reflected in API + frontend):
- Delete is blocked (button disabled + tooltip) when a node has children
- Disable triggers a confirmation modal that warns about child nodes inheriting a disabled parent
- Arc number is auto-suggested as `max(sibling arcs) + 1`; user can override
- Delegating an arc shows an inline description of the consequence before the form fields
- The audit log drawer shows per-entry: action badge (color-coded), node ID (clickable, focuses node), detail text, user, timestamp

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
│   │   ├── oid/[...path]/  # Public OID pages (SSR, visibility-filtered)
│   │   └── admin/          # Protected admin UI (NextAuth)
│   └── components/
│       ├── tree/           # TreePanel, TreeNode, RegistryPanel, RegistryRow
│       ├── detail/         # NodeDetail, Breadcrumb, AuditLog
│       ├── modals/         # NodeModal, DelegateModal, ConfirmModal
│       └── ui/             # Btn, Input, Textarea, StatusDot, VisBadge, Toast, Toggle
├── specs/
├── docker-compose.yml
└── .env.example
```

---

## Phases

### Phase 1: Foundation

**Goal**: Database schema + API skeleton + Docker Compose running end-to-end.

- [ ] `node_type` enum (`managed` | `federated`), `status` enum (`active` | `deprecated` | `disabled`)
- [ ] `oid_nodes` table: `oid_path ltree`, `node_type`, `status`, `visibility`, `description`, `refs text[]`, `federation_url`, `federation_label`, `delegation_contact`, `created_at`, `updated_at` + unique constraint on `oid_path`
- [ ] `audit_log` table (append-only): `id`, `ts`, `actor`, `action` (CREATE/UPDATE/DISABLE/DELETE/DELEGATE/RECLAIM), `node_oid`, `detail`
- [ ] Write guard trigger (blocks above-root writes + federated-ancestor writes; returns `federation_url` on block)
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

- [ ] `OidNode` SQLAlchemy model (fields: `oid_path`, `node_type`, `status`, `visibility`, `description`, `refs`, `federation_url`, `federation_label`, `delegation_contact`, `created_at`, `updated_at`)
- [ ] `GET /oid/{path}` — resolve node (auth-aware; federated nodes return pointer metadata including `federation_url`, `federation_label`, `delegation_contact`)
- [ ] `GET /oid/{path}/children` — immediate children (managed + federated)
- [ ] `GET /oid/{path}/ancestors` — full ancestor chain including upward federation nodes
- [ ] `POST /oid` — create managed node (admin; `status`, `visibility`, and `description` required; `refs` optional)
- [ ] `PUT /oid/{path}` — update description / visibility / status / refs on managed nodes; status transitions: any → `deprecated`, any → `disabled`, `disabled` → `active`; `deprecated` → `active` allowed
- [ ] `DELETE /oid/{path}` — delete leaf managed node only; return `409` if node has children (matches UI constraint: delete button disabled with children)
- [ ] Write endpoints return `409` with `federation_url` when target or ancestor is federated
- [ ] Audit log write on every mutation; `DISABLE` action recorded separately from generic `UPDATE` to match audit log badge colors in the UI

**Checkpoint**: Create a tree; attempt to create a child of a federated node → 409 with federation_url; flip node to private → descendants cascade; disable a node → re-enable it; attempt to delete a node with children → 409; delete a leaf.

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

- [ ] `POST /oid/{path}/delegate` — body: `{ federation_url, federation_label (org name), delegation_contact (email) }`; converts managed node to federated; cascades `node_type` to all descendants; logs `DELEGATE` per affected node
- [ ] `POST /oid/{path}/reclaim` — converts federated node back to managed; logs `RECLAIM`; does not cascade (descendants retain their own `node_type`)
- [ ] Seed script: pre-populate upward context arcs above `ROOT_OID` (e.g., `2`, `2.16`, `2.16.840`) as federated nodes from a config file; these have `federation_label` but no `delegation_contact`
- [ ] `GET /oid/{path}/ancestors` correctly includes upward federated context
- [ ] Federated node response shape: `{ ..., node_type: "federated", federation_url, federation_label, delegation_contact }` — maps to UI's `delegation: { org: federation_label, contact: delegation_contact }`

**Note on data model**: The UI prototype stores delegation as `{ org, contact }` on every node. In the API these map to `federation_label` (org name) and `delegation_contact` (email/contact string). `federation_url` is the additional field for technical federation linking — present in the API response but not shown in the current prototype UI.

**Checkpoint**: Delegate `ROOT_OID.3` to a child instance → writes to `ROOT_OID.3.1` return 409. Reclaim → writes succeed again. Ancestors of any node include upward federation context. Delegate modal pre-populates org + contact on re-open.

---

### Phase 5: Admin Frontend

**Goal**: Web UI for the administrator; public tree browser. Implements the two-layout design in `specs/design/`.

**Scaffold**:
- [ ] Next.js 14 project with Tailwind + shadcn/ui
- [ ] OKLCH dark color palette; `--accent-hue` CSS variable (default: 160 = green); accent options: green (160), blue (220), amber (70)
- [ ] Two font stacks: JetBrains Mono (`--font-mono`) for OID strings / metadata, Inter (`--font-ui`) for labels / prose
- [ ] Density tokens: `comfortable` (default padding) vs `compact` (reduced padding throughout)

**Public pages** (`/oid/[...path]`, SSR):
- [ ] Breadcrumb showing ancestor arc chain
- [ ] Node heading, description, status badge, visibility badge
- [ ] Children list with status dots and visibility badges
- [ ] References section (external URLs)
- [ ] Federated nodes: "managed by [federation_label]" badge linking to `federation_url`
- [ ] JSON-LD `DefinedTerm` structured data on public managed node pages
- [ ] Visibility-filtered: private nodes return 404 for unauthenticated requests

**Admin shell** (`/admin`, requires auth):
- [ ] NextAuth credentials provider backed by admin key
- [ ] Header: OID logo mark, root OID badge (`root · {ROOT_OID}`), Audit Log button with entry count badge, Add Root Child button
- [ ] Layout toggle in header: **Explorer** / **Registry**
- [ ] `localStorage` persistence for last-selected node ID

**Explorer layout** (default):
- [ ] `TreePanel` (290 px sidebar): inline search (filter by OID or description, auto-expands all on search), expand/collapse per node, status legend (active / deprecated / disabled), stats footer (total nodes · active · private)
- [ ] `TreeNode` row: indent by depth (16 px/level), chevron for expandable nodes, status dot (glow), arc label in mono, description in dim text, private lock icon, delegation icon
- [ ] `NodeDetail` main panel (flex 1): breadcrumb, full OID heading (22 px mono), description, status + visibility badges; action bar (Add Child, Edit, Delegate/Remove Delegation, Disable/Re-enable, Delete); details grid (Status, Visibility, Created, Modified, Direct Children count, Delegation org+contact, References, Child Nodes list)
- [ ] Empty state when no node is selected: "← select a node"

**Registry layout**:
- [ ] `RegistryPanel`: full-width table — columns: OID (mono, indented by depth), Description, Status (dot + label), Visibility (badge), Delegation (org name or —), Modified; sticky header
- [ ] Toolbar: search input, Status filter dropdown (All/Active/Deprecated/Disabled), Visibility filter dropdown (All/Public/Private)
- [ ] Selecting a row opens `NodeDetail` as a 360 px right side panel

**Modals**:
- [ ] `NodeModal` (add): arc preview box (`{parent}.{arc}`), auto-suggested next arc (max sibling + 1), arc number input, description textarea, Status select (Active/Deprecated/Disabled), Visibility select (Public/Private), References textarea (one URL per line); validation: description required, arc must be positive integer
- [ ] `NodeModal` (edit): same form, OID fixed (not editable), pre-populated
- [ ] `DelegateModal`: inline consequence description, Organization Name input, Contact/Email input; Save → calls delegate API; pre-populates on re-open if already delegated
- [ ] `ConfirmModal` — disable variant (`warn`): warns that child nodes inherit disabled parent; confirm label "Disable Node"
- [ ] `ConfirmModal` — delete variant (`danger`): warns permanent deletion; Delete button disabled + tooltip if node has children; confirm label "Delete Node"

**Audit log drawer**:
- [ ] `AuditLog` (320 px slide-in from right): action badges color-coded (CREATE=green, UPDATE=accent, DISABLE=amber, DELETE=red, DELEGATE=purple); clickable node ID focuses node in tree/table; detail text; actor email; timestamp (short date + time)

**Toast**:
- [ ] Bottom-center, 2.2 s auto-dismiss, green check icon, message text (e.g. "Created 2.16.840.1.113762.4")

**Checkpoint**: Browse public tree; federated nodes show delegation badge. Log in as admin; both layouts render correctly; create a child node with auto-suggested arc; edit it; disable with confirm modal → node shows at 45 % opacity; re-enable; delegate → delegation icon appears in tree; delete attempt on node with children → button disabled; delete leaf → toast confirmation; audit log drawer shows all actions with correct badge colors.

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

*Version 1.2 — April 2026. UI design from `specs/design/` incorporated.*
