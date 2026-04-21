// oid-tree.jsx — Tree panel (explorer sidebar)

const { useState: useStateTree, useEffect: useEffectTree } = React;

function TreeNode({ node, depth, selectedId, onSelect, expanded, onToggle, searchTerm }) {
  const hasChildren = (node.children || []).length > 0;
  const isSelected = node.id === selectedId;
  const isExpanded = !!expanded[node.id];
  const arc = arcLabel(node.id);
  const isDisabled = node.status === 'disabled';

  const matchesSearch = searchTerm &&
    (node.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
     node.description.toLowerCase().includes(searchTerm.toLowerCase()));

  const indentW = 16;

  return (
    <div>
      <div
        onClick={() => { onSelect(node.id); if (hasChildren) onToggle(node.id); }}
        style={{
          display:'flex', alignItems:'center', gap:6,
          padding:'4px 10px 4px 0',
          paddingLeft: depth === 0 ? 10 : depth * indentW + 4,
          cursor:'pointer',
          background: isSelected ? 'var(--bg-active)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
          borderRight: matchesSearch ? '2px solid var(--accent-dim)' : 'none',
          opacity: isDisabled ? 0.45 : 1,
          userSelect:'none',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* expand toggle */}
        <span style={{ width:12, flexShrink:0, color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
          {hasChildren ? <IconChevron open={isExpanded} /> : null}
        </span>

        {/* status dot */}
        <StatusDot status={node.status} showLabel={false} />

        {/* arc label */}
        <span style={{
          fontFamily:'var(--font-mono)', fontSize:12,
          color: isSelected ? 'var(--accent)' : 'var(--text)',
          fontWeight: depth === 0 ? 500 : 400,
          textDecoration: node.status === 'deprecated' ? 'line-through' : 'none',
          flexShrink:0,
        }}>
          {arc}
        </span>

        {/* description */}
        <span style={{
          fontFamily:'var(--font-ui)', fontSize:11, color:'var(--text-dim)',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
          textDecoration: node.status === 'deprecated' ? 'line-through' : 'none',
        }}>
          {node.description}
        </span>

        {/* private indicator */}
        {node.visibility === 'private' && (
          <span style={{ color:'var(--c-private)', flexShrink:0 }}><IconLock /></span>
        )}
        {/* delegation indicator */}
        {node.delegation && (
          <span style={{ color:'var(--c-deprecated)', flexShrink:0 }}><IconDelegate /></span>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreePanel({ tree, selectedId, onSelect, density }) {
  const [expanded, setExpanded] = useStateTree(() => {
    // expand root and first level by default
    const e = { [tree.id]: true };
    (tree.children || []).forEach(c => { e[c.id] = true; });
    return e;
  });
  const [search, setSearch] = useStateTree('');

  function handleToggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // When searching, expand all nodes
  useEffectTree(() => {
    if (search) {
      const all = {};
      flattenAll(tree).forEach(({ node }) => { all[node.id] = true; });
      setExpanded(all);
    }
  }, [search]);

  return (
    <div style={{
      width: 290, flexShrink:0,
      background:'var(--bg-panel)',
      borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      overflow:'hidden',
    }}>
      {/* Panel header */}
      <div style={{ padding:'10px 10px 8px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:7 }}>
          OID Tree
        </div>
        {/* Search */}
        <div style={{ position:'relative' }}>
          <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}>
            <IconSearch />
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="filter nodes..."
            style={{
              width:'100%', background:'var(--bg)', border:'1px solid var(--border)',
              borderRadius:'var(--r)', color:'var(--text)', fontFamily:'var(--font-mono)',
              fontSize:11, padding:'4px 8px 4px 26px', outline:'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position:'absolute', right:7, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:0,
            }}><IconX /></button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        padding:'5px 10px', borderBottom:'1px solid var(--border)',
        display:'flex', gap:10, flexShrink:0,
      }}>
        {[['active','var(--c-active)'],['deprecated','var(--c-deprecated)'],['disabled','var(--c-disabled)']].map(([s,c]) => (
          <span key={s} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:c }} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>{s}</span>
          </span>
        ))}
      </div>

      {/* Tree scroll area */}
      <div style={{ flex:1, overflowY:'auto', padding:'4px 0' }}>
        <TreeNode
          node={tree}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={handleToggle}
          searchTerm={search}
        />
      </div>

      {/* Footer stats */}
      <div style={{ padding:'6px 10px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        {(() => {
          const all = flattenAll(tree);
          const active = all.filter(r => r.node.status === 'active').length;
          const priv = all.filter(r => r.node.visibility === 'private').length;
          return (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)' }}>
              {all.length} nodes · {active} active · {priv} private
            </span>
          );
        })()}
      </div>
    </div>
  );
}

// ==================== REGISTRY TABLE VIEW ====================

function RegistryRow({ node, depth, selectedId, onSelect, expanded, onToggle }) {
  const hasChildren = (node.children || []).length > 0;
  const isSelected = node.id === selectedId;
  const isExpanded = !!expanded[node.id];

  return (
    <>
      <tr
        onClick={() => { onSelect(node.id); if (hasChildren) onToggle(node.id); }}
        style={{
          background: isSelected ? 'var(--bg-active)' : 'transparent',
          cursor:'pointer',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={{ padding:'5px 8px 5px 0', paddingLeft: depth * 20 + 10, width:320 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:12, color:'var(--text-muted)', display:'flex', alignItems:'center', flexShrink:0 }}>
              {hasChildren ? <IconChevron open={isExpanded} /> : null}
            </span>
            <span style={{
              fontFamily:'var(--font-mono)', fontSize:11,
              color: isSelected ? 'var(--accent)' : 'var(--text)',
              textDecoration: node.status === 'deprecated' ? 'line-through' : 'none',
              opacity: node.status === 'disabled' ? 0.4 : 1,
            }}>
              {node.id}
            </span>
          </div>
        </td>
        <td style={{ padding:'5px 8px', color:'var(--text-dim)', fontSize:12, opacity: node.status === 'disabled' ? 0.4 : 1 }}>
          {node.description}
        </td>
        <td style={{ padding:'5px 12px', whiteSpace:'nowrap' }}>
          <StatusDot status={node.status} showLabel={true} />
        </td>
        <td style={{ padding:'5px 8px' }}>
          <VisBadge vis={node.visibility} />
        </td>
        <td style={{ padding:'5px 8px', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
          {node.delegation ? (
            <span style={{ display:'flex', alignItems:'center', gap:4, color:'var(--c-deprecated)' }}>
              <IconDelegate /> {node.delegation.org}
            </span>
          ) : '—'}
        </td>
        <td style={{ padding:'5px 8px', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
          {node.modified}
        </td>
      </tr>
      {isExpanded && hasChildren && node.children.map(child => (
        <RegistryRow key={child.id} node={child} depth={depth+1} selectedId={selectedId}
          onSelect={onSelect} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  );
}

function RegistryPanel({ tree, selectedId, onSelect }) {
  const [expanded, setExpanded] = useStateTree(() => {
    const e = { [tree.id]: true };
    (tree.children||[]).forEach(c => { e[c.id] = true; });
    return e;
  });
  const [statusFilter, setStatusFilter] = useStateTree('all');
  const [visFilter, setVisFilter] = useStateTree('all');
  const [search, setSearch] = useStateTree('');

  function handleToggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const thStyle = {
    padding:'6px 8px', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)',
    textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', fontWeight:400,
    borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', background:'var(--bg-panel)',
    position:'sticky', top:0,
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
        <div style={{ position:'relative', flex:'1 1 240px' }}>
          <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}><IconSearch /></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="search OIDs or descriptions..."
            style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:11, padding:'4px 8px 4px 26px', outline:'none' }}
            onFocus={e=>e.target.style.borderColor='var(--accent)'}
            onBlur={e=>e.target.style.borderColor='var(--border)'}
          />
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', color:'var(--text-dim)', fontFamily:'var(--font-mono)', fontSize:11, padding:'4px 8px', outline:'none', cursor:'pointer' }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="deprecated">Deprecated</option>
          <option value="disabled">Disabled</option>
        </select>
        <select value={visFilter} onChange={e=>setVisFilter(e.target.value)} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', color:'var(--text-dim)', fontFamily:'var(--font-mono)', fontSize:11, padding:'4px 8px', outline:'none', cursor:'pointer' }}>
          <option value="all">All Visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>
      {/* Table */}
      <div style={{ flex:1, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, paddingLeft:10 }}>OID</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Visibility</th>
              <th style={thStyle}>Delegation</th>
              <th style={thStyle}>Modified</th>
            </tr>
          </thead>
          <tbody>
            <RegistryRow node={tree} depth={0} selectedId={selectedId} onSelect={onSelect} expanded={expanded} onToggle={handleToggle} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { TreePanel, RegistryPanel });
