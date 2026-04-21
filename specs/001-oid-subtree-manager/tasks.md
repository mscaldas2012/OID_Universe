# Tasks: OID Universe — Federated Subtree Manager

**Input**: Design documents from `specs/001-oid-subtree-manager/`  
**Branch**: `001-oid-subtree-manager` | **Date**: 2026-04-20  
**Prerequisites**: plan.md ✅ · research.md ✅ · data-model.md ✅ · contracts/api.md ✅ · quickstart.md ✅

**Tests**: Integration tests included for API; Playwright E2E in Polish phase.  
No unit-test scaffolding unless individual tasks call it out — tests run against real PostgreSQL via testcontainers.

**Organization**: Phases map to the delivery phases in `specs/plan.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US#]**: User story label — maps to plan phases below
- **Exact file paths required** in every task description

---

## Phase 1: Setup (Project Scaffolding)

**Purpose**: Create repository layout, package manifests, and CI skeletons.

- [x] T001 Create monorepo directory layout: `api/`, `web/`, `specs/`, `docker-compose.yml`, `.env.example` per `specs/001-oid-subtree-manager/plan.md` project structure
- [x] T002 [P] Initialize Python 3.12 project in `api/` with `pyproject.toml` (FastAPI, SQLAlchemy 2, Alembic, asyncpg, Pydantic v2, pytest, pytest-asyncio, testcontainers)
- [x] T003 [P] Initialize Next.js 14 TypeScript project in `web/` with Tailwind CSS, shadcn/ui, NextAuth v5 (`npx create-next-app@14 web --typescript --tailwind --app`)
- [x] T004 [P] Configure Python linting in `api/` (`ruff.toml`, `mypy.ini`)
- [x] T005 [P] Configure TypeScript + ESLint in `web/` (`tsconfig.json`, `.eslintrc.json`, `.prettierrc`)
- [x] T006 Write `.env.example` with all required variables: `ROOT_OID`, `ADMIN_API_KEY`, `NEXTAUTH_SECRET`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `API_PORT=8000`, `WEB_PORT=3000`

**Checkpoint**: All package manifests resolve cleanly; `pnpm install` and `pip install` succeed.

---

## Phase 2: Foundational (DB + API Skeleton + Docker)

**Purpose**: Everything that MUST be complete before any user story can be implemented.  
**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database

- [x] T007 Enable `ltree` and `pgcrypto` extensions; create `node_type` and `node_status` enums; create full `oid_nodes` (including `disabled_by_cascade BOOLEAN NOT NULL DEFAULT false` and `pre_cascade_status node_status`) + `audit_log` DDL per `specs/001-oid-subtree-manager/data-model.md` as Alembic migration `api/src/db/migrations/versions/001_initial_schema.py`
- [x] T008 Implement write-guard PL/pgSQL trigger (`BEFORE INSERT OR UPDATE` on `oid_nodes`): (1) reject writes above `ROOT_OID`; (2) reject if any ancestor within subtree is `federated`; (3) reject `public` visibility if any ancestor is `private`; (4) on `visibility → private` cascade to all managed descendants; (5) on `status → disabled` cascade `disabled` to all managed descendants — save each node's current `status` into `pre_cascade_status`, set `disabled_by_cascade = true`, log `DISABLE` per node; (6) on `status disabled → active` restore descendants where `disabled_by_cascade = true` — set `status = pre_cascade_status` (preserving `deprecated`), clear `pre_cascade_status = NULL`, clear `disabled_by_cascade = false`, log `UPDATE` per node; (7) on `node_type → federated` cascade `node_type` to all descendants, log `DELEGATE` per node. Add as migration `api/src/db/migrations/versions/002_write_guard_trigger.py`
- [x] T009 Create GiST, BTree, FTS and status/visibility indexes on `oid_nodes`; create `recorded_at DESC` index on `audit_log`; add `REVOKE UPDATE, DELETE ON audit_log` grant. Add as migration `api/src/db/migrations/versions/003_indexes_and_grants.py`
- [x] T010 Alembic environment file `api/src/db/env.py`; `alembic.ini` wired to `DATABASE_URL` env var; `api/src/db/__init__.py` with async engine + `AsyncSession` factory

### API Skeleton

- [x] T011 [P] Config module `api/src/config.py`: load `ROOT_OID`, `ADMIN_API_KEY`, `DATABASE_URL` from env; validate `ROOT_OID` is a valid dotted-integer OID at startup; raise `RuntimeError` if missing
- [x] T012 [P] `OidNode` SQLAlchemy async model in `api/src/models/oid_node.py` — all columns from `data-model.md` including `status`, `refs`, `federation_url`, `federation_label`, `delegation_contact`, `disabled_by_cascade`, `pre_cascade_status`
- [x] T013 [P] `AuditLog` SQLAlchemy async model in `api/src/models/audit_log.py` — append-only; action vocabulary: CREATE/UPDATE/DISABLE/DELETE/DELEGATE/RECLAIM/VISIBILITY
- [x] T014 [P] Pydantic v2 schemas in `api/src/schemas/oid_node.py`: `OidNodeCreate`, `OidNodeUpdate`, `OidNodeResponse`, `DelegateRequest`, `AuditLogEntry`, `FederationBlockedError` per `contracts/api.md`
- [x] T015 [P] Admin key middleware `api/src/middleware/auth.py`: inject `X-Admin-Key` validation; inject `Authorization: Bearer` token validation; attach `caller_type` (`admin` | `credentialed` | `anonymous`) to request state
- [x] T016 FastAPI app entry point `api/src/main.py`: lifespan (run Alembic migrations + validate ROOT_OID); include routers; register middleware; `GET /health` → `{"status":"ok","root_oid":"..."}` (no auth required)
- [x] T017 [P] Integration test infrastructure: `api/tests/conftest.py` with testcontainers `PostgresContainer`, create schema via Alembic, `AsyncSession` fixture, admin key fixture

### Docker Compose

- [x] T018 Write `docker-compose.yml`: `db` (postgres:16, `pgdata` volume), `api` (build `./api`, env from `.env`, depends-on db, healthcheck on `/health`), `web` (build `./web`, env from `.env`, depends-on api, port `3000:3000`)
- [x] T019 Write `api/Dockerfile` (Python 3.12 slim, non-root user, Alembic migration entrypoint, `uvicorn` command) and `web/Dockerfile` (Node 20 alpine, `next build`, `next start`)

**Checkpoint**: `docker compose up --build` → `GET /health` returns 200 → schema applied in DB → write-guard trigger rejects an INSERT above ROOT_OID.

---

## Phase 3: US1 — OID Node CRUD (Admin) 🎯 MVP

**Goal**: Administrator can create, read, update, and delete managed OID nodes. Write guard and visibility cascade are enforced. Every mutation is audited.

**Independent Test**: `docker compose up` → create a tree of 3 nodes → update visibility to private → verify child node cascades to private → attempt to delete a node with children → 409; delete leaf → 204. Audit log contains all 5 entries.

### Audit service

- [x] T020 [US1] Audit service `api/src/services/audit_service.py`: `log_action(session, oid_path, action, actor, old_value, new_value)` — distinguishes `DISABLE` from `UPDATE` when `status` changes to `disabled`; records `VISIBILITY` when only `visibility` changes; uses `INSERT` only (no UPDATE/DELETE)

### Node router — reads

- [x] T021 [US1] `GET /oid/{oid_path}` in `api/src/routers/oid.py`: resolve node by ltree exact match; apply visibility filter (unauthenticated → public only, credentialed/admin → all); 404 for missing or hidden; return `OidNodeResponse`
- [x] T022 [P] [US1] `GET /oid/{oid_path}/children` in `api/src/routers/oid.py`: immediate children via `oid_path ~ 'parent.*{1}'` ltree query; visibility-filtered; return array of `OidNodeResponse`
- [x] T023 [P] [US1] `GET /oid/{oid_path}/ancestors` in `api/src/routers/oid.py`: all nodes where `oid_path @> target_path`, ordered by `nlevel(oid_path)` asc; includes federated nodes above ROOT_OID; visibility-filtered; return array

### Node router — writes (admin)

- [x] T024 [US1] `POST /oid` in `api/src/routers/oid.py`: validate parent exists; require both `description` and `visibility` fields (neither has a default — Principle III); insert managed node; catch `FederationBlocked` → 409 with `federation_url`; catch `UniqueViolation` → 409 duplicate OID; call audit service with `CREATE`; return 201
- [x] T025 [US1] `PUT /oid/{oid_path}` in `api/src/routers/oid.py`: partial update of `description`, `visibility`, `status`, `refs`, `metadata`; validate status transitions; determine audit action (UPDATE vs DISABLE vs VISIBILITY); call audit service; return updated `OidNodeResponse`
- [x] T026 [US1] `DELETE /oid/{oid_path}` in `api/src/routers/oid.py`: check child count — return 409 with `child_count` if > 0; delete leaf; audit `DELETE`; return 204

### Integration tests

- [x] T027 [US1] Integration tests `api/tests/integration/test_oid_crud.py`: create node → read → update visibility (cascade) → update status to disabled → re-enable → delete blocked (has children) → delete leaf; verify audit log entries and action types

**Checkpoint**: All CRUD operations succeed; write guard blocks federated-ancestor writes; visibility cascades; delete blocked with children; audit log has correct action codes.

---

## Phase 4: US2 — Public & Credentialed Read Access

**Goal**: Unauthenticated callers see only public nodes. Bearer-token holders see public and private. Full-text search available to all (visibility-filtered).

**Independent Test**: Create public + private nodes → unauthenticated GET on private → 404 → GET with Bearer token → 200 → search "value set" → returns only public results without token.

### Bearer token issuance

- [x] T027b [US2] `ApiToken` SQLAlchemy async model in `api/src/models/api_token.py`: columns `id BIGSERIAL PK`, `token_hash TEXT UNIQUE NOT NULL`, `label TEXT NOT NULL`, `created_at TIMESTAMPTZ`, `revoked_at TIMESTAMPTZ NULL`; add Alembic migration `api/src/db/migrations/versions/004_api_tokens.py`
- [x] T028 [US2] `POST /auth/token` in `api/src/routers/auth.py`: admin-only; generate 32-byte hex token; hash and store via `ApiToken` model; return `{"id": ..., "token": "...", "label": "..."}`
- [x] T029 [US2] Bearer token validation in `api/src/middleware/auth.py`: on `Authorization: Bearer <token>`, hash and look up in `api_tokens`; reject revoked tokens; set `caller_type = "credentialed"`
- [x] T029b [US2] `DELETE /auth/token/{token_id}` in `api/src/routers/auth.py`: admin-only; set `revoked_at = now()` on the matching `api_tokens` row; return 204; return 404 if not found. Update `POST /auth/token` to return `id` alongside `token` and `label`.

### Search

- [x] T030 [US2] `GET /search` in `api/src/routers/search.py`: `to_tsquery` full-text search over `description` FTS index; filter by `status` and `visibility` query params; apply caller-type visibility filter; `limit`/`offset` pagination; return `{"q", "total", "results"}`

### Integration tests

- [x] T031 [US2] Integration tests `api/tests/integration/test_visibility.py`: verify public/private filtering at GET/children/ancestors/search for anonymous, credentialed, admin callers; verify cascade on visibility update is enforced

**Checkpoint**: Anonymous → public only. Bearer token → private visible. Search respects visibility. Token revocation works.

---

## Phase 5: US3 — Federation Node Management

**Goal**: Administrator can seed upward context arcs and delegate/reclaim sub-subtrees. Delegated nodes and descendants become read-only. Ancestor chain includes upward federation context.

**Independent Test**: Seed `2`, `2.16`, `2.16.840` as federated nodes → call ancestors on ROOT_OID child → upward context appears → delegate ROOT_OID.3 → write to ROOT_OID.3.1 → 409 with federation_url → reclaim ROOT_OID.3 → write succeeds. Audit log contains DELEGATE entries per node.

### Delegate / Reclaim endpoints

- [x] T032 [US3] `POST /oid/{oid_path}/delegate` in `api/src/routers/oid.py`: validate body (`DelegateRequest`); update `node_type → federated`, set `federation_url/label/contact`; trigger cascades `node_type` to all descendants (handled in PL/pgSQL trigger from T008); audit `DELEGATE` per node (trigger handles cascade audit entries); return updated `OidNodeResponse`
- [x] T033 [US3] `POST /oid/{oid_path}/reclaim` in `api/src/routers/oid.py`: set `node_type → managed`, clear federation fields on that node only (descendants unchanged); audit `RECLAIM`; return updated `OidNodeResponse`

### Audit endpoint

- [x] T034 [P] [US3] `GET /audit` in `api/src/routers/audit.py`: admin-only; filter by `oid_path` and `action` query params; `limit`/`offset`; return `AuditLogEntry` list with total count

### Seed script

- [x] T035 [P] [US3] Ancestor seed script `api/scripts/seed_ancestors.py`: read `api/config/ancestors.yml` (list of `{oid_path, federation_label, federation_url}`); insert as federated nodes if not already present; idempotent; run with `docker compose exec api python -m scripts.seed_ancestors`
- [x] T036 [P] [US3] `api/config/ancestors.yml` with well-known OID arcs: `2` (ISO), `2.16` (Country), `2.16.840` (USA), `2.16.840.1` (Organizations) with appropriate labels

### Integration tests

- [x] T037 [US3] Integration tests `api/tests/integration/test_federation.py`: delegate node → verify descendants return 409 on write → verify ancestor chain includes federation nodes → reclaim → verify writes succeed; verify audit log DELEGATE cascade entries

**Checkpoint**: Delegate/reclaim work; cascade to descendants enforced by trigger; ancestor chain complete including upward arcs; audit entries correct.

---

## Phase 6: US4 — Admin Frontend

**Goal**: Web UI for the administrator (Explorer and Registry layouts) and public tree browser. Faithfully implements the design in `specs/design/`.

**Independent Test**: `http://localhost:3000/oid/ROOT_OID` renders public tree without auth. Admin login → Explorer layout renders TreePanel + NodeDetail → create child via modal → node appears in tree → switch to Registry layout → table shows all columns → open audit log drawer → DISABLE node → amber badge in audit log.

