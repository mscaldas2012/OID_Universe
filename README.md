# OID Universe

A self-hosted, federated OID (Object Identifier) subtree manager. Register, browse, and delegate OID arcs within your allocated subtree — with a full audit trail, visibility controls, and a clean admin UI.

## Architecture

```
                ┌─────────────────────────────────────┐
                │           Browser / API client       │
                └────────┬──────────────┬──────────────┘
                         │              │
               (no auth) │   (X-Admin-Key or Bearer token)
                         ▼              ▼
                ┌─────────────────────────────────────┐
                │         Next.js 14  (web :3000)      │
                │  NextAuth v5 · Tailwind · shadcn/ui  │
                └──────────────┬──────────────────────┘
                               │  HTTP (internal Docker net)
                               ▼
                ┌─────────────────────────────────────┐
                │          FastAPI  (api :8000)        │
                │  SQLAlchemy 2 · Alembic · asyncpg   │
                └──────────────┬──────────────────────┘
                               │
                               ▼
                ┌─────────────────────────────────────┐
                │        PostgreSQL 16  (db :5432)     │
                │  ltree + pgcrypto extensions         │
                │  write-guard PL/pgSQL trigger        │
                └─────────────────────────────────────┘

Auth flows
  Anonymous          →  public nodes only (rate-limited)
  Bearer <token>     →  public + private nodes (credentialed read)
  X-Admin-Key        →  full write access (CRUD, delegate, audit)
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20 (included with Docker Desktop)

No local Python or Node install needed for the quickstart.

## Quickstart (Docker)

```bash
# 1. Clone the repo
git clone <repo-url> oid-universe
cd oid-universe

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — at minimum set:
#   ROOT_OID      e.g. 2.16.840.1.113762
#   ADMIN_API_KEY  generate with: openssl rand -hex 32

# 3. Build and start all services
docker compose up --build

# 4. Verify the API is healthy
curl http://localhost:8000/health
# {"status":"ok","root_oid":"2.16.840.1.113762"}

# 5. Open the admin UI
open http://localhost:3000
# Log in with the ADMIN_API_KEY you set in .env
```

## First Steps

### Create a child OID node

```bash
curl -X POST http://localhost:8000/oid \
  -H "X-Admin-Key: <your-admin-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "oid_path": "2.16.840.1.113762.1",
    "description": "Code Systems",
    "visibility": "public"
  }'
```

### Check the audit log

```bash
curl http://localhost:8000/audit \
  -H "X-Admin-Key: <your-admin-key>"
```

### Issue a Bearer token for credentialed read access

```bash
curl -X POST http://localhost:8000/auth/token \
  -H "X-Admin-Key: <your-admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-integration"}'
# Returns {"id": 1, "token": "<raw-token>", "label": "my-integration"}

# Use the token:
curl http://localhost:8000/oid/2.16.840.1.113762.1 \
  -H "Authorization: Bearer <raw-token>"
```

## Federation Setup

Federation lets you mark a subtree as managed by an external organization. Descendants of a federated node become read-only within this instance.

### Seed upstream ancestor arcs

The `ancestors.yml` config pre-populates well-known OID arcs above your root (e.g. `2 → ISO`, `2.16 → Country`, `2.16.840 → USA`) as federated nodes so the ancestor chain is complete:

```bash
docker compose exec api python -m scripts.seed_ancestors
```

Edit `api/config/ancestors.yml` to add or adjust entries.

### Delegate a subtree

```bash
curl -X POST http://localhost:8000/oid/2.16.840.1.113762.3/delegate \
  -H "X-Admin-Key: <your-admin-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "federation_url": "https://partner.example.com/oid",
    "federation_label": "Partner Org",
    "delegation_contact": "admin@partner.example.com"
  }'
```

All descendants of `.3` are now federated — writes to them return `409`. The audit log records `DELEGATE` entries for each affected node.

### Reclaim a delegated subtree

```bash
curl -X POST http://localhost:8000/oid/2.16.840.1.113762.3/reclaim \
  -H "X-Admin-Key: <your-admin-key>"
```

Only the root of the delegation is reclaimed; descendants remain federated until explicitly reclaimed.

## Local Development (without Docker)

### API

```bash
cd api
pip install -e ".[dev]"

# Start a local PostgreSQL (or point DATABASE_URL at an existing one)
export DATABASE_URL=postgresql+asyncpg://oid_app:password@localhost/oid_universe
export ROOT_OID=2.16.840.1.113762
export ADMIN_API_KEY=dev-key

alembic upgrade head
uvicorn src.main:app --reload --port 8000
```

### Web

```bash
cd web
pnpm install

# Point the web app at your running API
export API_URL=http://localhost:8000
export NEXTAUTH_SECRET=$(openssl rand -hex 32)
export NEXTAUTH_URL=http://localhost:3000
export ADMIN_API_KEY=dev-key

pnpm dev
```

## Running Tests

### API integration tests

Tests use [testcontainers](https://testcontainers-python.readthedocs.io/) — no manual database setup needed.

```bash
cd api
pip install -e ".[dev]"
pytest
```

To run against an existing database (e.g. inside CI with a service container):

```bash
TEST_DATABASE_URL=postgresql+asyncpg://oid_app:password@localhost/oid_universe pytest
```

### Frontend E2E tests (Playwright)

Requires a running stack (Docker or local dev servers).

```bash
cd web
pnpm install
pnpm e2e

# With a non-default base URL:
BASE_URL=http://staging.example.com pnpm e2e
```

## Environment Variables

See [.env.example](.env.example) for a fully annotated reference with valid formats, security notes, and generation commands. Key variables:

| Variable | Required | Description |
|---|---|---|
| `ROOT_OID` | yes | Dotted-integer OID this instance manages |
| `ADMIN_API_KEY` | yes | Secret for `X-Admin-Key` header (≥ 32 chars) |
| `POSTGRES_*` | yes | Database connection credentials |
| `DATABASE_URL` | yes | asyncpg connection string (auto-constructed in Docker) |
| `NEXTAUTH_SECRET` | yes | Next.js session signing key (≥ 32 chars) |
| `NEXTAUTH_URL` | yes | Public URL of the web service |
| `API_URL` | yes | Backend URL as seen by the web container |
| `PUBLIC_RATE_LIMIT` | no | Max req/min per IP on public endpoints (default: 60) |

## API Reference

Interactive docs are available at `http://localhost:8000/docs` when the API is running.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Service status + root OID |
| GET | `/oid/{path}` | none/bearer | Fetch a node (visibility-filtered) |
| GET | `/oid/{path}/children` | none/bearer | Immediate children |
| GET | `/oid/{path}/ancestors` | none/bearer | Full upward ancestor chain |
| POST | `/oid` | admin | Create a managed node |
| PUT | `/oid/{path}` | admin | Update description/status/visibility/refs |
| DELETE | `/oid/{path}` | admin | Delete a leaf node |
| POST | `/oid/{path}/delegate` | admin | Mark subtree as federated |
| POST | `/oid/{path}/reclaim` | admin | Reclaim the delegation root |
| GET | `/search` | none/bearer | Full-text search (visibility-filtered) |
| GET | `/audit` | admin | Audit log with filtering |
| POST | `/auth/token` | admin | Issue a Bearer token |
| DELETE | `/auth/token/{id}` | admin | Revoke a Bearer token |

## License

MIT
