"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { signOut } from "next-auth/react"
import { TreePanel } from "@/components/tree/TreePanel"
import { RegistryPanel } from "@/components/tree/RegistryPanel"
import { NodeDetail } from "@/components/detail/NodeDetail"
import { AuditLog } from "@/components/detail/AuditLog"
import { NodeModal } from "@/components/modals/NodeModal"
import { DelegateModal } from "@/components/modals/DelegateModal"
import { ToastContainer, type ToastMessage, type ToastVariant } from "@/components/ui/badges"
import { Btn } from "@/components/ui/primitives"
import { IconPlus, IconClock, IconSearch } from "@/components/ui/icons"
import { getNode, getChildren, getAuditLog, type OidNode } from "@/lib/api"

const ROOT_OID = process.env.NEXT_PUBLIC_ROOT_OID ?? "2.16.840.1.113762"
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? ""
const LS_SELECTED = "oid:selectedPath"
const LS_LAYOUT = "oid:layout"

type Layout = "explorer" | "registry"

function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const dismiss = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), [])
  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).slice(2)
    setToasts((p) => [...p, { id, message, variant }])
  }, [])
  return { toasts, toast, dismiss }
}

export default function AdminPage() {
  const [selectedPath, setSelectedPath] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_SELECTED)
    return null
  })
  const [layout, setLayout] = useState<Layout>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem(LS_LAYOUT) as Layout) ?? "explorer"
    return "explorer"
  })
  const [selectedNode, setSelectedNode] = useState<OidNode | null>(null)
  const [allNodes, setAllNodes] = useState<OidNode[]>([])
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditCount, setAuditCount] = useState(0)
  const [modalOpen, setModalOpen] = useState<"add" | "edit" | null>(null)
  const [delegateOpen, setDelegateOpen] = useState(false)
  const [siblings, setSiblings] = useState<OidNode[]>([])
  const { toasts, toast, dismiss } = useToast()
  const refreshTreeRef = useRef<(() => void) | null>(null)

  // Persist selections
  useEffect(() => {
    if (selectedPath) localStorage.setItem(LS_SELECTED, selectedPath)
  }, [selectedPath])
  useEffect(() => {
    localStorage.setItem(LS_LAYOUT, layout)
  }, [layout])

  // Load selected node when path changes
  useEffect(() => {
    if (!selectedPath) { setSelectedNode(null); return }
    getNode(selectedPath, ADMIN_KEY).then(setSelectedNode).catch(() => setSelectedNode(null))
  }, [selectedPath])

  // Load all nodes for registry layout
  useEffect(() => {
    if (layout !== "registry") return
    loadAllNodes(ROOT_OID).then(setAllNodes)
  }, [layout])

  // Load audit count
  useEffect(() => {
    getAuditLog({ limit: 1 }, ADMIN_KEY).then((r) => setAuditCount(r.total)).catch(() => {})
  }, [])

  async function loadAllNodes(rootPath: string): Promise<OidNode[]> {
    const result: OidNode[] = []
    async function recurse(path: string) {
      try {
        const { children } = await getChildren(path, ADMIN_KEY)
        result.push(...children)
        await Promise.all(children.map((c) => recurse(c.oid_path)))
      } catch {}
    }
    await recurse(rootPath)
    return result
  }

  const handleSelect = useCallback((node: OidNode) => {
    setSelectedPath(node.oid_path)
    setSelectedNode(node)
  }, [])

  const handleNavigate = useCallback((path: string) => {
    setSelectedPath(path)
    getNode(path, ADMIN_KEY).then(setSelectedNode).catch(() => {})
  }, [])

  const handleAddChild = useCallback(async () => {
    if (!selectedPath) return
    try {
      const { children } = await getChildren(selectedPath, ADMIN_KEY)
      setSiblings(children)
    } catch { setSiblings([]) }
    setModalOpen("add")
  }, [selectedPath])

  const handleEdit = useCallback(() => {
    setModalOpen("edit")
  }, [])

  const handleDelegate = useCallback(() => {
    setDelegateOpen(true)
  }, [])

  const handleNodeUpdated = useCallback((node: OidNode) => {
    setSelectedNode(node)
    if (layout === "registry") setAllNodes((prev) => prev.map((n) => n.oid_path === node.oid_path ? node : n))
  }, [layout])

  const handleNodeDeleted = useCallback((path: string) => {
    setSelectedPath(null)
    setSelectedNode(null)
    if (layout === "registry") setAllNodes((prev) => prev.filter((n) => n.oid_path !== path))
  }, [layout])

  const handleModalSuccess = useCallback((node: OidNode) => {
    if (layout === "registry") {
      setAllNodes((prev) => {
        const exists = prev.find((n) => n.oid_path === node.oid_path)
        return exists ? prev.map((n) => n.oid_path === node.oid_path ? node : n) : [...prev, node]
      })
    }
    handleSelect(node)
  }, [layout, handleSelect])

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-12 border-b border-[var(--border)] bg-[var(--bg-panel)] flex-shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <span className="text-sm font-semibold text-[var(--text)]">OID Universe</span>
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--border)]">
            {ROOT_OID}
          </span>
        </div>

        <div className="flex-1" />

        {/* Layout toggle */}
        <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-surface)] rounded-[var(--r)] border border-[var(--border)]">
          <Btn
            variant={layout === "explorer" ? "primary" : "ghost"}
            size="xs"
            onClick={() => setLayout("explorer")}
          >
            Explorer
          </Btn>
          <Btn
            variant={layout === "registry" ? "primary" : "ghost"}
            size="xs"
            onClick={() => setLayout("registry")}
          >
            Registry
          </Btn>
        </div>

        {/* Actions */}
        <Btn variant="default" size="sm" onClick={() => { setSelectedPath(ROOT_OID); setModalOpen("add") }}>
          <IconPlus size={13} /> Add Root Child
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => setAuditOpen(true)}>
          <IconClock size={13} />
          Audit Log
          {auditCount > 0 && (
            <span className="ml-1 px-1 py-0.5 text-xs rounded-full bg-[var(--bg-active)] text-[var(--text-dim)]">
              {auditCount}
            </span>
          )}
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/admin/login" })}>
          Sign out
        </Btn>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {layout === "explorer" ? (
          <>
            {/* Tree sidebar */}
            <TreePanel
              rootOid={ROOT_OID}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              adminKey={ADMIN_KEY}
              onAddChild={handleAddChild}
            />
            {/* Node detail */}
            <NodeDetail
              node={selectedNode}
              adminKey={ADMIN_KEY}
              onNavigate={handleNavigate}
              onAddChild={handleAddChild}
              onEdit={handleEdit}
              onDelegate={handleDelegate}
              onNodeUpdated={handleNodeUpdated}
              onNodeDeleted={handleNodeDeleted}
              toast={toast}
            />
          </>
        ) : (
          <>
            {/* Registry table */}
            <RegistryPanel
              nodes={allNodes}
              selectedPath={selectedPath}
              onSelect={handleSelect}
            />
            {/* Optional side panel */}
            {selectedNode && (
              <div className="w-[360px] flex-shrink-0 border-l border-[var(--border)] overflow-y-auto">
                <NodeDetail
                  node={selectedNode}
                  adminKey={ADMIN_KEY}
                  onNavigate={handleNavigate}
                  onAddChild={handleAddChild}
                  onEdit={handleEdit}
                  onDelegate={handleDelegate}
                  onNodeUpdated={handleNodeUpdated}
                  onNodeDeleted={handleNodeDeleted}
                  toast={toast}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Audit log drawer */}
      <AuditLog
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        adminKey={ADMIN_KEY}
        filterPath={selectedPath ?? undefined}
        onNavigate={handleNavigate}
      />

      {/* Modals */}
      <NodeModal
        open={modalOpen !== null}
        onClose={() => setModalOpen(null)}
        onSuccess={handleModalSuccess}
        mode={modalOpen ?? "add"}
        parentPath={modalOpen === "add" ? selectedPath ?? ROOT_OID : undefined}
        existingNode={modalOpen === "edit" ? selectedNode : null}
        siblings={siblings}
        adminKey={ADMIN_KEY}
        toast={toast}
      />
      <DelegateModal
        open={delegateOpen}
        onClose={() => setDelegateOpen(false)}
        onSuccess={handleNodeUpdated}
        node={selectedNode}
        adminKey={ADMIN_KEY}
        toast={toast}
      />

      {/* Toast container */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