### Design system + shared UI

- [ ] T038 [US4] OKLCH dark theme CSS variables in `web/app/globals.css`: `--accent-hue` (default 160), `--bg`, `--bg-panel`, `--bg-surface`, `--bg-hover`, `--bg-active`, `--border`, `--border-strong`, `--text`, `--text-dim`, `--text-muted`, `--accent`, `--accent-dim`, `--c-active`, `--c-deprecated`, `--c-disabled`, `--c-public`, `--c-private`, `--font-mono`, `--font-ui`, `--r`, `--r-lg`
- [ ] T039 [P] [US4] Icon components (inline SVG) in `web/components/ui/icons.tsx`: `IconChevron`, `IconPlus`, `IconEdit`, `IconTrash`, `IconClock`, `IconGlobe`, `IconLock`, `IconDelegate`, `IconBan`, `IconX`, `IconCheck`, `IconSearch` (port from `specs/design/oid-ui.jsx`)
- [ ] T040 [P] [US4] Primitive components in `web/components/ui/primitives.tsx`: `Btn` (variants: default/primary/ghost/danger/warn; sizes: xs/sm/md/lg), `Input`, `Textarea`, `OIDSelect`, `Toggle`, `FieldLabel`, `Divider`, `EmptyState` (port from `specs/design/oid-ui.jsx`)
- [ ] T041 [P] [US4] Status and visibility components in `web/components/ui/badges.tsx`: `StatusDot` (active=green glow, deprecated=amber, disabled=gray 45% opacity), `VisBadge` (public=globe+blue, private=lock+purple), `Toast` (bottom-center, 2.2 s auto-dismiss)

