"use client"

import { useState, useEffect } from "react"
import { clsx } from "clsx"
import { StatusDot, VisBadge, FederationBadge } from "@/components/ui/badges"
import { Btn, Divider, EmptyState } from "@/components/ui/primitives"
import { Breadcrumb } from "./Breadcrumb"
import { IconPlus, IconEdit, IconTrash, IconDelegate, IconBan, IconCheck } from "@/components/ui/icons"
import { getAncestors, getChildren, deleteNode, reclaimNode, updateNode, ApiError, type OidNode } from "@/lib/api"

interface NodeDetailProps {
  node: OidNode | null
  adminKey: string
  onNavigate: (path: string) => void
  onAddChild: () => void
  onEdit: () => void
  onDelegate: () => void
  onNodeUpdated: (node: OidNode) => void
  onNodeDeleted: (path: string) => void
  toast: (msg: string, variant?: "success" | "error" | "info") => void
}

export function NodeDetail({ node, adminKey, onNavigate, onAddChild, onEdit, onDelegate, onNodeUpdated, onNodeDeleted, toast }: NodeDetailProps) {
  const [ancestors, setAncestors] = useState<OidNode[]>([])
  const [children, setChildren] = useState<OidNode[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!node) { setAncestors([]); setChildren([]); return }
    getAncestors(node.oid_path, adminKey).then((r) => setAncestors(r.ancestors)).catch(() => {})
    getChildren(node.oid_path, adminKey).then((r) => setChildren(r.children)).catch(() => {})
  }, [node?.oid_path, adminKey])

  if (!node) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
        <EmptyState title="No node selected" description="Select a node from the tree or registry to view details" />
      </div>
    )
  }

  const isFederated = node.node_type === "federated"
  const isDisabled = node.status === "disabled"
  const hasChildren = children.length > 0

  async function handleDisable() {
    setLoading("disable")
    try {
      const updated = await updateNode(node.oid_path, { status: "disabled" }, adminKey)
      toast(`Disabled ${node.oid_path}`, "info")
      onNodeUpdated(updated)
      setConfirmDisable(false)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed to disable", "error")
    } finally {
      setLoading(null)
    }
  }

  async function handleEnable() {
    setLoading("enable")
    try {
      const updated = await updateNode(node.oid_path, { status: "active" }, adminKey)
      toast(`Re-enabled ${node.oid_path}`, "success")
      onNodeUpdated(updated)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed to re-enable", "error")
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    setLoading("delete")
    try {
      await deleteNode(node.oid_path, adminKey)
      toast(`Deleted ${node.oid_path}`, "success")
      onNodeDeleted(node.oid_path)
      setConfirmDelete(false)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed to delete", "error")
    } finally {
      setLoading(null)
    }
  }

  async function handleReclaim() {
    setLoading("reclaim")
    try {
      const updated = await reclaimNode(node.oid_path, adminKey)
      toast(`Reclaimed ${node.oid_path}`, "success")
      onNodeUpdated(updated)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed to reclaim", "error")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg)]">
      {/* Breadcrumb */}
      <div className="mb-3">
        <Breadcrumb ancestors={ancestors} currentPath={node.oid_path} onNavigate={onNavigate} />
      </div>

      {/* OID heading */}
      <div className="flex items-start gap-3 mb-2">
        <h1 className="font-mono text-[22px] font-semibold text-[var(--text)] leading-tight break-all">
          {node.oid_path}
        </h1>
        <div className="flex items-center gap-2 mt-1 flex-shrink-0">
          <StatusDot status={node.status} showLabel />
          <VisBadge visibility={node.visibility} />
          {isFederated && <FederationBadge label={node.federation_label} url={node.federation_url} />}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--text-dim)] mb-4 leading-relaxed">{node.description}</p>

      {/* Action bar */}
      {!isFederated && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Btn variant="primary" size="sm" onClick={onAddChild}>
            <IconPlus size={13} /> Add Child
          </Btn>
          <Btn variant="default" size="sm" onClick={onEdit}>
            <IconEdit size={13} /> Edit
          </Btn>
          <Btn variant="warn" size="sm" onClick={onDelegate}>
            <IconDelegate size={13} /> Delegate
          </Btn>
          {isDisabled ? (
            <Btn variant="default" size="sm" onClick={handleEnable} disabled={loading === "enable"}>
              <IconCheck size={13} /> Re-enable
            </Btn>
          ) : (
            <Btn
              variant="warn" size="sm"
              onClick={() => setConfirmDisable(true)}
              disabled={loading === "disable"}
            >
              <IconBan size={13} /> Disable
            </Btn>
          )}
          <Btn
            variant="danger" size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={loading === "delete" || hasChildren}
            title={hasChildren ? "Cannot delete node with children" : undefined}
          >
            <IconTrash size={13} /> Delete
          </Btn>
        </div>
      )}
      {isFederated && (
        <div className="flex gap-2 mb-6">
          <Btn variant="default" size="sm" onClick={handleReclaim} disabled={loading === "reclaim"}>
            {loading === "reclaim" ? "Reclaiming…" : "Remove Delegation"}
          </Btn>
        </div>
      )}

      {/* Inline confirm dialogs */}
      {confirmDisable && (
        <div className="mb-4 p-4 bg-amber-900/20 border border-amber-700/40 rounded-[var(--r)]">
          <p className="text-sm text-amber-300 mb-2">
            Disable <span className="font-mono">{node.oid_path}</span>?
            {hasChildren && " All child nodes will also be disabled."}
          </p>
          <div className="flex gap-2">
            <Btn variant="warn" size="xs" onClick={handleDisable} disabled={!!loading}>Disable</Btn>
            <Btn variant="ghost" size="xs" onClick={() => setConfirmDisable(false)}>Cancel</Btn>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-700/40 rounded-[var(--r)]">
          <p className="text-sm text-red-300 mb-2">
            Permanently delete <span className="font-mono">{node.oid_path}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Btn variant="danger" size="xs" onClick={handleDelete} disabled={!!loading}>Delete</Btn>
            <Btn variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <Divider className="mb-4" />

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-6">
        <DetailRow label="Status"><StatusDot status={node.status} showLabel /></DetailRow>
        <DetailRow label="Visibility"><VisBadge visibility={node.visibility} /></DetailRow>
        <DetailRow label="Created">{new Date(node.created_at).toLocaleDateString()}</DetailRow>
        <DetailRow label="Modified">{new Date(node.updated_at).toLocaleDateString()}</DetailRow>
        <DetailRow label="Children">{children.length}</DetailRow>
        {node.federation_label && <DetailRow label="Delegated to">{node.federation_label}</DetailRow>}
        {node.delegation_contact && <DetailRow label="Contact">{node.delegation_contact}</DetailRow>}
        {node.federation_url && (
          <DetailRow label="Federation URL">
            <a href={node.federation_url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline break-all text-xs">
              {node.federation_url}
            </a>
          </DetailRow>
        )}
      </div>

      {/* References */}
      {node.refs && node.refs.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">References</p>
          <ul className="flex flex-col gap-1">
            {node.refs.map((ref) => (
              <li key={ref}>
                <a href={ref} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline break-all">
                  {ref}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Child nodes */}
      {children.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Child Nodes</p>
          <div className="flex flex-col gap-1">
            {children.map((child) => (
              <button
                key={child.oid_path}
                onClick={() => onNavigate(child.oid_path)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-left transition-colors"
              >
                <StatusDot status={child.status} />
                <span className="font-mono text-xs text-[var(--accent)]">{child.oid_path.split(".").pop()}</span>
                <span className="text-xs text-[var(--text-dim)] truncate flex-1">{child.description}</span>
                <VisBadge visibility={child.visibility} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)] mb-0.5">{label}</dt>
      <dd className="text-sm text-[var(--text-dim)]">{children}</dd>
    </div>
  )
}
