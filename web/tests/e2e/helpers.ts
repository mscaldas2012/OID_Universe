/** Shared helpers for OID Universe E2E tests. */

// API_URL is docker-internal (http://api:8000) — not reachable from the host.
// Tests always hit the API directly via localhost using the mapped port.
const API_PORT = process.env.API_PORT || "8000"
export const API_BASE = `http://localhost:${API_PORT}`

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

export const adminHeaders: Record<string, string> = {
  "X-Admin-Key": process.env.ADMIN_API_KEY || "change-me-generate-with-openssl-rand-hex-32",
  "Content-Type": "application/json",
}

/**
 * Create an OID node via the API using native fetch.
 * Returns the parsed response JSON.
 */
export async function createNode(
  path: string,
  description: string,
  visibility: "public" | "private" = "public",
) {
  const res = await fetch(apiUrl("/oid"), {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ oid_path: path, description, visibility }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`createNode ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Delete an OID node via the API using native fetch.
 * Ignores 404 so cleanup is idempotent.
 * The API accepts the dot-separated OID path directly: DELETE /oid/2.16.840.1.113762.99
 */
export async function deleteNode(path: string) {
  const res = await fetch(apiUrl(`/oid/${path}`), {
    method: "DELETE",
    headers: adminHeaders,
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`deleteNode ${path} failed (${res.status}): ${text}`)
  }
}

/**
 * Set a node's visibility via direct API PUT.
 */
export async function setNodeVisibility(path: string, visibility: "public" | "private") {
  const res = await fetch(apiUrl(`/oid/${path}`), {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ visibility }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`setVisibility ${path} → ${visibility} failed (${res.status}): ${text}`)
  }
  return res.json()
}