### Auth + app shell

- [ ] T042 [US4] NextAuth v5 credentials provider in `web/auth.ts`: validate `password` field against `ADMIN_API_KEY` env var; session includes `role: "admin"`; `NEXTAUTH_SECRET` required
- [ ] T043 [US4] Admin shell layout `web/app/admin/layout.tsx`: require session (redirect to `/admin/login` if unauthenticated); render header (OID logo, root OID badge, Audit Log button with count, Add Root Child button, layout toggle); `localStorage` persistence for selected node ID and layout preference

### Tree components (Explorer layout)

- [ ] T044 [US4] `TreeNode` component `web/components/tree/TreeNode.tsx`: indent 16 px/depth, chevron for expandable nodes, status dot, arc label in mono, description in dim text, private lock icon, delegation icon, active/hover background states (port from `specs/design/oid-tree.jsx`)
- [ ] T045 [US4] `TreePanel` component `web/components/tree/TreePanel.tsx`: 290 px sidebar, inline search (filter + auto-expand on search), expand/collapse per node, status legend, stats footer (total · active · private); wires to API `GET /oid/{path}/children` (port from `specs/design/oid-tree.jsx`)

### Registry components (Registry layout)

- [ ] T046 [US4] `RegistryRow` + `RegistryPanel` components in `web/components/tree/RegistryPanel.tsx`: full-width table with columns OID/Description/Status/Visibility/Delegation/Modified; sticky header; status + visibility filter dropdowns; search input; row depth indentation; port from `specs/design/oid-tree.jsx`

