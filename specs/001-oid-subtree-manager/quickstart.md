# Quickstart: OID Universe

**Phase 1 output** | Branch: `001-oid-subtree-manager` | Date: 2026-04-20

---

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- `git`
- A root OID to manage (e.g., `2.16.840.1.113762` for NIH VSAC)

---

## 1. Clone and configure

```bash
git clone <repo-url> oid-universe
cd oid-universe
cp .env.example .env
```

Edit `.env`:

```dotenv
# Required
ROOT_OID=2.16.840.1.113762        # The OID arc this instance manages
ADMIN_API_KEY=change-me-to-a-long-random-hex-string
NEXTAUTH_SECRET=change-me-to-another-random-string

# Optional — defaults shown
POSTGRES_DB=oid_universe
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
API_PORT=8000
WEB_PORT=3000
```

---

## 2. Start the stack

```bash
docker compose up --build
```

This brings up three services:
- `db` — PostgreSQL 16 with `ltree` extension
- `api` — FastAPI on `http://localhost:8000`
- `web` — Next.js 14 on `http://localhost:3000`

On first startup, Alembic migrations run automatically and the schema is
created. The health check endpoint confirms readiness:

```bash
curl http://localhost:8000/health
# → {"status":"ok","root_oid":"2.16.840.1.113762"}
```

---

## 3. Seed upward federation context (optional)

If you want ancestor context arcs above your root OID to appear in breadcrumbs
and ancestor chains, run the seed script:

```bash
docker compose exec api python -m scripts.seed_ancestors
```

This pre-populates the arcs above `ROOT_OID` (e.g., `2`, `2.16`, `2.16.840`,
`2.16.840.1`) as federated nodes using the config in `api/config/ancestors.yml`.

Edit `api/config/ancestors.yml` to set labels and URLs for each ancestor arc
before running the seed.

---

## 4. Create your first managed node

```bash
curl -X POST http://localhost:8000/oid \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "oid_path": "2.16.840.1.113762.1",
    "label": "Clinical Terminology Resources",
    "visibility": "public",
    "status": "active"
  }'
```

---

## 5. Open the admin UI

Navigate to `http://localhost:3000/admin` and sign in with:
- **Email**: `admin@localhost` (or any string — only the key matters)
- **API Key**: the value of `ADMIN_API_KEY` from your `.env`

The admin UI opens in Explorer layout by default. Use the layout toggle in the
header to switch to Registry (table) view.

---

## 6. Browse the public tree

Public OID nodes are accessible without authentication:
- Web: `http://localhost:3000/oid/2.16.840.1.113762`
- API: `http://localhost:8000/oid/2.16.840.1.113762`

Private nodes return `404` for unauthenticated callers.

---

## 7. Delegate a sub-subtree

To hand off a sub-arc to a child instance:

```bash
curl -X POST http://localhost:8000/oid/2.16.840.1.113762.3/delegate \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "federation_url": "https://child-instance.example.org",
    "federation_label": "Child Org",
    "delegation_contact": "admin@child-instance.example.org"
  }'
```

After delegation, writes to `2.16.840.1.113762.3` or any of its descendants
return `409 Conflict` with the `federation_url`. The delegated node shows a
delegation badge in the admin UI.

To reclaim:

```bash
curl -X POST http://localhost:8000/oid/2.16.840.1.113762.3/reclaim \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

---

## 8. Stop the stack

```bash
docker compose down          # stop containers, keep data volume
docker compose down -v       # stop containers AND delete data volume (destructive)
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Health check fails | `docker compose logs api` — look for DB connection error or missing `ROOT_OID` |
| Admin login rejected | Verify `ADMIN_API_KEY` in `.env` matches what you type in the login form |
| `409` on write | The target node or an ancestor is federated — check `/oid/{path}/ancestors` |
| Private node returns 404 | Pass `Authorization: Bearer <token>` — issue a token via `POST /auth/token` |
| `ltree` extension missing | Postgres image must be `postgres:16`; confirm with `docker compose images` |
