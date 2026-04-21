// oid-ui.jsx — shared primitive components

const { useState: useStateUI, useRef: useRefUI } = React;

// ---- Icons (inline SVG, tiny) ----
function IconChevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transition:'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink:0 }}>
      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconPlus() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconEdit() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
}
function IconTrash() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 3h8M4 3V1.5h3V3M2.5 3l.75 6.5h4.5L8.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconClock() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
function IconGlobe() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.2" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 1.3c-1 1.3-1.6 2.6-1.6 4.2s.6 2.9 1.6 4.2M5.5 1.3c1 1.3 1.6 2.6 1.6 4.2s-.6 2.9-1.6 4.2M1.3 5.5h8.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
function IconLock() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
function IconDelegate() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 4.5v1.5l2.5 1.5M8 4.5v1.5L5.5 7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>;
}
function IconBan() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 2.5l6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function IconX() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconCheck() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconSearch() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="3.8" stroke="currentColor" strokeWidth="1.3"/><path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}

// ---- Status + Visibility ----
function StatusDot({ status, showLabel = true }) {
  const map = {
    active:     { color: 'var(--c-active)',     label: 'active' },
    deprecated: { color: 'var(--c-deprecated)', label: 'deprecated' },
    disabled:   { color: 'var(--c-disabled)',   label: 'disabled' },
  };
  const { color, label } = map[status] || map.disabled;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, lineHeight:1 }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0, boxShadow:`0 0 5px ${color}88` }} />
      {showLabel && <span style={{ color, fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>}
    </span>
  );
}

function VisBadge({ vis }) {
  const isPublic = vis === 'public';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.06em',
      color: isPublic ? 'var(--c-public)' : 'var(--c-private)',
      background: isPublic ? 'oklch(0.17 0.04 220)' : 'oklch(0.17 0.04 300)',
      border: `1px solid ${isPublic ? 'oklch(0.32 0.06 220)' : 'oklch(0.32 0.06 300)'}`,
      padding:'1px 6px 1px 4px', borderRadius:3,
    }}>
      {isPublic ? <IconGlobe /> : <IconLock />}
      {isPublic ? 'PUBLIC' : 'PRIVATE'}
    </span>
  );
}

// ---- Button ----
function Btn({ children, onClick, variant='default', size='md', disabled=false, title, style={} }) {
  const sizeMap = {
    xs: { padding:'2px 7px', fontSize:10, gap:3 },
    sm: { padding:'4px 9px', fontSize:11, gap:4 },
    md: { padding:'5px 12px', fontSize:12, gap:5 },
    lg: { padding:'8px 16px', fontSize:13, gap:6 },
  };
  const variantMap = {
    default: { background:'var(--bg-surface)', color:'var(--text)', border:'1px solid var(--border)' },
    primary: { background:'var(--accent)', color:'oklch(0.10 0.01 240)', border:'1px solid transparent' },
    ghost:   { background:'transparent', color:'var(--text-dim)', border:'1px solid transparent' },
    danger:  { background:'oklch(0.20 0.06 20)', color:'oklch(0.75 0.17 20)', border:'1px solid oklch(0.32 0.1 20)' },
    warn:    { background:'oklch(0.20 0.06 70)', color:'oklch(0.80 0.16 70)', border:'1px solid oklch(0.32 0.1 70)' },
  };
  const [hover, setHover] = useStateUI(false);
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:'inline-flex', alignItems:'center', cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius:'var(--r)', fontFamily:'var(--font-ui)', fontWeight:500,
        opacity: disabled ? 0.4 : 1, transition:'filter 0.1s, opacity 0.1s',
        filter: hover && !disabled ? 'brightness(1.15)' : 'none',
        outline:'none', userSelect:'none', whiteSpace:'nowrap',
        ...sizeMap[size],
        ...variantMap[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---- Input ----
function Input({ value, onChange, placeholder, style={}, type='text', autoFocus=false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)',
        color:'var(--text)', fontFamily:'var(--font-ui)', fontSize:12, padding:'5px 9px',
        outline:'none', width:'100%', transition:'border-color 0.1s', ...style,
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  );
}

// ---- Textarea ----
function Textarea({ value, onChange, placeholder, rows=3 }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)',
        color:'var(--text)', fontFamily:'var(--font-ui)', fontSize:12, padding:'6px 9px',
        outline:'none', width:'100%', resize:'vertical', transition:'border-color 0.1s',
        lineHeight:1.5,
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  );
}

// ---- Select ----
function OIDSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)',
      color:'var(--text)', fontFamily:'var(--font-ui)', fontSize:12, padding:'5px 9px',
      outline:'none', cursor:'pointer', width:'100%',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ---- Toggle ----
function Toggle({ value, onChange, labelOn='On', labelOff='Off' }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      display:'inline-flex', alignItems:'center', gap:7, cursor:'pointer',
      background:'transparent', border:'none', padding:0, color:'var(--text-dim)',
      fontFamily:'var(--font-ui)', fontSize:12, outline:'none',
    }}>
      <span style={{
        width:32, height:18, borderRadius:9, position:'relative',
        background: value ? 'var(--accent)' : 'var(--bg-surface)',
        border: `1px solid ${value ? 'var(--accent)' : 'var(--border)'}`,
        transition:'background 0.15s, border-color 0.15s', flexShrink:0,
      }}>
        <span style={{
          position:'absolute', top:2, left: value ? 13 : 2,
          width:12, height:12, borderRadius:'50%',
          background: value ? 'oklch(0.10 0.01 240)' : 'var(--text-muted)',
          transition:'left 0.15s',
        }} />
      </span>
      <span style={{ color: value ? 'var(--text)' : 'var(--text-muted)' }}>{value ? labelOn : labelOff}</span>
    </button>
  );
}

// ---- Field label ----
function FieldLabel({ children }) {
  return <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>{children}</div>;
}

// ---- Section divider ----
function Divider({ style={} }) {
  return <div style={{ borderBottom:'1px solid var(--border)', ...style }} />;
}

// ---- Empty state ----
function EmptyState({ message }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>
      {message}
    </div>
  );
}

Object.assign(window, {
  IconChevron, IconPlus, IconEdit, IconTrash, IconClock, IconGlobe,
  IconLock, IconDelegate, IconBan, IconX, IconCheck, IconSearch,
  StatusDot, VisBadge, Btn, Input, Textarea, OIDSelect, Toggle,
  FieldLabel, Divider, EmptyState,
});
