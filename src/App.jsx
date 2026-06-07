import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  checkSupabase, loadMeds, loadTreatments,
  addTreatment, addMed, updateMed, deleteMed,
  saveMeds, saveTreatmentsLocal,
  exportJSON, exportCSV, importJSON,
} from './lib/dataService'

const PALETTE = ['#7c9e87','#6b8fa8','#b08a6e','#9b7eb0','#c47c7c','#a89b6b','#6b9ea8','#a86b8a','#7ea87c','#a87c6b']

function getMedColor(meds, name) {
  const idx = meds.findIndex(m => m.name === name)
  return PALETTE[idx % PALETTE.length] || '#888'
}

function calcDose(weight, medName, meds) {
  const med = meds.find(m => m.name === medName)
  if (!med || !weight || isNaN(weight) || parseFloat(weight) <= 0) return null
  return (parseFloat(weight) * med.factor).toFixed(2)
}

export default function App() {
  const [tab, setTab] = useState('calculator')
  const [meds, setMeds] = useState([])
  const [log, setLog] = useState([])
  const [useSupabase, setUseSupabase] = useState(false)
  const [dbStatus, setDbStatus] = useState('checking') // checking | connected | local
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const [notifType, setNotifType] = useState('ok') // ok | warn | err

  // Calculator
  const [animalName, setAnimalName] = useState('')
  const [weight, setWeight] = useState('')
  const [weightLocked, setWeightLocked] = useState(false)
  const [nameLocked, setNameLocked] = useState(false)
  const [medication, setMedication] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Med manager
  const [newMedName, setNewMedName] = useState('')
  const [newMedFactor, setNewMedFactor] = useState('')
  const [editingMed, setEditingMed] = useState(null)

  // Import
  const importRef = useRef(null)

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const sb = await checkSupabase()
      setUseSupabase(sb)
      setDbStatus(sb ? 'connected' : 'local')
      const [medsData, logData] = await Promise.all([loadMeds(sb), loadTreatments(sb)])
      setMeds(medsData)
      setLog(logData)
      setMedication(medsData[0]?.name || '')
      setLoading(false)
    }
    init()
  }, [])

  // Auto-save log to localStorage whenever it changes
  useEffect(() => {
    if (!loading) saveTreatmentsLocal(log)
  }, [log, loading])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showNotif(msg, type = 'ok') {
    setNotification(msg); setNotifType(type)
    setTimeout(() => setNotification(null), 3000)
  }

  const dose = calcDose(weight, medication, meds)
  const activeMed = meds.find(m => m.name === medication)

  // Known animals (most recent weight)
  const knownAnimals = useMemo(() => {
    const map = {}
    log.forEach(e => { map[e.animalName] = e.weight })
    return map
  }, [log])

  const suggestions = useMemo(() => {
    if (!animalName.trim() || nameLocked) return []
    return Object.keys(knownAnimals).filter(n =>
      n.toLowerCase().includes(animalName.toLowerCase())
    )
  }, [animalName, knownAnimals, nameLocked])

  useEffect(() => {
    if (!nameLocked && animalName.trim() && knownAnimals[animalName.trim()] !== undefined) {
      setWeight(String(knownAnimals[animalName.trim()]))
    }
  }, [animalName])

  useEffect(() => {
    if (!meds.find(m => m.name === medication) && meds.length > 0) {
      setMedication(meds[0].name)
    }
  }, [meds])

  // ── Treatments ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!animalName.trim() || !weight || !dose) {
      showNotif('⚠ Please fill in all fields.', 'warn'); return
    }
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      animalName: animalName.trim(),
      weight: parseFloat(weight),
      medication,
      dose: parseFloat(dose),
    }
    const saved = await addTreatment(entry, useSupabase)
    setLog(prev => [saved, ...prev])
    showNotif(`✓ ${saved.animalName} · ${saved.medication.split(' ')[0]} · ${saved.dose} mL`)
    setNameLocked(true)
    setWeightLocked(true)
  }

  function handleClearLock() {
    setAnimalName(''); setWeight('')
    setNameLocked(false); setWeightLocked(false)
  }

  // ── Medications ───────────────────────────────────────────────────────────
  async function handleAddMed() {
    const name = newMedName.trim()
    const factor = parseFloat(newMedFactor)
    if (!name || isNaN(factor) || factor <= 0) { showNotif('⚠ Enter a valid name and factor.', 'warn'); return }
    if (meds.find(m => m.name.toLowerCase() === name.toLowerCase())) { showNotif('⚠ Already exists.', 'warn'); return }
    const newMed = await addMed({ name, factor }, useSupabase)
    const updated = [...meds, newMed]
    setMeds(updated)
    saveMeds(updated, false) // always persist locally
    setNewMedName(''); setNewMedFactor('')
    showNotif(`✓ Added ${name}`)
  }

  function handleEditMed(idx) {
    setEditingMed(idx)
    setNewMedName(meds[idx].name)
    setNewMedFactor(String(meds[idx].factor))
  }

  async function handleSaveEdit() {
    const name = newMedName.trim()
    const factor = parseFloat(newMedFactor)
    if (!name || isNaN(factor) || factor <= 0) { showNotif('⚠ Enter valid values.', 'warn'); return }
    const updated = meds.map((m, i) => i === editingMed ? { ...m, name, factor } : m)
    await updateMed(updated[editingMed], useSupabase)
    setMeds(updated)
    saveMeds(updated, false)
    setEditingMed(null); setNewMedName(''); setNewMedFactor('')
    showNotif('✓ Updated')
  }

  async function handleDeleteMed(idx) {
    await deleteMed(meds[idx], useSupabase)
    const updated = meds.filter((_, i) => i !== idx)
    setMeds(updated)
    saveMeds(updated, false)
  }

  // ── Import / Export ───────────────────────────────────────────────────────
  async function handleImport(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const { treatments, medications } = await importJSON(file, useSupabase)
      if (medications.length) { setMeds(medications); saveMeds(medications, false) }
      if (treatments.length) {
        setLog(prev => {
          const ids = new Set(prev.map(t => t.id))
          const fresh = treatments.filter(t => !ids.has(t.id))
          return [...fresh, ...prev]
        })
      }
      showNotif(`✓ Imported ${treatments.length} treatments`)
    } catch { showNotif('✗ Import failed — invalid file.', 'err') }
    e.target.value = ''
  }

  // ── Chart data ────────────────────────────────────────────────────────────
  const medCounts = useMemo(() => {
    const c = {}; meds.forEach(m => { c[m.name] = 0 })
    log.forEach(e => { c[e.medication] = (c[e.medication] || 0) + 1 })
    return c
  }, [log, meds])

  const maxCount = Math.max(...Object.values(medCounts), 1)

  const animalHistory = useMemo(() => {
    const map = {}
    log.forEach(e => {
      if (!map[e.animalName]) map[e.animalName] = []
      map[e.animalName].push(e)
    })
    return map
  }, [log])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f4f0eb', fontFamily:'DM Sans,sans-serif', color:'#3d6b52', fontSize:'18px', fontWeight:700 }}>
      🐾 Loading...
    </div>
  )

  return (
    <div style={S.root}>
      <style>{css}</style>
      {notification && (
        <div style={{ ...S.notif, background: notifType === 'err' ? '#7a2020' : notifType === 'warn' ? '#6b5a20' : '#2a3d30' }}>
          {notification}
        </div>
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={S.logo}>🐾</div>
        <div>
          <div style={S.title}>Vet Dosage Tracker</div>
          <div style={S.subtitle}>Medication Calculator & Treatment Log</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ ...S.dbPill, background: dbStatus === 'connected' ? '#1a4a2e' : '#3a2e1a' }}>
            <div style={{ ...S.dbDot, background: dbStatus === 'connected' ? '#4ade80' : '#fbbf24' }} />
            {dbStatus === 'connected' ? 'Supabase' : 'Local'}
          </div>
          <div style={S.logBadge}>{log.length} treatments</div>
        </div>
      </header>

      {/* Tabs */}
      <div style={S.tabBar}>
        {[['calculator','💊','Calc'],['log','📋','Log'],['dashboard','📊','Stats'],['meds','⚗️','Meds'],['data','📦','Data']].map(([t,icon,label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...S.tabBtn, ...(tab === t ? S.tabBtnActive : {}) }}>
            {icon} {label}
          </button>
        ))}
      </div>

      <main style={S.main}>

        {/* ── CALCULATOR ── */}
        {tab === 'calculator' && (
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
              <h2 style={S.cardTitle}>Dose Calculator</h2>
              {(nameLocked || weightLocked) && (
                <button onClick={handleClearLock} style={S.clearBtn}>✕ New animal</button>
              )}
            </div>
            <p style={S.cardDesc}>
              {nameLocked
                ? `Locked on ${animalName} (${weight} lbs) — change the med and save again.`
                : 'Type a known name to auto-fill their last weight.'}
            </p>

            {/* Animal name */}
            <div style={{ position:'relative', marginBottom:'14px' }}>
              <div style={S.fieldLabel}>Animal Name</div>
              <input
                style={{ ...S.input, ...(nameLocked ? S.inputLocked : {}) }}
                placeholder="e.g. Mochi"
                value={animalName}
                readOnly={nameLocked}
                onChange={e => { setAnimalName(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={S.dropdown}>
                  {suggestions.map(n => (
                    <div key={n} style={S.dropdownItem}
                      onMouseDown={() => { setAnimalName(n); setWeight(String(knownAnimals[n])); setShowSuggestions(false) }}>
                      <span style={{ fontWeight:600 }}>🐱 {n}</span>
                      <span style={{ color:'#9a8a7a', fontSize:'12px' }}>{knownAnimals[n]} lbs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weight */}
            <div style={{ marginBottom:'14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                <div style={S.fieldLabel}>Body Weight (lbs)</div>
                {weightLocked && <button onClick={() => setWeightLocked(false)} style={S.editBtn}>✎ Edit</button>}
              </div>
              <input style={{ ...S.input, ...(weightLocked ? S.inputLocked : {}) }}
                type="number" placeholder="e.g. 8.5" value={weight}
                readOnly={weightLocked}
                onChange={e => setWeight(e.target.value)} />
            </div>

            {/* Medication */}
            <div style={{ marginBottom:'20px' }}>
              <div style={S.fieldLabel}>Medication</div>
              <select style={S.select} value={medication} onChange={e => setMedication(e.target.value)}>
                {meds.map(m => <option key={m.name} value={m.name}>{m.name} (×{m.factor})</option>)}
              </select>
            </div>

            {/* Dose display */}
            <div style={S.doseBox}>
              <div style={S.doseLabel}>Calculated Dose</div>
              <div style={S.doseValue}>{dose ? `${dose} mL` : '—'}</div>
              {dose && activeMed && (
                <div style={S.doseFormula}>{weight} lbs × {activeMed.factor} = {dose} mL</div>
              )}
            </div>

            <button style={S.saveBtn} onClick={handleSave} className="save-btn">
              {nameLocked ? `Save (${animalName} · ${medication.split(' ')[0]}) →` : 'Save to Treatment Log →'}
            </button>
          </div>
        )}

        {/* ── LOG ── */}
        {tab === 'log' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Treatment Log</h2>
              <p style={S.cardDesc}>{log.length === 0
                ? 'No treatments recorded yet.'
                : `${log.length} treatment${log.length !== 1?'s':''} · ${Object.keys(animalHistory).length} animal${Object.keys(animalHistory).length!==1?'s':''}`}
              </p>
            </div>

            {Object.keys(animalHistory).length > 0 && (
              <div style={S.animalGrid}>
                {Object.entries(animalHistory).map(([name, entries]) => (
                  <div key={name} style={S.animalCard}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={S.animalName}>🐱 {name}</div>
                      <button onClick={() => {
                        setAnimalName(name); setWeight(String(entries[0].weight))
                        setNameLocked(true); setWeightLocked(true); setTab('calculator')
                      }} style={S.editBtn}>+ Treat</button>
                    </div>
                    <div style={S.animalMeta}>{entries.length} treatment{entries.length!==1?'s':''} · Last: {entries[0].weight} lbs</div>
                    <div style={S.animalEntries}>
                      {entries.slice(0,4).map(e => (
                        <div key={e.id} style={S.animalEntry}>
                          <span style={{ ...S.medTag, background:getMedColor(meds,e.medication)+'33', color:getMedColor(meds,e.medication), borderColor:getMedColor(meds,e.medication)+'66' }}>
                            {e.medication.split(' ')[0]}
                          </span>
                          <span style={S.entryDose}>{e.dose} mL</span>
                          <span style={S.entryTime}>{e.timestamp}</span>
                        </div>
                      ))}
                      {entries.length > 4 && <div style={{ fontSize:'11px', color:'#aaa' }}>+{entries.length-4} more</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {log.length > 0 && (
              <div style={S.card}>
                <h3 style={{ ...S.cardTitle, fontSize:'14px' }}>Full Log</h3>
                <div style={{ overflowX:'auto' }}>
                  <table style={S.table}>
                    <thead><tr>
                      {['Timestamp','Animal','Weight (lbs)','Medication','Dose (mL)'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {log.map(e => (
                        <tr key={e.id} style={S.tr}>
                          <td style={S.td}>{e.timestamp}</td>
                          <td style={{ ...S.td, fontWeight:600 }}>{e.animalName}</td>
                          <td style={S.td}>{e.weight}</td>
                          <td style={S.td}>
                            <span style={{ ...S.medTag, background:getMedColor(meds,e.medication)+'22', color:getMedColor(meds,e.medication), borderColor:getMedColor(meds,e.medication)+'55' }}>
                              {e.medication}
                            </span>
                          </td>
                          <td style={{ ...S.td, fontWeight:700, color:'#3d6b52' }}>{e.dose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div>
            <div style={S.statsRow}>
              {[[log.length,'Treatments'],[Object.keys(animalHistory).length,'Animals'],[meds.length,'Medications']].map(([n,l]) => (
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
                {meds.filter(m => (medCounts[m.name]||0) > 0 || log.length === 0).map(m => (
                  <div key={m.name} style={S.barRow}>
                    <div style={S.barLabel}>{m.name}</div>
                    <div style={S.barTrack}>
                      <div style={{ ...S.barFill, width:`${((medCounts[m.name]||0)/maxCount)*100}%`, background:getMedColor(meds,m.name), opacity:(medCounts[m.name]||0)===0?0.2:1 }} className="bar-fill" />
                    </div>
                    <div style={S.barCount}>{medCounts[m.name]||0}</div>
                  </div>
                ))}
              </div>
            </div>
            {log.length > 0 && (
              <div style={S.card}>
                <h3 style={S.cardTitle}>Recent Activity</h3>
                {log.slice(0,6).map(e => (
                  <div key={e.id} style={S.activityRow}>
                    <div style={{ ...S.activityDot, background:getMedColor(meds,e.medication) }} />
                    <div style={{ flex:1 }}>
                      <span style={{ fontWeight:600 }}>{e.animalName}</span>
                      <span style={{ color:'#ccc', margin:'0 5px' }}>·</span>
                      <span style={{ color:getMedColor(meds,e.medication) }}>{e.medication}</span>
                      <span style={{ color:'#ccc', margin:'0 5px' }}>·</span>
                      <span style={{ fontWeight:700, color:'#3d6b52' }}>{e.dose} mL</span>
                    </div>
                    <div style={S.activityTime}>{e.timestamp}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MEDICATIONS ── */}
        {tab === 'meds' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Manage Medications</h2>
              <p style={S.cardDesc}>Add, edit, or remove medications and their dosage factors (mL per lb).</p>
              <div style={S.medList}>
                {meds.map((m, i) => (
                  <div key={m.name} style={S.medRow}>
                    {editingMed === i ? (
                      <>
                        <input style={{ ...S.input, flex:2, fontSize:'13px', padding:'7px 10px' }} value={newMedName} onChange={e => setNewMedName(e.target.value)} />
                        <input style={{ ...S.input, flex:'0 0 90px', fontSize:'13px', padding:'7px 10px' }} type="number" step="0.001" value={newMedFactor} onChange={e => setNewMedFactor(e.target.value)} />
                        <button style={S.actionBtnGreen} onClick={handleSaveEdit}>Save</button>
                        <button style={S.actionBtnGhost} onClick={() => { setEditingMed(null); setNewMedName(''); setNewMedFactor('') }}>✕</button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:'14px' }}>{m.name}</div>
                          <div style={{ fontSize:'12px', color:'#9a8a7a' }}>×{m.factor} mL/lb</div>
                        </div>
                        <div style={{ ...S.medTag, background:getMedColor(meds,m.name)+'22', color:getMedColor(meds,m.name), borderColor:getMedColor(meds,m.name)+'55' }}>
                          {medCounts[m.name]||0} uses
                        </div>
                        <button style={S.actionBtnGhost} onClick={() => handleEditMed(i)}>✎</button>
                        <button style={S.actionBtnRed} onClick={() => handleDeleteMed(i)}>✕</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Add New Medication</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div>
                  <div style={S.fieldLabel}>Medication Name</div>
                  <input style={S.input} placeholder="e.g. Ponazuril 15%" value={newMedName} onChange={e => setNewMedName(e.target.value)} />
                </div>
                <div>
                  <div style={S.fieldLabel}>Dosage Factor (mL per lb)</div>
                  <input style={S.input} type="number" step="0.001" placeholder="e.g. 0.05" value={newMedFactor} onChange={e => setNewMedFactor(e.target.value)} />
                  {newMedFactor && !isNaN(parseFloat(newMedFactor)) && parseFloat(newMedFactor) > 0 && (
                    <div style={{ fontSize:'12px', color:'#7a6a5a', marginTop:'5px' }}>
                      Example: 10 lb cat → {(10 * parseFloat(newMedFactor)).toFixed(2)} mL
                    </div>
                  )}
                </div>
                <button style={S.saveBtn} onClick={handleAddMed} className="save-btn">Add Medication</button>
              </div>
            </div>
          </div>
        )}

        {/* ── DATA ── */}
        {tab === 'data' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Data & Portability</h2>
              <p style={S.cardDesc}>Export your data to CSV or JSON, or import a previous export. JSON preserves everything including medications.</p>

              <div style={S.dataStatus}>
                <div style={S.dataStatusRow}>
                  <span>Storage</span>
                  <span style={{ fontWeight:700, color: dbStatus==='connected'?'#4ade80':'#fbbf24' }}>
                    {dbStatus === 'connected' ? '🟢 Supabase (cloud)' : '🟡 localStorage (this device)'}
                  </span>
                </div>
                <div style={S.dataStatusRow}>
                  <span>Treatments saved</span>
                  <span style={{ fontWeight:700 }}>{log.length}</span>
                </div>
                <div style={S.dataStatusRow}>
                  <span>Animals tracked</span>
                  <span style={{ fontWeight:700 }}>{Object.keys(animalHistory).length}</span>
                </div>
              </div>
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Export</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <button style={S.exportBtn} onClick={() => exportJSON(log, meds)} className="export-btn">
                  ⬇ Export as JSON
                  <span style={S.exportSub}>Full backup — includes medications & all treatments</span>
                </button>
                <button style={S.exportBtn} onClick={() => exportCSV(log)} className="export-btn">
                  ⬇ Export as CSV
                  <span style={S.exportSub}>Treatments only — open in Excel or Google Sheets</span>
                </button>
              </div>
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Import</h3>
              <p style={S.cardDesc}>Import a previously exported JSON file. Duplicate entries will be skipped.</p>
              <input type="file" accept=".json" ref={importRef} onChange={handleImport} style={{ display:'none' }} />
              <button style={{ ...S.saveBtn, background:'#4a6b8a' }} onClick={() => importRef.current.click()} className="save-btn">
                ⬆ Import JSON Backup
              </button>
            </div>

            {dbStatus === 'local' && (
              <div style={{ ...S.card, borderColor:'#c8a84a', background:'#fdf8ed' }}>
                <h3 style={{ ...S.cardTitle, color:'#7a5a10' }}>💡 Move to Cloud</h3>
                <p style={{ fontSize:'13px', color:'#7a5a10', margin:0 }}>
                  You're currently storing data locally on this device only. To sync across devices, add your Supabase credentials to the <code style={{ background:'#f0e8cc', padding:'1px 5px', borderRadius:'4px' }}>.env</code> file and redeploy. Then use Import to upload your existing data.
                </p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

const S = {
  root: { fontFamily:"'DM Sans','Nunito',sans-serif", background:'#f4f0eb', minHeight:'100vh', color:'#2a2018' },
  header: { background:'#2a3d30', color:'#e8f0e9', padding:'14px 18px', display:'flex', alignItems:'center', gap:'12px' },
  logo: { fontSize:'24px' },
  title: { fontSize:'17px', fontWeight:700, letterSpacing:'-0.3px' },
  subtitle: { fontSize:'11px', opacity:0.6, marginTop:'2px' },
  dbPill: { display:'flex', alignItems:'center', gap:'6px', borderRadius:'20px', padding:'4px 10px', fontSize:'11px', fontWeight:600, color:'#c8e6d0' },
  dbDot: { width:'7px', height:'7px', borderRadius:'50%' },
  logBadge: { background:'#3d6b52', color:'#c8e6d0', borderRadius:'20px', padding:'4px 10px', fontSize:'11px', fontWeight:600 },
  tabBar: { display:'flex', background:'#e8e2d9', borderBottom:'2px solid #d5ccc0', overflowX:'auto' },
  tabBtn: { flex:1, minWidth:'60px', padding:'11px 6px', border:'none', background:'transparent', cursor:'pointer', fontSize:'12px', fontWeight:600, color:'#7a6a5a', transition:'all 0.15s', borderBottom:'3px solid transparent', marginBottom:'-2px', whiteSpace:'nowrap' },
  tabBtnActive: { color:'#2a3d30', borderBottomColor:'#3d6b52', background:'#f4f0eb' },
  main: { padding:'14px 12px', maxWidth:'680px', margin:'0 auto' },
  card: { background:'#fff', borderRadius:'14px', padding:'16px', marginBottom:'12px', boxShadow:'0 2px 12px rgba(42,32,24,0.07)', border:'1px solid #ede6dd' },
  cardTitle: { fontSize:'16px', fontWeight:700, margin:'0 0 5px', color:'#1e2d22' },
  cardDesc: { fontSize:'13px', color:'#7a6a5a', margin:'0 0 14px' },
  fieldLabel: { fontSize:'11px', fontWeight:700, color:'#5a4a3a', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' },
  input: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid #d5ccc0', fontSize:'15px', background:'#faf8f5', outline:'none', color:'#2a2018', fontFamily:'inherit', boxSizing:'border-box' },
  inputLocked: { background:'#f0ebe2', color:'#5a4a3a', borderColor:'#c8bfb0' },
  select: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid #d5ccc0', fontSize:'14px', background:'#faf8f5', outline:'none', color:'#2a2018', fontFamily:'inherit', cursor:'pointer' },
  doseBox: { background:'linear-gradient(135deg,#2a3d30 0%,#3d6b52 100%)', borderRadius:'12px', padding:'18px', textAlign:'center', marginBottom:'14px', color:'#e8f5ec' },
  doseLabel: { fontSize:'11px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', opacity:0.7 },
  doseValue: { fontSize:'38px', fontWeight:800, letterSpacing:'-1px', margin:'6px 0 3px' },
  doseFormula: { fontSize:'12px', opacity:0.6 },
  saveBtn: { width:'100%', padding:'13px', borderRadius:'10px', border:'none', background:'#3d6b52', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer', transition:'background 0.15s,transform 0.1s' },
  clearBtn: { padding:'5px 12px', borderRadius:'20px', border:'1.5px solid #d5ccc0', background:'#faf8f5', color:'#7a6a5a', fontSize:'12px', fontWeight:600, cursor:'pointer' },
  editBtn: { padding:'4px 10px', borderRadius:'20px', border:'1.5px solid #b8d4c0', background:'#eef6f1', color:'#3d6b52', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  notif: { position:'fixed', top:'14px', left:'50%', transform:'translateX(-50%)', color:'#e8f5ec', padding:'10px 22px', borderRadius:'30px', fontSize:'13px', fontWeight:600, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', whiteSpace:'nowrap', maxWidth:'92vw', overflow:'hidden', textOverflow:'ellipsis' },
  dropdown: { position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1.5px solid #d5ccc0', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)', zIndex:100 },
  dropdownItem: { padding:'10px 14px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'14px', borderBottom:'1px solid #f0ebe4' },
  animalGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:'10px', marginBottom:'12px' },
  animalCard: { background:'#fff', borderRadius:'14px', padding:'14px', border:'1px solid #ede6dd', boxShadow:'0 2px 8px rgba(42,32,24,0.06)' },
  animalName: { fontSize:'15px', fontWeight:700, marginBottom:'3px' },
  animalMeta: { fontSize:'12px', color:'#9a8a7a', marginBottom:'10px' },
  animalEntries: { display:'flex', flexDirection:'column', gap:'6px' },
  animalEntry: { display:'flex', alignItems:'center', gap:'7px', fontSize:'12px' },
  medTag: { padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:700, border:'1px solid', whiteSpace:'nowrap' },
  entryDose: { fontWeight:700, color:'#3d6b52' },
  entryTime: { color:'#aaa', marginLeft:'auto', fontSize:'11px' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'13px' },
  th: { textAlign:'left', padding:'8px 10px', color:'#7a6a5a', fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #ede6dd' },
  tr: { borderBottom:'1px solid #f0ebe4' },
  td: { padding:'9px 10px', color:'#2a2018' },
  statsRow: { display:'flex', gap:'10px', marginBottom:'12px' },
  statCard: { flex:1, background:'#fff', borderRadius:'12px', padding:'14px', textAlign:'center', border:'1px solid #ede6dd', boxShadow:'0 2px 8px rgba(42,32,24,0.06)' },
  statNum: { fontSize:'26px', fontWeight:800, color:'#2a3d30' },
  statLabel: { fontSize:'11px', color:'#9a8a7a', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginTop:'3px' },
  chartArea: { display:'flex', flexDirection:'column', gap:'12px', marginTop:'14px' },
  barRow: { display:'flex', alignItems:'center', gap:'8px' },
  barLabel: { fontSize:'11px', fontWeight:600, color:'#5a4a3a', width:'145px', flexShrink:0 },
  barTrack: { flex:1, height:'18px', background:'#f0ebe4', borderRadius:'10px', overflow:'hidden' },
  barFill: { height:'100%', borderRadius:'10px', minWidth:'3px' },
  barCount: { fontSize:'13px', fontWeight:700, width:'22px', textAlign:'right', color:'#3d6b52' },
  activityRow: { display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom:'1px solid #f0ebe4', fontSize:'13px' },
  activityDot: { width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 },
  activityTime: { marginLeft:'auto', fontSize:'11px', color:'#bbb', whiteSpace:'nowrap' },
  medList: { display:'flex', flexDirection:'column', gap:'8px', marginBottom:'4px' },
  medRow: { display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd' },
  actionBtnGhost: { padding:'5px 10px', borderRadius:'7px', border:'1.5px solid #d5ccc0', background:'transparent', color:'#7a6a5a', fontSize:'12px', fontWeight:600, cursor:'pointer' },
  actionBtnGreen: { padding:'5px 10px', borderRadius:'7px', border:'1.5px solid #3d6b52', background:'#eef6f1', color:'#3d6b52', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  actionBtnRed: { padding:'5px 10px', borderRadius:'7px', border:'1.5px solid #e0b0b0', background:'#fdf0f0', color:'#b05050', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  dataStatus: { background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd', marginBottom:'4px', overflow:'hidden' },
  dataStatusRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderBottom:'1px solid #f0ebe4', fontSize:'13px' },
  exportBtn: { display:'flex', flexDirection:'column', gap:'3px', width:'100%', padding:'14px 16px', borderRadius:'10px', border:'1.5px solid #d5ccc0', background:'#faf8f5', color:'#2a2018', fontSize:'14px', fontWeight:700, cursor:'pointer', textAlign:'left', transition:'background 0.15s' },
  exportSub: { fontSize:'11px', color:'#9a8a7a', fontWeight:400 },
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; }
  .save-btn:hover { background: #2a5240 !important; transform: translateY(-1px); }
  .save-btn:active { transform: translateY(0px); }
  .export-btn:hover { background: #f0ebe2 !important; }
  input:focus, select:focus { border-color: #3d6b52 !important; box-shadow: 0 0 0 3px rgba(61,107,82,0.15); }
  .bar-fill { transition: width 0.6s cubic-bezier(.23,1.01,.32,1); }
`
