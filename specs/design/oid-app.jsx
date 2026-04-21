// oid-app.jsx — main App, Tweaks, mount

const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{"layout":"explorer","accent":"green","density":"comfortable"}/*EDITMODE-END*/;

const ACCENT_HUES = { green: 160, blue: 220, amber: 70 };

function applyAccent(accentKey) {
  const hue = ACCENT_HUES[accentKey] || 160;
  document.documentElement.style.setProperty('--accent-hue', hue);
}

// ---- Toast ----
function Toast({ message, onDone }) {
  useEffectApp(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
      background:'var(--bg-surface)', border:'1px solid var(--border-strong)',
      borderRadius:'var(--r)', padding:'7px 14px', fontFamily:'var(--font-mono)',
      fontSize:11, color:'var(--text)', zIndex:2000, boxShadow:'0 4px 16px oklch(0 0 0 / 0.4)',
      display:'flex', alignItems:'center', gap:7, whiteSpace:'nowrap',
      animation:'fadeUp 0.2s ease',
    }}>
      <span style={{ color:'var(--c-active)' }}><IconCheck /></span> {message}
    </div>
  );
}

// ---- Tweaks Panel ----
function TweaksPanel({ tweaks, onChange }) {
  return (
    <div style={{
      position:'fixed', bottom:20, right:20, zIndex:900,
      background:'var(--bg-panel)', border:'1px solid var(--border-strong)',
      borderRadius:'var(--r-lg)', padding:'14px 16px', width:220,
      boxShadow:'0 8px 32px oklch(0 0 0 / 0.5)',
      display:'flex', flexDirection:'column', gap:14,
    }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)' }}>
        Tweaks
      </div>

      {/* Layout */}
      <div>
        <FieldLabel>Layout</FieldLabel>
        <div style={{ display:'flex', gap:5 }}>
          {['explorer','registry'].map(l => (
            <Btn key={l} onClick={() => onChange('layout', l)} size="sm"
              variant={tweaks.layout === l ? 'primary' : 'default'}
              style={{ flex:1, justifyContent:'center', fontSize:11 }}>
              {l}
            </Btn>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div>
        <FieldLabel>Accent Color</FieldLabel>
        <div style={{ display:'flex', gap:6 }}>
          {Object.entries(ACCENT_HUES).map(([name, hue]) => {
            const c = `oklch(0.72 0.16 ${hue})`;
            return (
              <button key={name} onClick={() => onChange('accent', name)} title={name} style={{
                width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer',
                border: tweaks.accent === name ? `2px solid var(--text)` : '2px solid transparent',
                outline: tweaks.accent === name ? `2px solid ${c}` : 'none',
                outlineOffset:2,
              }} />
            );
          })}
        </div>
      </div>

      {/* Density */}
      <div>
        <FieldLabel>Density</FieldLabel>
        <div style={{ display:'flex', gap:5 }}>
          {['comfortable','compact'].map(d => (
            <Btn key={d} onClick={() => onChange('density', d)} size="sm"
              variant={tweaks.density === d ? 'primary' : 'default'}
              style={{ flex:1, justifyContent:'center', fontSize:11 }}>
              {d}
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== APP ====================
function App() {
  const [tree, setTree] = useStateApp(() => deepClone(INITIAL_TREE));
  const [selectedId, setSelectedId] = useStateApp(() => localStorage.getItem('oid-selected') || null);
  const [auditLog, setAuditLog] = useStateApp(() => deepClone(INITIAL_AUDIT));
  const [auditOpen, setAuditOpen] = useStateApp(false);
  const [modal, setModal] = useStateApp(null);
  const [toast, setToast] = useStateApp(null);
  const [tweaksVisible, setTweaksVisible] = useStateApp(false);
  const [tweaks, setTweaks] = useStateApp(TWEAK_DEFAULTS);

  // Persist selected node
  useEffectApp(() => {
    if (selectedId) localStorage.setItem('oid-selected', selectedId);
    else localStorage.removeItem('oid-selected');
  }, [selectedId]);

  // Apply accent CSS variable
  useEffectApp(() => { applyAccent(tweaks.accent); }, [tweaks.accent]);

  // Tweaks message protocol
  useEffectApp(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  function handleTweakChange(key, val) {
    const next = { ...tweaks, [key]: val };
    setTweaks(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
  }

  function addAuditEntry(action, nodeId, detail) {
    const entry = {
      id: Date.now(),
      ts: new Date().toISOString(),
      user: 'admin@example.com',
      action, nodeId, detail,
    };
    setAuditLog(prev => [entry, ...prev]);
  }

  function showToast(msg) { setToast(msg); }

  // ---- CRUD handlers ----
  function handleAddChild(parentNode) {
    setModal({ type: 'add', parent: parentNode });
  }

  function handleEdit(node) {
    const parent = findParent(tree, node.id);
    setModal({ type: 'edit', node, parent });
  }

  function handleSaveNode(nodeData, mode, parentNode) {
    if (mode === 'add') {
      setTree(prev => addChildInTree(prev, parentNode.id, nodeData));
      addAuditEntry('CREATE', nodeData.id, 'node created');
      setSelectedId(nodeData.id);
      showToast(`Created ${nodeData.id}`);
    } else {
      setTree(prev => updateInTree(prev, nodeData.id, nodeData));
      addAuditEntry('UPDATE', nodeData.id, `node updated`);
      showToast(`Saved ${nodeData.id}`);
    }
    setModal(null);
  }

  function handleToggleDisable(node) {
    const newStatus = node.status === 'disabled' ? 'active' : 'disabled';
    if (node.status !== 'disabled') {
      setModal({ type: 'confirm-disable', node });
    } else {
      setTree(prev => updateInTree(prev, node.id, { status: 'active' }));
      addAuditEntry('UPDATE', node.id, 'status: disabled → active');
      showToast(`Re-enabled ${node.id}`);
    }
  }

  function handleConfirmDisable(node) {
    setTree(prev => updateInTree(prev, node.id, { status: 'disabled' }));
    addAuditEntry('DISABLE', node.id, 'status: active → disabled');
    setModal(null);
    showToast(`Disabled ${node.id}`);
  }

  function handleDelete(node) {
    setModal({ type: 'confirm-delete', node });
  }

  function handleConfirmDelete(node) {
    setTree(prev => removeFromTree(prev, node.id));
    addAuditEntry('DELETE', node.id, 'node deleted');
    if (selectedId === node.id) setSelectedId(null);
    setModal(null);
    showToast(`Deleted ${node.id}`);
  }

  function handleDelegate(node) {
    setModal({ type: 'delegate', node });
  }

  function handleSaveDelegate(node, delegation) {
    setTree(prev => updateInTree(prev, node.id, { delegation }));
    addAuditEntry('DELEGATE', node.id, `delegated to ${delegation.org}`);
    setModal(null);
    showToast(`Delegated ${node.id} → ${delegation.org}`);
  }

  function handleRemoveDelegate(node) {
    setTree(prev => updateInTree(prev, node.id, { delegation: null }));
    addAuditEntry('UPDATE', node.id, 'delegation removed');
    showToast(`Delegation removed from ${node.id}`);
  }

  const compact = tweaks.density === 'compact';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* ── HEADER ── */}
      <header style={{
        height: compact ? 40 : 46,
        background:'var(--bg-panel)',
        borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', padding:'0 14px',
        gap:12, flexShrink:0,
      }}>
        {/* Logo / title */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginRight:4 }}>
          <div style={{ width:22, height:22, background:'var(--accent)', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'oklch(0.1 0.01 240)', fontWeight:600 }}>OID</span>
          </div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text)', fontWeight:500 }}>Registry Manager</span>
        </div>

        {/* Root arc badge */}
        <div style={{ display:'flex', alignItems:'center', gap:5, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'3px 9px' }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:'0.04em' }}>root</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)' }}>{OID_ROOT_ID}</span>
        </div>

        <div style={{ flex:1 }} />

        {/* Header actions */}
        <Btn onClick={() => setAuditOpen(o => !o)} variant={auditOpen ? 'primary' : 'default'} size="sm">
          <IconClock /> Audit Log
          {auditLog.length > 0 && (
            <span style={{ background:'var(--accent)', color:'oklch(0.1 0.01 240)', borderRadius:9, padding:'0 5px', fontFamily:'var(--font-mono)', fontSize:9, minWidth:16, textAlign:'center' }}>
              {auditLog.length}
            </span>
          )}
        </Btn>
        <Btn onClick={() => handleAddChild(tree)} variant="primary" size="sm">
          <IconPlus /> Add Root Child
        </Btn>
      </header>

      {/* ── BODY ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Explorer layout: tree sidebar */}
        {tweaks.layout === 'explorer' && (
          <TreePanel tree={tree} selectedId={selectedId} onSelect={setSelectedId} density={tweaks.density} />
        )}

        {/* Main content */}
        {tweaks.layout === 'explorer' ? (
          <NodeDetail
            tree={tree} nodeId={selectedId}
            onAddChild={handleAddChild}
            onEdit={handleEdit}
            onToggleDisable={handleToggleDisable}
            onDelete={handleDelete}
            onDelegate={handleDelegate}
            onRemoveDelegate={handleRemoveDelegate}
            compact={compact}
          />
        ) : (
          <RegistryPanel tree={tree} selectedId={selectedId} onSelect={setSelectedId} />
        )}

        {/* Registry detail side panel */}
        {tweaks.layout === 'registry' && selectedId && (
          <div style={{ width:360, flexShrink:0, borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <NodeDetail
              tree={tree} nodeId={selectedId}
              onAddChild={handleAddChild}
              onEdit={handleEdit}
              onToggleDisable={handleToggleDisable}
              onDelete={handleDelete}
              onDelegate={handleDelegate}
              onRemoveDelegate={handleRemoveDelegate}
              compact={true}
            />
          </div>
        )}

        {/* Audit log */}
        {auditOpen && (
          <AuditLog
            log={auditLog}
            tree={tree}
            onClose={() => setAuditOpen(false)}
            onNodeSelect={(id) => { setSelectedId(id); if (tweaks.layout === 'registry') {/* already visible */} }}
          />
        )}
      </div>

      {/* ── MODALS ── */}
      {modal?.type === 'add' && (
        <NodeModal
          mode="add"
          parent={modal.parent}
          onSave={(data) => handleSaveNode(data, 'add', modal.parent)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit' && (
        <NodeModal
          mode="edit"
          node={modal.node}
          parent={modal.parent}
          onSave={(data) => handleSaveNode(data, 'edit', modal.parent)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'delegate' && (
        <DelegateModal
          node={modal.node}
          onSave={(delegation) => handleSaveDelegate(modal.node, delegation)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'confirm-disable' && (
        <ConfirmModal
          title={`Disable ${modal.node.id}?`}
          message={`This will mark the node and prevent its use. You can re-enable it later. ${(modal.node.children||[]).length > 0 ? 'Child nodes will remain intact but inherit a disabled parent.' : ''}`}
          confirmLabel="Disable Node"
          variant="warn"
          onConfirm={() => handleConfirmDisable(modal.node)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'confirm-delete' && (
        <ConfirmModal
          title={`Delete ${modal.node.id}?`}
          message={`This will permanently remove the node from the registry. This action cannot be undone.`}
          confirmLabel="Delete Node"
          variant="danger"
          onConfirm={() => handleConfirmDelete(modal.node)}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── TOAST ── */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* ── TWEAKS ── */}
      {tweaksVisible && <TweaksPanel tweaks={tweaks} onChange={handleTweakChange} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
