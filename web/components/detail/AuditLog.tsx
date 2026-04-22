"use client"

import { useState, useEffect, useCallback } from "react"
import { clsx } from "clsx"
import { AuditActionBadge } from "@/components/ui/badges"
import { Btn, OIDSelect } from "@/components/ui/primitives"
import { IconX } from "@/components/ui/icons"
import { getAuditLog, type AuditEntry } from "@/lib/api"

interface AuditLogProps {
  open: boolean
  onClose: () => void
  adminKey: string
  filterPath?: string
  onNavigate?: (path: string) => void
}

const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DISABLE", "DELETE", "DELEGATE", "RECLAIM", "VISIBILITY"]

export function AuditLog({ open, onClose, adminKey, filterPath, onNavigate }: AuditLogProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [actionFilter, setActionFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const limit = 50

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAuditLog({ oid_path: filterPath, action: actionFilter || undefined, limit, offset }, adminKey)
      setEntries(result.entries)
      setTotal(result.total)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [adminKey, filterPath, actionFilter, offset])

  useEffect(() => {
    if (open) fetchEntries()
  }, [open, fetchEntries])

  function formatDate(ts: string) {
    return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div
      className={clsx(
        "fixed top-0 right-0 h-full w-80 z-40 bg-[var(--bg-panel)] border-l border-[var(--border)] shadow-2xl flex flex-col transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Audit Log</h2>
          {filterPath && <p className="text-xs text-[var(--text-muted)] font-mono">{filterPath}</p>}
        </div>
        <Btn variant="ghost" size="xs" onClick={onClose}><IconX size={14} /></Btn>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <OIDSelect value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setOffset(0) }} className="w-full h-7 text-xs">
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </OIDSelect>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading…</div>}
        {!loading && entries.length === 0 && (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">No audit entries</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
            <div className="flex items-center gap-2 mb-1">
              <AuditActionBadge action={entry.action} />
              <button
                onClick={() => onNavigate?.(entry.oid_path)}
                className="font-mono text-xs text-[var(--accent)] hover:underline truncate max-w-[120px]"
              >
                {entry.oid_path}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{entry.actor}</span>
              <span>{formatDate(entry.recorded_at)}</span>
            </div>
            {(entry.old_value || entry.new_value) && (
              <div className="mt-1.5 text-xs font-mono bg-[var(--bg-surface)] rounded p-1.5 text-[var(--text-dim)] overflow-hidden">
                {entry.old_value && <div className="text-red-400/70">- {JSON.stringify(entry.old_value)}</div>}
                {entry.new_value && <div className="text-emerald-400/70">+ {JSON.stringify(entry.new_value)}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          <Btn variant="ghost" size="xs" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Prev</Btn>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <Btn variant="ghost" size="xs" onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}>Next</Btn>
        </div>
      )}
    </div>
  )
}
