"use client"

import { Btn } from "@/components/ui/primitives"

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  variant: "warn" | "danger"
  title: string
  message: React.ReactNode
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmModal({ open, onClose, onConfirm, variant, title, message, confirmLabel, loading }: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-96 bg-[var(--bg-panel)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--text)] mb-2">{title}</h2>
        <div className="text-sm text-[var(--text-dim)] mb-6">{message}</div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant={variant} size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? "Processing…" : (confirmLabel ?? "Confirm")}
          </Btn>
        </div>
      </div>
    </div>
  )
}
