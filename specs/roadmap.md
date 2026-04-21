# OID Universe: Product Roadmap

---

## Strategic Overview

```
Phase 1: Discovery Layer     Phase 2: Ownership Layer     Phase 3: Management Layer
─────────────────────────    ─────────────────────────    ──────────────────────────
The World Reads              The World Claims             The World Builds On Top
(Months 1–9)                 (Months 10–18)               (Months 19–30)
```

---

## Phase 1: The Discovery Layer *(Months 1–9)*

**Objective:** Make the global OID namespace fully searchable, readable, and humanly comprehensible for the first time.

### 1.1 Core Infrastructure

- **Database:** PostgreSQL 16 with the `ltree` extension for native path enumeration. Initial schema stores each OID node as a row with `ltree` path, human-readable label, description, source citation, and trust score. Full-text search via `pg_trgm` + `tsvector` for fuzzy OID description lookup.
- **Backend API:** A read-only GraphQL API (Node.js/TypeScript, Apollo Server) exposing tree traversal queries: `node(oid: "1.3.6.1.4.1")`, `children(oid, depth)`, `ancestors(oid)`, `search(query)`.
- **Frontend:** Next.js 14 with App Router. Server-side rendering is non-negotiable for SEO — every OID node gets a canonical, indexable URL at `oiduniverse.org/oid/1.3.6.1.4.1`.

### 1.2 The Recursive Path Resolver

The path resolver is the flagship UX feature of Phase 1. For any OID entered:

```
Input:  1.3.6.1.4.1.311.21.20

Resolves to:
  1         → ISO
  1.3       → ISO Identified Organization
  1.3.6     → DoD (US Department of Defense)
  1.3.6.1   → Internet
  1.3.6.1.4 → Private
  1.3.6.1.4.1 → IANA Private Enterprise Numbers
  1.3.6.1.4.1.311 → Microsoft Corporation
  1.3.6.1.4.1.311.21 → Microsoft Certificate Services
  1.3.6.1.4.1.311.21.20 → szOID_REQUEST_CLIENT_INFO
```

Each arc is a hyperlink. Breadcrumbs render the full ancestry. Sibling nodes (other children of the parent) are shown in a sidebar panel. The resolver handles partial OIDs gracefully — entering `1.3.6` takes you to the DoD node and displays its subtree.

### 1.3 Data Ingestion Pipeline

An automated ETL pipeline (Python, Apache Airflow for scheduling) ingests from the following canonical sources:

| Source | Format | Frequency |
|---|---|---|
| IANA Private Enterprise Numbers | Plain text (structured) | Weekly |
| ITU-T OID Repository (oid-info.com public export) | XML | Monthly |
| IETF RFCs (OID references in structured data) | RFC XML v3 | Per publication |
| OpenSSL `objects.txt` | Custom text format | Per OpenSSL release |
| Microsoft OID registry (public MSDoc pages) | HTML scrape with schema validation | Monthly |
| Contributed CSVs / JSON uploads | Standard template | On submission |

All ingested records are initially tagged `Source: Automated Import, Trust: Unverified` and enter the attestation queue.

### 1.4 Phase 1 Milestones

| Milestone | Target Month |
|---|---|
| Core database schema + ltree path resolution live | M2 |
| IANA PEN + ITU public data fully imported | M3 |
| Public Wiki frontend with search + tree navigator | M4 |
| Contributor accounts (email-verified) + edit workflow | M5 |
| Trust score system + Curator role activated | M6 |
| SEO pass: sitemaps, structured data (JSON-LD), canonical URLs | M7 |
| Public API (read-only GraphQL, rate-limited) | M8 |
| Phase 1 public launch + documentation | M9 |

---

## Phase 2: The Ownership Layer *(Months 10–18)*

**Objective:** Allow legitimate OID registrants to cryptographically assert ownership of their branches, enabling authoritative, tamper-evident metadata management.

### 2.1 Blockchain Selection

**Recommended chain: Arbitrum One (L2 on Ethereum)**

Rationale: EVM-compatible (maximizes tooling and developer familiarity), battle-tested L2 security model (fraud proofs against Ethereum L1), gas costs ~100x cheaper than Ethereum L1 for the frequent metadata-update pattern we require, deep DeFi liquidity for any future tokenomics, large existing developer ecosystem. See the Technical Stack document for full analysis.

### 2.2 Smart Contract Architecture

