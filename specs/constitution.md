<!--
Version change: 1.0.1 → 1.1.0 (MINOR)
Change: Replaced directional "federation pointer" concept with a unified
"federation node" model covering both upward context (arcs above root) and
downward delegation (arcs within subtree handed off to child instances).
Data model updated: single oid_nodes table with node_type field replaces
the separate federation_pointers table.

Version change: 1.1.0 → 1.2.0 (MINOR)
Change: Removed separate `label` field from node data model. `description`
is now the single required human-readable text field (was optional). Rationale:
the UI prototype uses only `description`; a separate `label` field was redundant
and inconsistent with the frontend design.
-->

# OID Universe Constitution

## Core Principles

### I. Federated Subtree Ownership

Each deployed instance is configured with exactly one **root OID** at install
time (e.g., `2.16.840.1.113762` for NIH). The instance has full write
authority over managed nodes within its subtree and no authority outside it.

Federation is not only a top-level concern. Nodes exist at three positions
relative to an instance:

1. **Above the root** — arcs in the global tree that own this instance's root
   (e.g., `2`, `2.16`, `2.16.840`). Always federated; owned by external instances.
2. **At or below the root, managed** — locally owned; the administrator has full
   authority.
3. **At or below the root, delegated** — a sub-subtree that has been handed off
   to a child instance. Read-only in this instance; the child instance owns it.

All three cases use the same **federation node** representation (see Principle IV).

### II. Administrator-Centric Governance (NON-NEGOTIABLE)

A single **trusted administrator** has full write authority over the instance.
There are no contributor accounts, no submission queues, no approval workflows,
no voting mechanisms, and no multi-stakeholder review processes. Every mutation
is an administrative act performed directly by the administrator.

Future roles (e.g., read-only credentialed users) grant only read access —
they MUST NEVER gain write permissions through any path.

### III. Two-Tier Node Visibility

Every OID node MUST carry exactly one of two visibility designations:

- **Public** — readable by anyone, including unauthenticated callers.
- **Private** — readable only by callers presenting valid credentials for
  this instance.

There is no intermediate tier. Visibility is set per-node and MAY be changed
by the administrator at any time. Default visibility for new nodes MUST be
explicitly chosen by the administrator — the system MUST NOT apply a silent
default.

**Visibility inheritance (NON-NEGOTIABLE)**: If a node is private, ALL of its
descendants MUST also be private. The system MUST enforce this invariant at
write time — it MUST reject any attempt to set a child node public when any
ancestor is private, and MUST cascade a visibility change to private downward
to all descendants automatically.

Visibility on federation nodes is administrator-controlled on this instance
and governs whether the pointer itself is visible — it does not propagate to
the remote instance.

### IV. Unified Federation Nodes

All nodes not managed by this instance — whether above the root or delegated
within the subtree — are represented as **federation nodes**: a uniform type
that carries a pointer to the owning instance and is read-only in the local
instance.

Rules that MUST be enforced:

- A federation node MUST carry: the OID path, the URL or identifier of the
  owning instance, and a human-readable label for that instance.
- The system MUST reject any write operation (create, update, delete,
  visibility change) targeting a federation node or any descendant of a
  federation node within the subtree.
- When resolving an ancestor chain, the system MUST include all federation
  nodes in the path, returning their pointer metadata rather than "not found."
- Delegating a managed node to a child instance (converting it to a federation
  node) is an administrative act. Once delegated, the node and its entire
  subtree become read-only in this instance. This MUST be logged in the audit
  log as a `delegate` action.
- The system MUST NOT auto-resolve or make live network calls to remote
  instances in v1. Federation pointers are advisory metadata, not live proxies.

### V. Subtree Integrity

OID assignments within the managed subtree MUST be unique — no two nodes may
share the same OID string. The system MUST enforce this at write time and
MUST reject duplicate assignments with a clear error.

All mutations (create, update, delete, visibility change, delegate) MUST be
recorded in an immutable audit log with timestamp and actor identity. The
audit log MUST NOT be editable through any administrative interface.

### VI. Simplicity & Explicit Scope (YAGNI)

Features are built only when a concrete need exists. The following are
**explicitly out of scope for v1** and MUST NOT be partially implemented or
stubbed:

- Federated discovery (cross-instance search or resolution)
- Live federation endpoint validation or proxying
- Contributor or multi-user write workflows
- Hierarchical admin delegation

When a v1 limitation is hit, the response is a clear error or documented
boundary — not a speculative workaround.

## Data Model & Visibility

A single `oid_nodes` table represents the entire tree — managed nodes,
delegated sub-subtrees, and upward context arcs above the root. Node type
determines what operations are permitted.

Every node MUST capture:

- **OID** (string, unique): the full dotted-integer identifier
- **node_type** (enum: `managed` | `federated`): whether this instance owns
  the node or it belongs to another instance
- **Description** (string, required): human-readable name and purpose of the node
- **Visibility** (enum: `public` | `private`): access tier for this node's
  pointer/metadata as surfaced by this instance
- **Metadata** (key-value, optional): extensible, administrator-defined fields;
  only meaningful on `managed` nodes

Federation nodes additionally carry:

- **federation_url** (string): URL or identifier of the owning instance
- **federation_label** (string): human-readable name of the owning instance

Audit trail on every node: created_at, updated_at, actor for each mutation.

**Write guard**: The system MUST check two conditions before any write:
1. The target OID path is within the root subtree (not above root).
2. The target node (and no ancestor within the subtree) is of type `federated`.
If either condition fails, the write MUST be rejected with a descriptive error
that includes the `federation_url` of the blocking federation node.

## Security Model

- The administrator authenticates via a mechanism appropriate to the deployment
  (API key, session token, or local-only access). The specific auth mechanism
  is an implementation decision — the constitution requires only that it exists
  and is enforced.
- Unauthenticated callers MAY read public nodes only.
- Credentialed callers (non-admin) MAY read public and private nodes; they MUST
  NOT write or delete.
- The administrator MAY read all nodes and write `managed` nodes only.
- Credentials MUST NOT be embedded in OID metadata or audit log entries.

## Governance

This constitution supersedes all other project documentation on matters of
scope, data model, and access control. Amendments MUST be made by updating
this file and incrementing the version per the policy below.

**Version policy**:
- MAJOR: Removal or incompatible redefinition of a principle or section.
- MINOR: New principle or section added; material scope expansion or data model change.
- PATCH: Clarification, wording, or non-semantic refinement.

**Amendment procedure**: Update this file, increment version, record today's
date in Last Amended, and note the change in a commit message referencing the
new version (e.g., `docs: amend constitution to v1.1.0`).

**Compliance**: Every feature spec and implementation plan MUST include a
Constitution Check that verifies no principle is violated. Complexity
introduced in violation of Principle VI (Simplicity) MUST be explicitly
justified in the plan's Complexity Tracking section.

**Version**: 1.2.0 | **Ratified**: 2026-04-20 | **Last Amended**: 2026-04-20
