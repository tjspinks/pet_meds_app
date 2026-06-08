import { useRef } from 'react'
import { S } from './styles'
import { exportJSON, exportCSV, importJSON, saveMeds } from '../lib/dataService'

export function SettingsTab({
  settings, updateSettings,
  dbStatus,
  log, meds, animals,
  setMeds, setAnimals, setLog,
  useSupabase,
  showNotif,
}) {
  const importRef = useRef(null)
  const isKg = settings.weightUnit === 'kg'

  async function handleImportJSON(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const { treatments, medications, animals: imp } = await importJSON(file, useSupabase)
      if (medications.length) { setMeds(medications); saveMeds(medications, false) }
      if (imp?.length) setAnimals(prev => {
        const names = new Set(prev.map(a => a.name))
        return [...prev, ...imp.filter(a => !names.has(a.name))]
      })
      if (treatments.length) setLog(prev => {
        const ids = new Set(prev.map(t => t.id))
        return [...treatments.filter(t => !ids.has(t.id)), ...prev]
      })
      showNotif(`✓ Imported ${treatments.length} treatments`)
    } catch { showNotif('✗ Import failed.', 'err') }
    e.target.value = ''
  }

  return (
    <div>
      <div style={S.card}>
        <h2 style={S.cardTitle}>Settings</h2>
        <p style={S.cardDesc}>App-wide preferences, stored locally.</p>
        <div style={S.settingRow}>
          <div>
            <div style={{ fontWeight:600, fontSize:'14px' }}>Weight Unit</div>
            <div style={{ fontSize:'12px', color:'#9a8a7a', marginTop:'2px' }}>
              Default is kg. All calculations use kg internally.
            </div>
          </div>
          <div style={S.toggle}>
            <button style={{ ...S.toggleBtn, ...(isKg ? S.toggleBtnActive : {}) }}
              onClick={() => updateSettings({ weightUnit:'kg' })}>kg</button>
            <button style={{ ...S.toggleBtn, ...(!isKg ? S.toggleBtnActive : {}) }}
              onClick={() => updateSettings({ weightUnit:'lbs' })}>lbs</button>
          </div>
        </div>
        <div style={{ ...S.settingRow, borderBottom:'none' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:'14px' }}>Storage</div>
            <div style={{ fontSize:'12px', color: dbStatus === 'connected' ? '#4ade80' : '#fbbf24', marginTop:'2px' }}>
              {dbStatus === 'connected' ? '🟢 Connected to Supabase' : '🟡 localStorage (this device only)'}
            </div>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <h3 style={S.cardTitle}>Export Data</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <button style={S.exportBtn} onClick={() => exportJSON(log, meds, animals, [], [])}>
            ⬇ Export as JSON
            <span style={S.exportSub}>Full backup — treatments, meds, animals</span>
          </button>
          <button style={S.exportBtn} onClick={() => exportCSV(log)}>
            ⬇ Export as CSV
            <span style={S.exportSub}>Treatments only — open in Excel or Sheets</span>
          </button>
        </div>
      </div>

      <div style={S.card}>
        <h3 style={S.cardTitle}>Import Data</h3>
        <p style={S.cardDesc}>Import a previously exported JSON backup.</p>
        <input type="file" accept=".json" ref={importRef} onChange={handleImportJSON} style={{ display:'none' }} />
        <button style={{ ...S.saveBtn, background:'#4a6b8a' }} onClick={() => importRef.current.click()}>
          ⬆ Import JSON Backup
        </button>
      </div>
    </div>
  )
}
