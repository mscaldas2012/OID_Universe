"use client"

import { useState, useCallback, useEffect } from "react"
import { clsx } from "clsx"
import { TreeNode } from "./TreeNode"
import { Input } from "@/components/ui/primitives"
import { IconSearch } from "@/components/ui/icons"
import { EmptyState } from "@/components/ui/primitives"
import type { OidNode } from "@/lib/api"

interface TreePanelProps {
  rootOid: string
  selectedPath: string | null
  onSelect: (node: OidNode) => void
  adminKey: string
  onAddChild?: () => void
}

type TreeMap = Record<string, OidNode[]>

export function TreePanel({ rootOid, selectedPath, onSelect, adminKey, onAddChild }: TreePanelProps) {
  const [treeMap, setTreeMap] = useState<TreeMap>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [allNodes, setAllNodes] = useState<OidNode[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const fetchChildren = useCallback(async (parentPath: string) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    const res = await fetch(`${API_URL}/oid/${parentPath}/children`, {
      headers: { "X-Admin-Key": adminKey },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.children ?? []) as OidNode[]
  }, [adminKey])

  const loadChildren = useCallback(async (path: string) => {
    const children = await fetchChildren(path)
    setTreeMap((prev) => ({ ...prev, [path]: children }))
    setAllNodes((prev) => {
      const paths = new Set(prev.map((n) => n.oid_path))
      return [...prev, ...children.filter((c) => !paths.has(c.oid_path))]
    })
    return children
  }, [fetchChildren])

  useEffect(() => {
    setLoading(true)
    loadChildren(rootOid).finally(() => setLoading(false))
    setExpanded(new Set([rootOid]))
  }, [rootOid, loadChildren])

  const handleToggle = useCallback(async (oidPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(oidPath)) {
        next.delete(oidPath)
      } else {
        next.add(oidPath)
        loadChildren(oidPath)
      }
      return next
    })
  }, [loadChildren])

  const filterNodes = (nodes: OidNode[]): OidNode[] => {
    if (!search) return nodes
    const q = search.toLowerCase()
    return nodes.filter(
      (n) => n.oid_path.includes(q) || n.description.toLowerCase().includes(q)
    )
  }

  function renderTree(parentPath: string, depth: number): React.ReactNode {
    const children = treeMap[parentPath] ?? []
    const filtered = filterNodes(children)
    return filtered.map((node) => {
      const isExpanded = expanded.has(node.oid_path)
      const hasChildren = !treeMap[node.oid_path] || treeMap[node.oid_path].length > 0
      return (
        <div key={node.oid_path}>
          <TreeNode
            node={node}
            depth={depth}
            isExpanded={isExpanded}
            isSelected={selectedPath === node.oid_path}
            hasChildren={hasChildren}
            onSelect={onSelect}
            onToggle={handleToggle}
          />
          {isExpanded && renderTree(node.oid_path, depth + 1)}
        </div>
      )
    })
  }

  const active = allNodes.filter((n) => n.status === "active").length
  const priv = allNodes.filter((n) => n.visibility === "private").length

  return (
    <div className="w-[290px] flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-panel)] h-full">
      {/* Search */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="relative">
          <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Filter nodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1">
        {loading ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading…</div>
        ) : Object.keys(treeMap).length === 0 ? (
          <EmptyState title="No nodes" description="Add the first child node to get started" />
        ) : (
          renderTree(rootOid, 0)
        )}
      </div>

      {/* Legend + stats */}
      <div className="border-t border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span><span className="inline-block w-2 h-2 rounded-full bg-[var(--c-active)] mr-1" />active</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-[var(--c-deprecated)] mr-1" />deprecated</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-[var(--c-disabled)] mr-1 opacity-45" />disabled</span>
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          {allNodes.length} total · {active} active · {priv} private
        </div>
      </div>
    </div>
  )
}