```
OIDRegistry.sol (Core)
  ├─ claimOID(bytes32 oidHash, address claimant, bytes proof)
  ├─ transferClaim(bytes32 oidHash, address newClaimant)
  ├─ updateMetadata(bytes32 oidHash, bytes32 ipfsContentHash)
  ├─ challengeClaim(bytes32 oidHash, uint256 bondAmount)
  └─ resolveChallenge(bytes32 challengeId, address winner)

TrustRegistry.sol
  ├─ attestRecord(bytes32 oidHash, uint8 tier, bytes signature)
  ├─ revokeAttestation(bytes32 attestationId)
  └─ getTrustScore(bytes32 oidHash) → uint256

GovernanceToken.sol (ERC-20: OIDU)
  └─ Standard ERC-20 + ERC-20Votes for on-chain governance

ArbiterElection.sol
  └─ Manages Arbiter staking, election, and slashing
```

Metadata content (descriptions, citations, structured records) is stored on **IPFS** via **Filecoin**-pinned nodes. Only the IPFS content hash is stored on-chain, keeping gas costs minimal per-update.

### 2.3 Claiming Rules

A party may claim an OID branch by satisfying **one** of the following:

| Claim Method | Mechanism | Verification |
|---|---|---|
| **Domain Proof** | Add a DNS TXT record: `_oid-claim.yourdomain.com = 0xYourWalletAddress` | Automated DNS resolver queries this record and confirms wallet match |
| **Parent Delegation** | Parent arc Claimant explicitly delegates child arc on-chain | Smart contract call from parent Claimant's wallet |
| **Standards Body Credential** | Submit a signed assertion from a recognized RA (ITU, IANA, ISO member body) | Arbiter manual verification; credential hash stored on-chain |
| **Stake + Time** | Stake OIDU tokens on an unclaimed OID, wait a 90-day challenge window with no contest | Economic security for otherwise-orphaned OIDs |

Claiming does **not** grant retroactive authority over existing Wiki content. It grants *editorial authority going forward* and the ability to cryptographically sign records within that subtree.

### 2.4 Phase 2 Milestones

| Milestone | Target Month |
|---|---|
| Smart contracts deployed to Arbitrum testnet (Sepolia) | M10 |
| Domain-proof claiming flow live on testnet | M11 |
| OIDU token contract + initial distribution design | M12 |
| Mainnet contract deployment + security audit (external firm) | M13 |
| Web3 wallet integration in Wiki frontend (MetaMask, WalletConnect) | M14 |
| On-chain dispute resolution contract live | M15 |
| Arbiter election system + first Arbiter cohort seated | M16 |
| Claims dashboard: manage subtree metadata, view challengers | M17 |
| Phase 2 public launch | M18 |

---

## Phase 3: The Management Layer *(Months 19–30)*

**Objective:** Make OID Universe the programmatic backbone for enterprise OID management — both for public and private namespaces.

### 3.1 High-Speed REST + GraphQL API (v2)

- **REST API:** OpenAPI 3.1 spec. Endpoints for CRUD on records (with on-chain auth for write operations), bulk export (JSONL, CSV), and webhook subscriptions for subtree change events.
- **GraphQL API v2:** Adds mutations (for Claimants and Contributors), subscriptions (real-time subtree update feeds), and a `pathResolve` query with configurable depth and trust-score filters.
- **Rate Limiting:** Tiered API keys. Free tier: 1,000 req/day. Verified Contributor: 10,000 req/day. Enterprise (paid or self-hosted): unlimited.
- **SLA targets:** p50 < 20ms, p99 < 200ms for read queries from cache. Write operations (on-chain) are async with webhook callback.

### 3.2 Dockerized Local Node

The **OID Universe Local Node** is a self-contained Docker Compose stack that enterprises deploy on-premises:

```yaml
services:
  oid-db:        # PostgreSQL 16 + ltree, local mirror of public tree
  oid-api:       # Full REST + GraphQL API, private subtree management
  oid-sync:      # Background process: pulls public tree updates, pushes
                 # public-declared changes upstream
  oid-chain:     # Light client for Arbitrum (reads on-chain claims,
                 # submits signed metadata updates)
  oid-ui:        # Optional: local instance of the Wiki frontend
```

**Private Subtree Management:** Enterprises may define OID subtrees as *private* within their local node. Private subtrees are managed locally and never synced to the public Wiki. The enterprise's on-chain claim still covers the arc, providing external proof of authority, but the subtree content remains air-gapped from the public graph.

**Sync Protocol:** The sync service uses a Merkle-tree-based diff protocol. Each subtree has a rolling hash. The sync service computes the diff between local state and the public canonical state, applies non-conflicting public updates, and queues conflicting updates for local admin review.

### 3.3 Phase 3 Milestones

