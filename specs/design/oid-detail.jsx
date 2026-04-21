// oid-detail.jsx — NodeDetail panel + AuditLog drawer

const { useState: useStateDetail } = React;

// ---- Breadcrumb ----
function Breadcrumb({ tree, nodeId }) {
  const path = getBreadcrumb(tree, nodeId);
  if (!path) return null;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
      {path.map((n, i) => (
        <React.Fragment key={n.id}>
          <span style={{
            fontFamily:'var(--font-mono)', fontSize:11,
            color: i === path.length - 1 ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: i === path.length - 1 ? 500 : 400,
          }}>
            {arcLabel(n.id)}
          </span>
          {i < path.length - 1 && (
            <span style={{ color:'var(--border-strong)', fontSize:11 }}>.</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---- NodeDetail ----
function NodeDetail({ tree, nodeId, onAddChild, onEdit, onToggleDisable, onDelete, onDelegate, onRemoveDelegate, compact }) {
  if (!nodeId) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--text-muted)' }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>← select a node</span>
        <span style={{ fontFamily:'var(--font-ui)', fontSize:11 }}>Click any OID in the tree to inspect it</span>
      </div>
    );
  }

  const node = findNode(tree, nodeId);
  if (!node) return null;

  const isRoot = node.id === OID_ROOT_ID;
  const pad = compact ? '12px 16px' : '18px 22px';
  const gap = compact ? 14 : 20;

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ padding: pad, borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:6 }}>
          <div>
            <Breadcrumb tree={tree} nodeId={nodeId} />
            <div style={{ fontFamily:'var(--font-mono)', fontSize:22, color:'var(--text)', fontWeight:500, marginTop:4, letterSpacing:'-0.02em' }}>
              {node.id}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <VisBadge vis={node.visibility} />
            <StatusDot status={node.status} />
          </div>
        </div>
        <div style={{ fontFamily:'var(--font-ui)', fontSize:14, color:'var(--text-dim)', lineHeight:1.6, marginTop:4 }}>
          {node.description}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
        <Btn onClick={() => onAddChild(node)} variant="primary" size="sm">
          <IconPlus /> Add Child
        </Btn>
        <Btn onClick={() => onEdit(node)} variant="default" size="sm">
          <IconEdit /> Edit
        </Btn>
        {node.delegation
          ? <Btn onClick={() => onRemoveDelegate(node)} variant="warn" size="sm"><IconDelegate /> Remove Delegation</Btn>
          : <Btn onClick={() => onDelegate(node)} variant="default" size="sm"><IconDelegate /> Delegate</Btn>
        }
        <div style={{ flex:1 }} />
        {node.status === 'disabled'
          ? <Btn onClick={() => onToggleDisable(node)} variant="warn" size="sm"><IconCheck /> Re-enable</Btn>
          : <Btn onClick={() => onToggleDisable(node)} variant="warn" size="sm" disabled={isRoot}><IconBan /> Disable</Btn>
        }
        <Btn onClick={() => onDelete(node)} variant="danger" size="sm" disabled={isRoot || (node.children||[]).length > 0} title={(node.children||[]).length > 0 ? "Cannot delete a node with children" : ""}>
          <IconTrash /> Delete
        </Btn>
      </div>

      {/* Details grid */}
      <div style={{ padding: compact ? '12px 16px' : '18px 22px', display:'grid', gridTemplateColumns:'1fr 1fr', gap, flex:1 }}>

        {/* Status */}
        <div>
          <FieldLabel>Status</FieldLabel>
          <StatusDot status={node.status} />
        </div>

        {/* Visibility */}
        <div>
          <FieldLabel>Visibility</FieldLabel>
          <VisBadge vis={node.visibility} />
        </div>

        {/* Created */}
        <div>
          <FieldLabel>Created</FieldLabel>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-dim)' }}>{fmtDate(node.created)}</span>
        </div>

        {/* Modified */}
        <div>
          <FieldLabel>Last Modified</FieldLabel>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-dim)' }}>{fmtDate(node.modified)}</span>
        </div>

        {/* Children */}
        <div>
          <FieldLabel>Direct Children</FieldLabel>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-dim)' }}>
            {(node.children||[]).length}
          </span>
        </div>

        {/* Delegation */}
        <div>
          <FieldLabel>Delegation</FieldLabel>
          {node.delegation ? (
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--c-deprecated)', lineHeight:1.6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}><IconDelegate /> {node.delegation.org}</div>
              <div style={{ color:'var(--text-muted)', fontSize:10 }}>{node.delegation.contact}</div>
            </div>
          ) : (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>none</span>
          )}
        </div>

        {/* References — full width */}
        <div style={{ gridColumn:'1 / -1' }}>
          <FieldLabel>References</FieldLabel>
          {(node.refs||[]).length === 0 ? (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>none</span>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {node.refs.map((r, i) => (
                <a key={i} href={r} target="_blank" rel="noreferrer" style={{
                  fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)',
                  textDecoration:'none', wordBreak:'break-all',
                }}>
                  {r}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Children list — full width */}
        {(node.children||[]).length > 0 && (
          <div style={{ gridColumn:'1 / -1' }}>
            <FieldLabel>Child Nodes ({node.children.length})</FieldLabel>
            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
              {node.children.map((c, i) => (
                <div key={c.id} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                  borderBottom: i < node.children.length-1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'oklch(0.155 0.01 240 / 0.5)',
                }}>
                  <StatusDot status={c.status} showLabel={false} />
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text)', flex:'0 0 auto' }}>{arcLabel(c.id)}</span>
                  <span style={{ fontSize:11, color:'var(--text-dim)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.description}</span>
                  <VisBadge vis={c.visibility} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- AuditLog ----
const ACTION_COLORS = {
  CREATE:   'var(--c-active)',
  UPDATE:   'var(--accent)',
  DISABLE:  'var(--c-deprecated)',
  DELETE:   'oklch(0.70 0.16 20)',
  DELEGATE: 'var(--c-private)',
};

function AuditLog({ log, tree, onClose, onNodeSelect }) {
  return (
    <div style={{
      width:320, flexShrink:0,
      background:'var(--bg-panel)',
      borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <IconClock />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-dim)' }}>Audit Log</span>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:2, display:'flex' }}>
          <IconX />
        </button>
      </div>

      {/* Log entries */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {log.length === 0 && <EmptyState message="no activity yet" />}
        {log.map((entry, i) => {
          const node = findNode(tree, entry.nodeId);
          return (
            <div key={entry.id} style={{
              padding:'10px 12px',
              borderBottom:'1px solid var(--border)',
              display:'flex', flexDirection:'column', gap:4,
            }}>
              {/* Top row: action badge + node id */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{
                  fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.06em',
                  background:`${ACTION_COLORS[entry.action]}22`,
                  color: ACTION_COLORS[entry.action] || 'var(--text-dim)',
                  border:`1px solid ${ACTION_COLORS[entry.action] || 'var(--border)'}44`,
                  padding:'1px 5px', borderRadius:3, flexShrink:0,
                }}>
                  {entry.action}
                </span>
                <button
                  onClick={() => onNodeSelect(entry.nodeId)}
                  style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)', background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}
                >
                  {entry.nodeId}
                </button>
              </div>

              {/* Detail */}
              <div style={{ fontFamily:'var(--font-ui)', fontSize:11, color:'var(--text-muted)', lineHeight:1.4 }}>
                {entry.detail}
              </div>

              {/* Footer: user + timestamp */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent-dim)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {entry.user}
                </span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', whiteSpace:'nowrap', marginLeft:6 }}>
                  {fmtTs(entry.ts)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { NodeDetail, AuditLog });
