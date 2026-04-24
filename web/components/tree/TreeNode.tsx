"use client"

import { clsx } from "clsx"
import { IconChevron, IconDelegate, IconLock } from "@/components/ui/icons"
import { StatusDot } from "@/components/ui/badges"
import type { OidNode } from "@/lib/api"

interface TreeNodeProps {
  node: OidNode
  depth: number
  isExpanded: boolean
  isSelected: boolean
  hasChildren: boolean
  onSelect: (node: OidNode) => void
  onToggle: (oidPath: string) => void
}

export function TreeNode({ node, depth, isExpanded, isSelected, hasChildren, onSelect, onToggle }: TreeNodeProps) {
  const label = node.oid_path.split(".").pop() ?? node.oid_path
  const isDisabled = node.status === "disabled"
  const isFederated = node.node_type === "federated"

  return (
    <div
      className={clsx(
        "flex items-center gap-1 px-2 py-1 cursor-pointer rounded-[var(--r)] text-sm transition-colors select-none",
        isSelected ? "bg-[var(--bg-active)] text-[var(--text)]" : "hover:bg-[var(--bg-hover)] text-[var(--text-dim)]",
        isDisabled && "opacity-50"
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={() => onSelect(node)}
    >
      {/* Expand/collapse toggle */}
      <button
        className={clsx("flex-shrink-0 w-4 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors", !hasChildren && "invisible")}
        onClick={(e) => { e.stopPropagation(); onToggle(node.oid_path) }}
        aria-label={isExpanded ? "Collapse" : "Expand"}
      >
        <IconChevron size={12} direction={isExpanded ? "down" : "right"} />
      </button>

      {/* Status dot */}
      <StatusDot status={node.status} />

      {/* Arc label */}
      <span className="font-mono text-xs text-[var(--accent)] flex-shrink-0">{label}</span>

      {/* Description */}
      <span className="truncate text-xs ml-1 flex-1 min-w-0">
        {node.description}
      </span>

      {/* Badges */}
      <span className="flex items-center gap-1 flex-shrink-0 ml-1">
        {node.visibility === "private" && <IconLock size={11} className="text-[var(--c-private)]" />}
        {isFederated && <IconDelegate size={11} className="text-purple-400" />}
      </span>
    </div>
  )
}
