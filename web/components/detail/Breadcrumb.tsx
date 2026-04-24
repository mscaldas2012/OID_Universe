"use client"

import { clsx } from "clsx"
import { IconChevron } from "@/components/ui/icons"
import type { OidNode } from "@/lib/api"

interface BreadcrumbProps {
  ancestors: OidNode[]
  currentPath: string
  onNavigate?: (path: string) => void
}

export function Breadcrumb({ ancestors, currentPath, onNavigate }: BreadcrumbProps) {
  const label = (path: string) => path.split(".").pop() ?? path

  return (
    <nav className="flex items-center flex-wrap gap-0.5 text-xs" aria-label="OID path">
      {ancestors.map((anc, i) => (
        <span key={anc.oid_path} className="flex items-center gap-0.5">
          <button
            onClick={() => onNavigate?.(anc.oid_path)}
            className={clsx(
              "font-mono px-1 py-0.5 rounded transition-colors",
              onNavigate ? "hover:bg-[var(--bg-hover)] text-[var(--text-dim)] cursor-pointer" : "text-[var(--text-muted)] cursor-default"
            )}
          >
            {label(anc.oid_path)}
          </button>
          <IconChevron size={10} direction="right" className="text-[var(--text-muted)]" />
        </span>
      ))}
      <span className="font-mono px-1 py-0.5 rounded bg-[var(--bg-active)] text-[var(--accent)]">
        {label(currentPath)}
      </span>
    </nav>
  )
}