### Node detail + audit

- [ ] T047 [US4] `Breadcrumb` component `web/components/detail/Breadcrumb.tsx`: renders ancestor arc chain from `GET /oid/{path}/ancestors`; last arc in accent color
- [ ] T048 [US4] `NodeDetail` component `web/components/detail/NodeDetail.tsx`: OID heading (22 px mono), breadcrumb, description, status + visibility badges; action bar (Add Child, Edit, Delegate/Remove Delegation, Disable/Re-enable with confirmation, Delete blocked if has children); details grid (Status, Visibility, Created, Modified, Children count, Delegation org+contact, References, Child Nodes list); empty state when no node selected; port from `specs/design/oid-detail.jsx`
- [ ] T049 [P] [US4] `AuditLog` drawer `web/components/detail/AuditLog.tsx`: 320 px slide-in from right; action badges color-coded per audit action vocabulary; clickable node ID navigates to node; actor + timestamp; port from `specs/design/oid-detail.jsx`

### Modals

- [ ] T050 [US4] `NodeModal` `web/components/modals/NodeModal.tsx`: add mode (arc preview `parent.arc`, auto-suggested next arc from `nextArc()`, required arc integer validation, description, status select, visibility select, refs textarea one-URL-per-line); edit mode (OID fixed, pre-populated); calls `POST /oid` or `PUT /oid/{path}`; port from `specs/design/oid-modals.jsx`
- [ ] T051 [P] [US4] `DelegateModal` `web/components/modals/DelegateModal.tsx`: consequence description, org name input, contact email input; calls `POST /oid/{path}/delegate`; pre-populates on re-open; port from `specs/design/oid-modals.jsx`
- [ ] T052 [P] [US4] `ConfirmModal` `web/components/modals/ConfirmModal.tsx`: reusable; `warn` variant for disable (warns about children inheriting disabled parent), `danger` variant for delete; port from `specs/design/oid-modals.jsx`

