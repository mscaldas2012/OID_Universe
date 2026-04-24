// Server-side: use runtime API_URL (works inside Docker). Client-side: use NEXT_PUBLIC_API_URL (baked at build).
const API_URL =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:8000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")

export interface OidNode {
  id: string
  oid_path: string
  node_type: "managed" | "federated"
  status: "active" | "deprecated" | "disabled"
  description: string
  visibility: "public" | "private"
  refs: string[]
  metadata: Record<string, unknown> | null
  federation_url: string | null
  federation_label: string | null
  delegation_contact: string | null
  created_at: string
  updated_at: string
}

export interface AuditEntry {
  id: number
  oid_path: string
  action: string
  actor: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  recorded_at: string
}

export interface SearchResult {
  q: string
  total: number
  results: OidNode[]
}

export interface AuditResult {
  total: number
  entries: AuditEntry[]
}

export interface ChildrenResult {
  oid_path: string
  children: OidNode[]
}

export interface AncestorsResult {
  oid_path: string
  ancestors: OidNode[]
}

export interface FederationBlockedError {
  detail: string
  federation_url?: string
  federation_label?: string
}

function buildHeaders(opts?: { adminKey?: string; bearerToken?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (opts?.adminKey) headers["X-Admin-Key"] = opts.adminKey
  if (opts?.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`
  return headers
}

async function apiFetch<T>(path: string, init?: RequestInit, authOpts?: { adminKey?: string; bearerToken?: string }): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...buildHeaders(authOpts), ...(init?.headers as Record<string, string> | undefined) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    const err = new ApiError(res.status, body.detail ?? "Request failed", body)
    throw err
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {}
  ) {
    super(message)
  }
}

// ── Public read endpoints ─────────────────────────────────────────────────────

export async function getNode(oidPath: string, bearerToken?: string): Promise<OidNode> {
  return apiFetch<OidNode>(`/oid/${oidPath}`, undefined, { bearerToken })
}

export async function getChildren(oidPath: string, bearerToken?: string): Promise<ChildrenResult> {
  return apiFetch<ChildrenResult>(`/oid/${oidPath}/children`, undefined, { bearerToken })
}

export async function getAncestors(oidPath: string, bearerToken?: string): Promise<AncestorsResult> {
  return apiFetch<AncestorsResult>(`/oid/${oidPath}/ancestors`, undefined, { bearerToken })
}

export async function search(params: {
  q: string
  status?: string
  visibility?: string
  limit?: number
  offset?: number
}, bearerToken?: string): Promise<SearchResult> {
  const qs = new URLSearchParams({ q: params.q })
  if (params.status) qs.set("status", params.status)
  if (params.visibility) qs.set("visibility", params.visibility)
  if (params.limit !== undefined) qs.set("limit", String(params.limit))
  if (params.offset !== undefined) qs.set("offset", String(params.offset))
  return apiFetch<SearchResult>(`/search?${qs}`, undefined, { bearerToken })
}

// ── Admin write endpoints ─────────────────────────────────────────────────────

export async function createNode(data: {
  oid_path: string
  description: string
  visibility: "public" | "private"
  status?: "active" | "deprecated" | "disabled"
  refs?: string[]
  metadata?: Record<string, unknown>
}, adminKey: string): Promise<OidNode> {
  return apiFetch<OidNode>("/oid", { method: "POST", body: JSON.stringify(data) }, { adminKey })
}

export async function updateNode(oidPath: string, data: {
  description?: string
  visibility?: "public" | "private"
  status?: "active" | "deprecated" | "disabled"
  refs?: string[]
  metadata?: Record<string, unknown>
}, adminKey: string): Promise<OidNode> {
  return apiFetch<OidNode>(`/oid/${oidPath}`, { method: "PUT", body: JSON.stringify(data) }, { adminKey })
}

export async function deleteNode(oidPath: string, adminKey: string): Promise<void> {
  return apiFetch<void>(`/oid/${oidPath}`, { method: "DELETE" }, { adminKey })
}

export async function delegateNode(oidPath: string, data: {
  federation_url: string
  federation_label: string
  delegation_contact?: string
}, adminKey: string): Promise<OidNode> {
  return apiFetch<OidNode>(`/oid/${oidPath}/delegate`, { method: "POST", body: JSON.stringify(data) }, { adminKey })
}

export async function reclaimNode(oidPath: string, adminKey: string): Promise<OidNode> {
  return apiFetch<OidNode>(`/oid/${oidPath}/reclaim`, { method: "POST", body: JSON.stringify({}) }, { adminKey })
}

// ── Audit endpoint ────────────────────────────────────────────────────────────

export async function getAuditLog(params: {
  oid_path?: string
  action?: string
  limit?: number
  offset?: number
}, adminKey: string): Promise<AuditResult> {
  const qs = new URLSearchParams()
  if (params.oid_path) qs.set("oid_path", params.oid_path)
  if (params.action) qs.set("action", params.action)
  if (params.limit !== undefined) qs.set("limit", String(params.limit))
  if (params.offset !== undefined) qs.set("offset", String(params.offset))
  return apiFetch<AuditResult>(`/audit?${qs}`, undefined, { adminKey })
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<{ status: string; root_oid: string }> {
  return apiFetch("/health")
}
