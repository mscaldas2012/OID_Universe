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

*Version 1.0 — April 2026.*