### Public pages

- [ ] T053 [US4] API client `web/lib/api.ts`: typed fetch wrappers for all `GET /oid/*` and `GET /search` endpoints; visibility-aware (pass Bearer token from session if present)
- [ ] T054 [US4] Public OID page `web/app/oid/[...path]/page.tsx`: SSR; fetch node + children + ancestors; render breadcrumb, OID heading, description, status + visibility badges, children list (status dots + visibility badges), references; federated nodes show "managed by [federation_label]" badge linking to `federation_url`; private nodes without auth → 404
- [ ] T055 [P] [US4] JSON-LD `DefinedTerm` structured data in `web/app/oid/[...path]/page.tsx`: inject `<script type="application/ld+json">` with `@type: DefinedTerm`, `name`, `description`, `url` for public managed nodes only

### Admin page wiring

- [ ] T056 [US4] Admin OID manager page `web/app/admin/page.tsx`: fetches full tree from API; renders header with layout toggle; Explorer layout (TreePanel + NodeDetail) or Registry layout (RegistryPanel + optional NodeDetail side panel 360 px); wires all action handlers to modals and API calls; audit log toggle; `localStorage` for selected node

**Checkpoint**: Full UI flows work: public browse, admin login, Explorer + Registry layouts, all modals, audit drawer, Toast notifications, federated node badges.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, hardening, E2E tests, operational readiness.