| Milestone | Target Month |
|---|---|
| REST API v2 + OpenAPI spec published | M20 |
| GraphQL mutations + subscriptions | M21 |
| Local Node Docker image (alpha, internal testing) | M22 |
| Private subtree management in Local Node | M23 |
| Merkle sync protocol + conflict resolution UX | M25 |
| Enterprise API key management + billing | M26 |
| Local Node public beta | M27 |
| SDK releases: Python, Go, TypeScript | M28 |
| Phase 3 GA launch + enterprise onboarding program | M30 |

---

---

---

## Backlog — Federation Coordination (two-sided handshake)

**Context**: The current `/delegate` and `/reclaim` implementation is intentionally local-only. Delegating a node marks it as federated and blocks writes on this instance, but does nothing to the target registry. The two sides must be coordinated manually by operators today.

### Two bootstrap scenarios

**Scenario A — Standalone instance**
An operator creates an instance with a deep root OID (e.g. `2.16.840.1.113762`) without any knowledge of a parent registry. All nodes are managed, nothing points anywhere. This is a fully self-contained registry.

Later, the operator may discover a parent instance that owns `2.16.840.1`. Two paths forward:
- The **local admin** can initiate an outbound delegation request: "I want to register my root under your tree." The parent instance reviews and approves, then marks `2.16.840.1.113762` as federated pointing to this instance.
- The **parent instance admin** can discover this instance and initiate the delegation on their end. This instance receives an inbound delegation request and approves or rejects it.

Either way, nothing changes automatically. Both sides must explicitly agree.

**Scenario B — Delegated instance**
An instance is created knowing it was delegated from a parent. Its `ROOT_OID` (`2.16.840.1.113762`) already exists as a federated node on the parent instance pointing here. This instance's upward ancestor context (e.g. `2`, `2.16`, `2.16.840`, `2.16.840.1`) should be seeded as federated nodes pointing back to the parent — this is what the ancestor seed script (`seed_ancestors.py`) is for. Ancestor chain traversal across instances works by following `federation_url` links upward.

---

### Backlog items

### BL-001 — Async delegation request flow (no immediate side effects)
Delegation must never be a single atomic operation. It is a **request** that the receiving instance's admin must approve or reject. Proposed states:

```
PENDING_OUTBOUND  — this instance sent a delegation request to a remote
PENDING_INBOUND   — this instance received a delegation request from a remote
ACTIVE            — both sides agreed; node is federated
REJECTED          — remote declined; node stays managed
REVOKED           — previously active, now reclaimed by one side
```

Neither instance changes its node state until both sides confirm. The local admin approves/rejects via an admin action; the remote instance does the same.

### BL-002 — Subtree snapshot on delegation
When a node is delegated to another instance, that instance needs to know about any existing children. Two options:

- **Push**: delegator sends a snapshot of the subtree to the delegatee as part of the handshake. Delegatee can accept or reject individual nodes.
- **Pull**: delegatee fetches the subtree from `federation_url` on demand.

**Risk if delegatee rejects children**: the delegator's existing nodes become orphaned — they exist locally but writes are blocked, and the delegatee doesn't have them. This can break downstream consumers. The safest behaviour: children offered to a delegatee that are not explicitly accepted remain on the delegator as **deprecated** (not deleted, not writable), with a pointer to the federated node. Operators on both sides must resolve the conflict explicitly.

### BL-003 — Read-through on federated nodes
Currently `GET /oid/{path}` on a federated node returns the local (possibly stale) copy. Options:
- Return local copy with a `X-Federation-URL` response header pointing to the live source.
- Add `?live=true` to proxy the read to `federation_url` on demand.
- Always redirect (308) to `federation_url` for federated nodes.

Recommended: return local copy by default (fast, works offline), add `X-Federation-URL` header, and support `?live=true` for authoritative reads.

### BL-004 — Reclaim notification and lockout
When an operator calls `/reclaim`, the previously-delegated instance must be notified. Until it acknowledges, the delegated instance should enter a **lockout-pending** state — writes still blocked on the delegator, but the delegatee is warned that authority is being revoked. The delegatee has a grace window to reject the reclaim or export its data.

### BL-005 — Federation graph and cycle detection
Multiple instances delegating to each other form a directed graph. Requirements:
- An instance must not be able to create a cycle (A delegates to B which delegates back to A).
- Federation relationships should be visible in ancestor chains so callers can traverse the full path across instances.
- Each instance should expose a `GET /federation/peers` endpoint listing known delegator/delegatee relationships.

**Suggested delivery order**: BL-001 (request flow + states) is the foundation — nothing else is safe without it. BL-002 (snapshot) and BL-003 (read-through) can follow independently. BL-004 and BL-005 are Phase 3 concerns aligned with the Local Node sync protocol.

---

*Version 1.1 — April 2026.*
