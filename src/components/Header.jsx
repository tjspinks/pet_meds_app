import { S } from './styles'

export function Header({ dbStatus, logCount }) {
  const connected = dbStatus === 'connected'
  return (
    <header style={S.header}>
      <div style={S.logo}>🐾</div>
      <div>
        <div style={S.title}>Vet Dosage Tracker</div>
        <div style={S.subtitle}>Medication Calculator & Treatment Log</div>
      </div>
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
        <div style={{ ...S.dbPill, background: connected ? '#1a4a2e' : '#3a2e1a' }}>
          <div style={{ ...S.dbDot, background: connected ? '#4ade80' : '#fbbf24' }} />
          {connected ? 'Supabase' : 'Local'}
        </div>
        <div style={S.logBadge}>{logCount}</div>
      </div>
    </header>
  )
}

export function ProfileHeader({ title, subtitle, onBack, rightAction }) {
  return (
    <header style={S.header}>
      <button onClick={onBack} style={S.backBtn}>← Back</button>
      <div style={S.logo}>🐱</div>
      <div>
        <div style={S.title}>{title}</div>
        <div style={S.subtitle}>{subtitle}</div>
      </div>
      {rightAction}
    </header>
  )
}

const TABS = [
  ['calculator','💊','Calc'],
  ['animals','🐱','Animals'],
  ['log','📋','Log'],
  ['dashboard','📊','Stats'],
  ['meds','⚗️','Meds'],
  ['settings','⚙️','Settings'],
]

export function TabBar({ activeTab, onChange }) {
  return (
    <div style={S.tabBar}>
      {TABS.map(([t, icon, label]) => (
        <button key={t} onClick={() => onChange(t)}
          style={{ ...S.tabBtn, ...(activeTab === t ? S.tabBtnActive : {}) }}>
          {icon} {label}
        </button>
      ))}
    </div>
  )
}