- [ ] T057 [P] Annotate all FastAPI route handlers with OpenAPI `summary`, `description`, `responses` entries; review auto-generated spec at `GET /openapi.json` and fix any gaps (`api/src/routers/`)
- [ ] T058 [P] Write comprehensive `.env.example` with inline comments explaining each variable, valid formats, and security notes
- [ ] T059 Write `README.md` at repo root: architecture diagram (text), installation steps, first-run walkthrough referencing `specs/001-oid-subtree-manager/quickstart.md`, federation setup guide
- [ ] T060 [P] Rate limiting on public read endpoints (`GET /oid/*`, `GET /search`) using `slowapi` or FastAPI middleware; config via `PUBLIC_RATE_LIMIT` env var (default 60 req/min per IP); `api/src/middleware/rate_limit.py`
- [ ] T061 Playwright E2E test suite `web/tests/e2e/`: (a) public browse flow: navigate to public OID, verify children, verify private returns 404; (b) admin CRUD flow: login, create child node with auto-arc, edit, disable with confirm, re-enable; (c) visibility cascade: set parent private, verify child shows private badge; (d) delegate + reclaim: delegate node, verify write blocked, reclaim, verify write succeeds; (e) audit log: verify all actions appear with correct badge colors
- [ ] T062 `api/tests/integration/test_write_guard.py`: comprehensive trigger coverage — write above ROOT_OID, write to federated ancestor, visibility public-under-private, cascade on private, delegate cascade, disable cascade (parent disabled → children disabled with `disabled_by_cascade = true`), re-enable cascade (children restored to active, independently deprecated child stays deprecated)

