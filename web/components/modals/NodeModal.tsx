"use client"

import { useState, useEffect } from "react"
import { Btn, FieldLabel, Input, Textarea, OIDSelect } from "@/components/ui/primitives"
import { createNode, updateNode, ApiError } from "@/lib/api"
import type { OidNode } from "@/lib/api"

function nextArc(siblings: OidNode[], parentPath: string): string {
  const arcs = siblings
    .map((n) => parseInt(n.oid_path.split(".").pop() ?? "0", 10))
    .filter((n) => !isNaN(n))
  const max = arcs.length > 0 ? Math.max(...arcs) : -1
  return String(max + 1)
}

interface NodeModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (node: OidNode) => void
  mode: "add" | "edit"
  parentPath?: string
  existingNode?: OidNode | null
  siblings?: OidNode[]
  adminKey: string
  toast: (msg: string, variant?: "success" | "error" | "info") => void
}

export function NodeModal({ open, onClose, onSuccess, mode, parentPath, existingNode, siblings = [], adminKey, toast }: NodeModalProps) {
  const [arc, setArc] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<"public" | "private">("public")
  const [status, setStatus] = useState<"active" | "deprecated" | "disabled">("active")
  const [refs, setRefs] = useState("")
  const [arcError, setArcError] = useState("")
  const [loading, setLoading] = useState(false)

  const suggestedArc = mode === "add" && parentPath ? nextArc(siblings, parentPath) : ""
  const fullPath = mode === "add" && parentPath ? `${parentPath}.${arc || suggestedArc}` : existingNode?.oid_path ?? ""

  useEffect(() => {
    if (!open) return
    if (mode === "add") {
      setArc(suggestedArc)
      setDescription("")
      setVisibility("public")
      setStatus("active")
      setRefs("")
      setArcError("")
    } else if (existingNode) {
      setDescription(existingNode.description)
      setVisibility(existingNode.visibility)
      setStatus(existingNode.status)
      setRefs((existingNode.refs ?? []).join("\n"))
    }
  }, [open, mode, existingNode?.oid_path])

  function validateArc(value: string) {
    if (!/^\d+$/.test(value)) {
      setArcError("Arc must be a non-negative integer")
    } else {
      setArcError("")
    }
    setArc(value)
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const refsArr = refs.split("\n").map((r) => r.trim()).filter(Boolean)
      let result: OidNode
      if (mode === "add" && parentPath) {
        result = await createNode({
          oid_path: `${parentPath}.${arc}`,
          description,
          visibility,
          status,
          refs: refsArr,
        }, adminKey)
        toast(`Created ${result.oid_path}`, "success")
      } else if (mode === "edit" && existingNode) {
        result = await updateNode(existingNode.oid_path, { description, visibility, status, refs: refsArr }, adminKey)
        toast(`Updated ${result.oid_path}`, "success")
      } else return
      onSuccess(result)
      onClose()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Operation failed"
      toast(msg, "error")
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const isValid = description.trim() && (mode === "edit" || (arc && !arcError))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[520px] bg-[var(--bg-panel)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--text)] mb-4">
          {mode === "add" ? "Add Child Node" : "Edit Node"}
        </h2>

        <div className="flex flex-col gap-4">
          {mode === "add" && parentPath && (
            <div>
              <FieldLabel required>Arc (integer)</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--text-dim)] flex-shrink-0">{parentPath}.</span>
                <Input
                  value={arc}
                  onChange={(e) => validateArc(e.target.value)}
                  placeholder={suggestedArc}
                  className="w-32"
                />
                <span className="text-xs text-[var(--text-muted)]">→ {fullPath}</span>
              </div>
              {arcError && <p className="text-xs text-red-400 mt-1">{arcError}</p>}
            </div>
          )}

          {mode === "edit" && (
            <div>
              <FieldLabel>OID Path</FieldLabel>
              <p className="font-mono text-sm text-[var(--accent)] bg-[var(--bg-surface)] px-3 py-1.5 rounded-[var(--r)]">
                {existingNode?.oid_path}
              </p>
            </div>
          )}

          <div>
            <FieldLabel required>Description</FieldLabel>
            <Textarea
              rows={3}
              placeholder="Describe this OID node…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Visibility</FieldLabel>
              <OIDSelect value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </OIDSelect>
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <OIDSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="active">Active</option>
                <option value="deprecated">Deprecated</option>
                <option value="disabled">Disabled</option>
              </OIDSelect>
            </div>
          </div>

          <div>
            <FieldLabel>References (one URL per line)</FieldLabel>
            <Textarea
              rows={3}
              placeholder="https://example.org/ref"
              value={refs}
              onChange={(e) => setRefs(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={handleSubmit} disabled={loading || !isValid}>
            {loading ? "Saving…" : mode === "add" ? "Create" : "Save"}
          </Btn>
        </div>
      </div>
    </div>
  )
}
