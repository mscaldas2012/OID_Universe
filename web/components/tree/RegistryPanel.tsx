"use client"

import { useState, useMemo } from "react"
import { clsx } from "clsx"
import { StatusDot, VisBadge, FederationBadge } from "@/components/ui/badges"
import { Input, OIDSelect } from "@/components/ui/primitives"
import { IconSearch, IconDelegate } from "@/components/ui/icons"
import type { OidNode } from "@/lib/api"

interface RegistryPanelProps {
  nodes: OidNode[]
  selectedPath: string | null
  onSelect: (node: OidNode) => void
}

function nodeDepth(node: OidNode) {
  return node.oid_path.split(".").length - 1
}

export function RegistryPanel({ nodes, selectedPath, onSelect }: RegistryPanelProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [visibilityFilter, setVisibilityFilter] = useState("")

  const filtered = useMemo(() => {
    let list = nodes
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((n) => n.oid_path.includes(q) || n.description.toLowerCase().includes(q))
    }
    if (statusFilter) list = list.filter((n) => n.status === statusFilter)
    if (visibilityFilter) list = list.filter((n) => n.visibility === visibilityFilter)
    return list
  }, [nodes, search, statusFilter, visibilityFilter])

  return (
    <div className="flex flex-col h-full flex-1 min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="relative flex-1 max-w-xs">
          <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Search registry…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7"
          />
        </div>
        <OIDSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36 h-7 text-xs">
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="deprecated">Deprecated</option>
          <option value="disabled">Disabled</option>
        </OIDSelect>
        <OIDSelect value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)} className="w-32 h-7 text-xs">
          <option value="">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </OIDSelect>
        <span className="text-xs text-[var(--text-muted)] ml-auto whitespace-nowrap">
          {filtered.length} / {nodes.length}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-panel)] z-10">
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-muted)] w-48">OID</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Description</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-muted)] w-28">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-muted)] w-24">Visibility</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-muted)] w-32">Delegation</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-muted)] w-32">Modified</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((node) => {
              const depth = nodeDepth(node)
              const label = node.oid_path.split(".").pop() ?? node.oid_path
              const isSelected = selectedPath === node.oid_path
              return (
                <tr
                  key={node.oid_path}
                  onClick={() => onSelect(node)}
                  className={clsx(
                    "border-b border-[var(--border)] cursor-pointer transition-colors",
                    isSelected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
                  )}
                >
                  <td className="px-4 py-2">
                    <span style={{ paddingLeft: `${depth * 12}px` }} className="inline-block">
                      <span className="font-mono text-xs text-[var(--accent)]">{label}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-1 font-mono">.{node.oid_path.split(".").slice(0, -1).join(".")}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--text-dim)] truncate max-w-xs">{node.description}</td>
                  <td className="px-4 py-2">
                    <StatusDot status={node.status} showLabel />
                  </td>
                  <td className="px-4 py-2">
                    <VisBadge visibility={node.visibility} />
                  </td>
                  <td className="px-4 py-2">
                    {node.node_type === "federated" ? (
                      <FederationBadge label={node.federation_label} url={node.federation_url} />
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                    {new Date(node.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-xs text-[var(--text-muted)]">No nodes match current filters</div>
        )}
      </div>
    </div>
  )
}
