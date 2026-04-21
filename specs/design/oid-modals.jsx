// oid-modals.jsx — Add/Edit, Delegate, Confirm modals

const { useState: useStateMod, useEffect: useEffectMod } = React;

// ---- Modal shell ----
function Modal({ title, onClose, children, width=480 }) {
  return (
    <div style={{
      position:'fixed', inset:0, background:'oklch(0.05 0.01 240 / 0.75)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
      backdropFilter:'blur(2px)',
    }} onClick={onClose}>
      <div style={{
        width, maxWidth:'calc(100vw - 32px)', maxHeight:'calc(100vh - 64px)',
        background:'var(--bg-panel)', border:'1px solid var(--border-strong)',
        borderRadius:'var(--r-lg)', overflow:'hidden', display:'flex', flexDirection:'column',
        boxShadow:'0 24px 64px oklch(0.0 0.0 240 / 0.6)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text)', fontWeight:500 }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', display:'flex', padding:2 }}><IconX /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRow({ label, children, hint }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && <span style={{ fontFamily:'var(--font-ui)', fontSize:11, color:'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}

// ---- Add / Edit Node Modal ----
function NodeModal({ mode, parent, node, onSave, onClose }) {
  const isEdit = mode === 'edit';

  const initArc = isEdit ? arcLabel(node.id) : (parent ? nextArc(parent) : '');
  const [arc, setArc] = useStateMod(initArc);
  const [description, setDescription] = useStateMod(isEdit ? node.description : '');
  const [status, setStatus] = useStateMod(isEdit ? node.status : 'active');
  const [visibility, setVisibility] = useStateMod(isEdit ? node.visibility : 'public');
  const [refs, setRefs] = useStateMod(isEdit ? (node.refs||[]).join('\n') : '');
  const [error, setError] = useStateMod('');

  const parentId = isEdit ? (parent ? parent.id : OID_ROOT_ID) : (parent ? parent.id : OID_ROOT_ID);
  const previewId = isEdit ? node.id : `${parentId}.${arc}`;

  function handleSave() {
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!arc.trim()) { setError('Arc number is required.'); return; }
    if (!/^\d+$/.test(arc.trim())) { setError('Arc must be a positive integer.'); return; }

    const refsArr = refs.split('\n').map(r => r.trim()).filter(Boolean);
    const today = new Date().toISOString().split('T')[0];

    if (isEdit) {
      onSave({
        ...node,
        description: description.trim(),
        status, visibility,
        refs: refsArr,
        modified: today,
      });
    } else {
      onSave({
        id: `${parentId}.${arc.trim()}`,
        description: description.trim(),
        status, visibility,
        delegation: null,
        refs: refsArr,
        created: today,
        modified: today,
        children: [],
      });
    }
  }

  return (
    <Modal title={isEdit ? `Edit — ${node.id}` : `Add child to ${parentId}`} onClose={onClose}>
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto' }}>

        {/* OID preview */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'8px 12px' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.08em' }}>OID</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:14, color:'var(--accent)' }}>
            {isEdit ? node.id : (
              <>
                <span style={{ color:'var(--text-muted)' }}>{parentId}.</span>
                <span style={{ color: arc ? 'var(--accent)' : 'var(--text-muted)' }}>{arc || '?'}</span>
              </>
            )}
          </div>
        </div>

        {/* Arc (only for new nodes) */}
        {!isEdit && (
          <FormRow label="Arc Number" hint={`Suggested next arc: ${initArc}`}>
            <Input value={arc} onChange={setArc} placeholder={initArc} autoFocus />
          </FormRow>
        )}

        <FormRow label="Description">
          <Textarea value={description} onChange={setDescription} placeholder="Human-readable description of this OID node" rows={2} />
        </FormRow>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FormRow label="Status">
            <OIDSelect value={status} onChange={setStatus} options={[
              { value:'active', label:'Active' },
              { value:'deprecated', label:'Deprecated' },
              { value:'disabled', label:'Disabled' },
            ]} />
          </FormRow>
          <FormRow label="Visibility">
            <OIDSelect value={visibility} onChange={setVisibility} options={[
              { value:'public', label:'Public — anyone can see' },
              { value:'private', label:'Private — credentialed only' },
            ]} />
          </FormRow>
        </div>

        <FormRow label="References" hint="One URL per line">
          <Textarea value={refs} onChange={setRefs} placeholder="https://example.com/spec" rows={3} />
        </FormRow>

        {error && (
          <div style={{ background:'oklch(0.18 0.06 20)', border:'1px solid oklch(0.32 0.1 20)', borderRadius:'var(--r)', padding:'7px 10px', fontFamily:'var(--font-mono)', fontSize:11, color:'oklch(0.75 0.17 20)' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
        <Btn onClick={onClose} variant="ghost" size="sm">Cancel</Btn>
        <Btn onClick={handleSave} variant="primary" size="sm">{isEdit ? 'Save Changes' : 'Create Node'}</Btn>
      </div>
    </Modal>
  );
}

// ---- Delegate Modal ----
function DelegateModal({ node, onSave, onClose }) {
  const [org, setOrg] = useStateMod(node.delegation ? node.delegation.org : '');
  const [contact, setContact] = useStateMod(node.delegation ? node.delegation.contact : '');
  const [error, setError] = useStateMod('');

  function handleSave() {
    if (!org.trim()) { setError('Organization name is required.'); return; }
    onSave({ org: org.trim(), contact: contact.trim() });
  }

  return (
    <Modal title={`Delegate — ${node.id}`} onClose={onClose} width={420}>
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ fontFamily:'var(--font-ui)', fontSize:12, color:'var(--text-dim)', lineHeight:1.6, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'8px 12px' }}>
          Delegating this arc hands management of <span style={{ fontFamily:'var(--font-mono)', color:'var(--accent)' }}>{node.id}</span> and all its descendants to another organization.
        </div>
        <FormRow label="Organization Name">
          <Input value={org} onChange={setOrg} placeholder="e.g. HL7 International" autoFocus />
        </FormRow>
        <FormRow label="Contact / Email">
          <Input value={contact} onChange={setContact} placeholder="e.g. vocab@hl7.org" />
        </FormRow>
        {error && (
          <div style={{ background:'oklch(0.18 0.06 20)', border:'1px solid oklch(0.32 0.1 20)', borderRadius:'var(--r)', padding:'7px 10px', fontFamily:'var(--font-mono)', fontSize:11, color:'oklch(0.75 0.17 20)' }}>
            {error}
          </div>
        )}
      </div>
      <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
        <Btn onClick={onClose} variant="ghost" size="sm">Cancel</Btn>
        <Btn onClick={handleSave} variant="primary" size="sm">Assign Delegation</Btn>
      </div>
    </Modal>
  );
}

// ---- Confirm Modal ----
function ConfirmModal({ title, message, confirmLabel='Confirm', variant='danger', onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={380}>
      <div style={{ padding:'16px' }}>
        <p style={{ fontFamily:'var(--font-ui)', fontSize:13, color:'var(--text-dim)', lineHeight:1.6 }}>{message}</p>
      </div>
      <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
        <Btn onClick={onClose} variant="ghost" size="sm">Cancel</Btn>
        <Btn onClick={onConfirm} variant={variant} size="sm">{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

Object.assign(window, { NodeModal, DelegateModal, ConfirmModal });
