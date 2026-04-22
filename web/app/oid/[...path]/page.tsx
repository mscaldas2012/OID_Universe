import { notFound } from "next/navigation"
import { getNode, getChildren, getAncestors, type OidNode } from "@/lib/api"
import { StatusDot, VisBadge, FederationBadge } from "@/components/ui/badges"

interface Props {
  params: { path: string[] }
}

export default async function OidPage({ params }: Props) {
  const oidPath = params.path.join(".")

  let node: OidNode
  try {
    node = await getNode(oidPath)
  } catch {
    notFound()
  }

  const [childrenResult, ancestorsResult] = await Promise.allSettled([
    getChildren(oidPath),
    getAncestors(oidPath),
  ])

  const children = childrenResult.status === "fulfilled" ? childrenResult.value.children : []
  const ancestors = ancestorsResult.status === "fulfilled" ? ancestorsResult.value.ancestors : []

  const jsonLd =
    node.node_type === "managed" && node.visibility === "public"
      ? {
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: node.oid_path,
          description: node.description,
          url: `${process.env.NEXTAUTH_URL ?? ""}/oid/${node.oid_path}`,
        }
      : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        {ancestors.length > 0 && (
          <nav className="flex items-center flex-wrap gap-1 text-xs text-[var(--text-muted)] mb-4">
            {ancestors.map((anc, i) => (
              <span key={anc.oid_path} className="flex items-center gap-1">
                <a
                  href={`/oid/${anc.oid_path}`}
                  className="font-mono hover:text-[var(--accent)] transition-colors"
                >
                  {anc.oid_path.split(".").pop()}
                </a>
                <span>/</span>
              </span>
            ))}
            <span className="font-mono text-[var(--accent)]">{node.oid_path.split(".").pop()}</span>
          </nav>
        )}

        {/* Heading */}
        <h1 className="font-mono text-2xl font-semibold text-[var(--text)] mb-2 break-all">
          {node.oid_path}
        </h1>

        {/* Badges */}
        <div className="flex items-center gap-2 mb-4">
          <StatusDot status={node.status} showLabel />
          <VisBadge visibility={node.visibility} />
          {node.node_type === "federated" && (
            <FederationBadge label={node.federation_label} url={node.federation_url} />
          )}
        </div>

        {/* Description */}
        <p className="text-[var(--text-dim)] leading-relaxed mb-6">{node.description}</p>

        {/* Federation info */}
        {node.node_type === "federated" && node.federation_url && (
          <div className="mb-6 p-4 bg-purple-900/15 border border-purple-700/30 rounded-[var(--r-lg)]">
            <p className="text-sm text-purple-300">
              Managed by{" "}
              <a href={node.federation_url} target="_blank" rel="noopener noreferrer" className="underline">
                {node.federation_label ?? node.federation_url}
              </a>
            </p>
            {node.delegation_contact && (
              <p className="text-xs text-purple-400 mt-1">Contact: {node.delegation_contact}</p>
            )}
          </div>
        )}

        {/* References */}
        {node.refs && node.refs.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">References</h2>
            <ul className="flex flex-col gap-1">
              {node.refs.map((ref) => (
                <li key={ref}>
                  <a href={ref} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--accent)] hover:underline break-all">
                    {ref}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Children */}
        {children.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">
              Child Nodes ({children.length})
            </h2>
            <div className="flex flex-col gap-2">
              {children.map((child) => (
                <a
                  key={child.oid_path}
                  href={`/oid/${child.oid_path}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-[var(--r-lg)] bg-[var(--bg-panel)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <StatusDot status={child.status} />
                  <span className="font-mono text-sm text-[var(--accent)] flex-shrink-0">{child.oid_path}</span>
                  <span className="text-sm text-[var(--text-dim)] flex-1 truncate">{child.description}</span>
                  <VisBadge visibility={child.visibility} />
                  {child.node_type === "federated" && <span className="text-xs text-purple-400">federated</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export async function generateMetadata({ params }: Props) {
  const oidPath = params.path.join(".")
  try {
    const node = await getNode(oidPath)
    return {
      title: `${node.oid_path} — OID Universe`,
      description: node.description,
    }
  } catch {
    return { title: "OID Universe" }
  }
}
