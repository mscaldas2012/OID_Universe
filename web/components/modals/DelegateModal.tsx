"use client"

import { useState, useEffect } from "react"
import { Btn, FieldLabel, Input } from "@/components/ui/primitives"
import { delegateNode, reclaimNode, ApiError } from "@/lib/api"
import type { OidNode } from "@/lib/api"

interface DelegateModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (node: OidNode) => void
  node: OidNode | null
  adminKey: string
  toast: (msg: string, variant?: "success" | "error" | "info") => void
}

export function DelegateModal({ open, onClose, onSuccess, node, adminKey, toast }: DelegateModalProps) {
  const [federationUrl, setFederationUrl] = useState("")
  const [federationLabel, setFederationLabel] = useState("")
  const [delegationContact, setDelegationContact] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && node?.node_type === "federated") {
      setFederationUrl(node.federation_url ?? "")
      setFederationLabel(node.federation_label ?? "")
      setDelegationContact(node.delegation_contact ?? "")
    } else if (open) {
      setFederationUrl("")
      setFederationLabel("")
      setDelegationContact("")
    }
  }, [open, node])

  if (!open || !node) return null

  async function handleDelegate() {
    if (!node) return
    setLoading(true)
    try {
      const updated = await delegateNode(node.oid_path, {
        federation_url: federationUrl,
        federation_label: federationLabel,
        delegation_contact: delegationContact || undefined,
      }, adminKey)
      toast(`Delegated ${node.oid_path} to ${federationLabel}`, "success")
      onSuccess(updated)
      onClose()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Delegation failed", "error")
    } finally {
      setLoading(false)
    }
  }

  const isValid = federationUrl.trim() && federationLabel.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[480px] bg-[var(--bg-panel)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--text)] mb-1">Delegate Subtree</h2>
        <p className="text-xs text-[var(--text-dim)] mb-4">
          Delegating <span className="font-mono text-[var(--accent)]">{node.oid_path}</span> and all its
          descendants to another OID instance. All writes will be blocked after delegation.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel required>Federation URL</FieldLabel>
            <Input
              placeholder="https://child-instance.example.org"
              value={federationUrl}
              onChange={(e) => setFederationUrl(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel required>Organization Name</FieldLabel>
            <Input
              placeholder="Child Organization"
              value={federationLabel}
              onChange={(e) => setFederationLabel(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Contact Email</FieldLabel>
            <Input
              type="email"
              placeholder="admin@child-instance.example.org"
              value={delegationContact}
              onChange={(e) => setDelegationContact(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="warn" size="sm" onClick={handleDelegate} disabled={loading || !isValid}>
            {loading ? "Delegating…" : "Delegate"}
          </Btn>
        </div>
      </div>
    </div>
  )
}
