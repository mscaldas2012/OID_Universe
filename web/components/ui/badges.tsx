"use client"

import { clsx } from "clsx"
import { useEffect, useState } from "react"
import { IconGlobe, IconLock } from "./icons"

// ── StatusDot ─────────────────────────────────────────────────────────────────

type NodeStatus = "active" | "deprecated" | "disabled"

const statusConfig: Record<NodeStatus, { color: string; glow?: string; label: string }> = {
  active: { color: "bg-[var(--c-active)]", glow: "shadow-[0_0_6px_var(--c-active)]", label: "Active" },
  deprecated: { color: "bg-[var(--c-deprecated)]", label: "Deprecated" },
  disabled: { color: "bg-[var(--c-disabled)] opacity-45", label: "Disabled" },
}

export function StatusDot({ status, showLabel }: { status: NodeStatus; showLabel?: boolean }) {
  const cfg = statusConfig[status] ?? statusConfig.active
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("inline-block w-2 h-2 rounded-full flex-shrink-0", cfg.color, cfg.glow)} />
      {showLabel && <span className="text-xs text-[var(--text-dim)]">{cfg.label}</span>}
    </span>
  )
}

// ── VisBadge ──────────────────────────────────────────────────────────────────

type NodeVisibility = "public" | "private"

export function VisBadge({ visibility }: { visibility: NodeVisibility }) {
  const isPublic = visibility === "public"
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
        isPublic
          ? "text-[var(--c-public)] bg-blue-900/20"
          : "text-[var(--c-private)] bg-purple-900/20"
      )}
    >
      {isPublic ? <IconGlobe size={10} /> : <IconLock size={10} />}
      {isPublic ? "Public" : "Private"}
    </span>
  )
}

// ── AuditActionBadge ──────────────────────────────────────────────────────────

type AuditAction = "CREATE" | "UPDATE" | "DISABLE" | "DELETE" | "DELEGATE" | "RECLAIM" | "VISIBILITY"

const actionConfig: Record<AuditAction, { bg: string; text: string }> = {
  CREATE:     { bg: "bg-emerald-900/40", text: "text-emerald-400" },
  UPDATE:     { bg: "bg-blue-900/40",    text: "text-blue-400"    },
  DISABLE:    { bg: "bg-amber-900/40",   text: "text-amber-400"   },
  DELETE:     { bg: "bg-red-900/40",     text: "text-red-400"     },
  DELEGATE:   { bg: "bg-purple-900/40",  text: "text-purple-400"  },
  RECLAIM:    { bg: "bg-teal-900/40",    text: "text-teal-400"    },
  VISIBILITY: { bg: "bg-indigo-900/40",  text: "text-indigo-400"  },
}

export function AuditActionBadge({ action }: { action: AuditAction | string }) {
  const cfg = actionConfig[action as AuditAction] ?? { bg: "bg-[var(--bg-surface)]", text: "text-[var(--text-dim)]" }
  return (
    <span className={clsx("inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium", cfg.bg, cfg.text)}>
      {action}
    </span>
  )
}

// ── FederationBadge ───────────────────────────────────────────────────────────

export function FederationBadge({ label, url }: { label?: string | null; url?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-900/30 text-purple-300 border border-purple-700/30">
      <span>Federated</span>
      {label && <span className="opacity-70">— {label}</span>}
    </span>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info"

export interface ToastMessage {
  id: string
  message: string
  variant: ToastVariant
}

const toastColors: Record<ToastVariant, string> = {
  success: "bg-emerald-900/80 border-emerald-700/50 text-emerald-200",
  error:   "bg-red-900/80 border-red-700/50 text-red-200",
  info:    "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)]",
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 2200)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      className={clsx(
        "pointer-events-auto px-4 py-2.5 rounded-[var(--r-lg)] border text-sm backdrop-blur-sm shadow-xl",
        toastColors[toast.variant]
      )}
    >
      {toast.message}
    </div>
  )
}
