import { useMemo } from 'react'
import { S, getMedColor } from './styles'

export function Dashboard({ log, meds, animalCount, onSelectAnimal }) {
  const medCounts = useMemo(() => {
    const c = {}
    meds.forEach(m => { c[m.name] = 0 })
    log.forEach(e => { c[e.medication] = (c[e.medication] || 0) + 1 })
    return c
  }, [log, meds])

  const maxCount = Math.max(...Object.values(medCounts), 1)

  return (
    <div>
      <div style={S.statsRow}>
        {[
          [log.length, 'Treatments'],
          [animalCount, 'Animals'],
          [meds.length, 'Medications'],
        ].map(([n, l]) => (
          <div key={l} style={S.statCard}>
            <div style={S.statNum}>{n}</div>
            <div style={S.statLabel}>{l}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <h3 style={S.cardTitle}>Treatments by Medication</h3>
        {log.length === 0 && <p style={S.cardDesc}>No data yet.</p>}
        <div style={S.chartArea}>
          {meds.filter(m => (medCounts[m.name] || 0) > 0).map(m => (
            <div key={m.name} style={S.barRow}>
              <div style={S.barLabel}>{m.name}</div>
              <div style={S.barTrack}>
                <div style={{
                  ...S.barFill,
                  width: `${((medCounts[m.name] || 0) / maxCount) * 100}%`,
                  background: getMedColor(meds, m.name),
                }} className="bar-fill" />
              </div>
              <div style={S.barCount}>{medCounts[m.name] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      {log.length > 0 && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Recent Activity</h3>
          {log.slice(0, 6).map(e => (
            <div key={e.id} style={{ ...S.activityRow, cursor:'pointer' }}
              onClick={() => onSelectAnimal({ name: e.animalName })}>
              <div style={{ ...S.activityDot, background: getMedColor(meds, e.medication) }} />
              <div style={{ flex:1 }}>
                <span style={{ fontWeight:600 }}>{e.animalName}</span>
                <span style={{ color:'#ccc', margin:'0 5px' }}>·</span>
                <span style={{ color: getMedColor(meds, e.medication) }}>{e.medication}</span>
                <span style={{ color:'#ccc', margin:'0 5px' }}>·</span>
                <span style={{ fontWeight:700, color:'#3d6b52' }}>{e.dose} mL</span>
              </div>
              <div style={S.activityTime}>{e.timestamp}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