**Checkpoint**: `README.md` installation walkthrough succeeds cold; E2E test suite green; rate limiting headers present on public endpoints; OpenAPI spec valid.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)        → no dependencies — start immediately
Phase 2 (Foundational) → depends on Phase 1 — BLOCKS all user stories
Phase 3 (US1 CRUD)     → depends on Phase 2
Phase 4 (US2 Read)     → depends on Phase 2; integrates Phase 3 routes
Phase 5 (US3 Fed.)     → depends on Phase 2; integrates Phase 3 routes
Phase 6 (US4 Frontend) → depends on Phase 2; consumes all API endpoints
Phase 7 (Polish)       → depends on all phases complete
```

### User Story Dependencies

- **US1 (Phase 3)**: Only needs Foundational complete. First deliverable — MVP.
- **US2 (Phase 4)**: Needs Foundational. Token table extends DB from Phase 2. Read endpoints build on Phase 3 routes (additive, not blocking).
- **US3 (Phase 5)**: Needs Foundational. Delegate/reclaim extends Phase 3 routes. Can parallelize with US2 after Phase 2.
- **US4 (Phase 6)**: Needs all API endpoints (US1 + US2 + US3). Can start frontend scaffold and design-system components during Phase 2.

### Within Each Phase

- Models/schemas before services before routers
- Write guard trigger (T008) must be deployed before any CRUD test can pass
- Auth middleware (T015) must be complete before any admin write endpoint can be tested

### Parallel Opportunities

- T002, T003, T004, T005: all in Phase 1 — run together
- T011, T012, T013, T014, T015, T017: all in Phase 2 — run together (different files)
- T021, T022, T023: Phase 3 read endpoints — run together
- T039, T040, T041: Phase 6 UI primitives — run together
- T049, T051, T052: Phase 6 modals/drawer — run together after T040
- T055, T057, T058, T060: Phase 7 — run together

---

## Parallel Example: Phase 2 Foundational

```
# Run simultaneously (independent files):
T011 — api/src/config.py
T012 — api/src/models/oid_node.py
T013 — api/src/models/audit_log.py
T014 — api/src/schemas/oid_node.py
T015 — api/src/middleware/auth.py
T017 — api/tests/conftest.py

# Then sequentially:
T016 — api/src/main.py  (wires T011–T015 together)
T018 — docker-compose.yml
T019 — api/Dockerfile + web/Dockerfile
```

## Parallel Example: Phase 6 Frontend

```
# Run simultaneously after T038 (CSS vars):
T039 — web/components/ui/icons.tsx
T040 — web/components/ui/primitives.tsx
T041 — web/components/ui/badges.tsx

# After T040:
T044 — TreeNode.tsx
T045 — TreePanel.tsx
T046 — RegistryPanel.tsx
T047 — Breadcrumb.tsx
T050 — NodeModal.tsx
T051 — DelegateModal.tsx
T052 — ConfirmModal.tsx

# After tree + detail + modals:
T048 — NodeDetail.tsx   (depends on badges, icons, modals)
T049 — AuditLog.tsx

# After all components:
T056 — web/app/admin/page.tsx
```

---

## Implementation Strategy

### MVP First (US1 Only — Phases 1–3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — DB + API skeleton + Docker)
3. Complete Phase 3: US1 OID Node CRUD
4. **STOP and VALIDATE**: `docker compose up` → CRUD endpoints work → audit log populated → write guard enforced
5. This is a fully functional OID manager without auth tiers or federation

### Incremental Delivery

1. Phases 1–2 → Foundation: DB schema, triggers, API skeleton, Docker ✅
2. Phase 3 → US1: Full admin CRUD with audit log → **MVP demo**
3. Phase 4 → US2: Public/credentialed read, search, token issuance → **API complete**
4. Phase 5 → US3: Federation delegate/reclaim, ancestor seeding → **Federation demo**
5. Phase 6 → US4: Full admin UI (Explorer + Registry) → **Product complete**
6. Phase 7 → Polish: E2E tests, docs, rate limiting → **Shippable**

### Parallel Team Strategy (2 developers post-Phase 2)

- **Developer A**: US1 (T020–T027) → US2 (T028–T031) → US3 (T032–T037)
- **Developer B**: US4 scaffold (T038–T043) → frontend components (T044–T052) → public pages + admin wiring (T053–T056)
- Developers sync when B needs API endpoints A is building — plan for ~3-day buffer

---

## Notes

- **[P] tasks** = different files, no dependency on incomplete tasks in same phase
- **[US#] labels** map to delivery phases for traceability
- Trigger logic (T008) is the most complex single task — allocate extra time; write tests (T062) against it before declaring done
- Frontend components in Phase 6 are ports from `specs/design/*.jsx` — refer to those files for exact behavior; adapt JSX patterns to Next.js / TypeScript idioms
- Each phase ends with a concrete `docker compose`-based checkpoint — run it before moving on
- `specs/001-oid-subtree-manager/quickstart.md` is the acceptance checklist for the entire system
