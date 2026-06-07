import { useState, useMemo, useRef, useEffect } from 'react'
import {
  checkSupabase, loadMeds, loadTreatments, loadAnimals, loadWeightLogs,
  addTreatment, addMed, updateMed, deleteMed, saveMeds,
  upsertAnimal, uploadAnimalPhoto,
  addWeightLog, deleteWeightLog,
  saveTreatmentsLocal, loadSettings, saveSettings,
  exportJSON, exportCSV, importJSON, parseMedCSV,
  toKg, toLbs, DEFAULT_MEDS,
} from './lib/dataService'

const PALETTE = ['#7c9e87','#6b8fa8','#b08a6e','#9b7eb0','#c47c7c','#a89b6b','#6b9ea8','#a86b8a','#7ea87c','#a87c6b','#8a7ca8','#6ba88a']
const getMedColor = (meds, name) => PALETTE[meds.findIndex(m => m.name === name) % PALETTE.length] || '#888'

function calcDose(weightKg, medName, meds) {
  const med = meds.find(m => m.name === medName)
  if (!med || !weightKg || isNaN(weightKg) || parseFloat(weightKg) <= 0) return null
  return (parseFloat(weightKg) * med.factor).toFixed(2)
}

// ─── Weight Line Chart (pure SVG, no deps) ────────────────────────────────────
function WeightChart({ entries, isKg, range, onRangeChange }) {
  const W = 560, H = 180, PAD = { top: 16, right: 16, bottom: 36, left: 44 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom
  const [tooltip, setTooltip] = useState(null)

  const filtered = useMemo(() => {
    if (range === 'all' || entries.length === 0) return entries
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (range === '30d' ? 30 : 90))
    return entries.filter(e => new Date(e.recorded_at) >= cutoff)
  }, [entries, range])

  if (filtered.length === 0) return (
    <div style={{ textAlign:'center', padding:'32px 0', color:'#9a8a7a', fontSize:'13px' }}>
      No weight data for this range.
    </div>
  )

  const vals   = filtered.map(e => isKg ? e.weight_kg : e.weight_lbs)
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  const spread = maxVal - minVal || 0.5
  const padV   = spread * 0.15

  const xOf = i => PAD.left + (i / Math.max(filtered.length - 1, 1)) * chartW
  const yOf = v  => PAD.top  + chartH - ((v - (minVal - padV)) / (spread + padV * 2)) * chartH

  const points = filtered.map((e, i) => ({ x: xOf(i), y: yOf(isKg ? e.weight_kg : e.weight_lbs), entry: e }))
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')

  // Y axis ticks
  const tickCount = 4
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (minVal - padV) + ((spread + padV * 2) * i / tickCount)
    return { v: Math.round(v * 10) / 10, y: PAD.top + chartH - (i / tickCount) * chartH }
  })

  // X axis labels — show up to 6 evenly spaced
  const xLabelIdx = filtered.length <= 6
    ? filtered.map((_, i) => i)
    : [0,1,2,3,4,5].map(i => Math.round(i * (filtered.length - 1) / 5))

  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', gap:'6px', marginBottom:'10px', justifyContent:'flex-end' }}>
        {[['30d','30d'],['90d','90d'],['all','All']].map(([val, label]) => (
          <button key={val} onClick={() => onRangeChange(val)}
            style={{ ...S.toggleBtn, ...(range === val ? S.toggleBtnActive : {}), padding:'3px 10px', fontSize:'11px' }}>
            {label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', overflow:'visible' }}
        onMouseLeave={() => setTooltip(null)}>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.left} y1={t.y} x2={PAD.left + chartW} y2={t.y}
            stroke="#ede6dd" strokeWidth="1" />
        ))}
        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.left - 6} y={t.y + 4} textAnchor="end"
            fontSize="10" fill="#9a8a7a">{t.v}</text>
        ))}
        {/* X axis labels */}
        {xLabelIdx.map(i => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle"
            fontSize="9" fill="#9a8a7a">
            {filtered[i]?.label || ''}
          </text>
        ))}
        {/* Area fill */}
        <polygon
          points={`${PAD.left},${PAD.top + chartH} ${polyline} ${PAD.left + chartW},${PAD.top + chartH}`}
          fill="#3d6b52" fillOpacity="0.08" />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke="#3d6b52" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots + hover targets */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#3d6b52" stroke="#fff" strokeWidth="1.5" />
            <circle cx={p.x} cy={p.y} r="14" fill="transparent"
              onMouseEnter={() => setTooltip({ ...p, i })}
              style={{ cursor:'crosshair' }} />
          </g>
        ))}
        {/* Tooltip */}
        {tooltip && (() => {
          const val  = isKg ? tooltip.entry.weight_kg : tooltip.entry.weight_lbs
          const unit = isKg ? 'kg' : 'lbs'
          const tx   = Math.min(Math.max(tooltip.x, PAD.left + 30), PAD.left + chartW - 30)
          const ty   = tooltip.y > PAD.top + 40 ? tooltip.y - 36 : tooltip.y + 16
          return (
            <g>
              <rect x={tx - 32} y={ty - 14} width="64" height="28" rx="6"
                fill="#2a3d30" opacity="0.92" />
              <text x={tx} y={ty + 1} textAnchor="middle" fontSize="12"
                fontWeight="700" fill="#e8f5ec">{val} {unit}</text>
              <text x={tx} y={ty + 12} textAnchor="middle" fontSize="9"
                fill="#9ac8b0">{tooltip.entry.label}</text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState('calculator')
  const [meds, setMeds]         = useState([])
  const [log, setLog]           = useState([])
  const [animals, setAnimals]   = useState([])
  const [settings, setSettings] = useState({ weightUnit: 'kg' })
  const [useSupabase, setUseSupabase] = useState(false)
  const [dbStatus, setDbStatus] = useState('checking')
  const [loading, setLoading]   = useState(true)
  const [notif, setNotif]       = useState(null)
  const [notifType, setNotifType] = useState('ok')

  // Calculator
  const [animalName, setAnimalName]     = useState('')
  const [weightInput, setWeightInput]   = useState('')
  const [weightLocked, setWeightLocked] = useState(false)
  const [nameLocked, setNameLocked]     = useState(false)
  const [medication, setMedication]     = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Animal profile
  const [selectedAnimal, setSelectedAnimal] = useState(null)
  const [animalWeightLogs, setAnimalWeightLogs] = useState([])
  const [weightRange, setWeightRange]   = useState('all')
  const [editingAnimal, setEditingAnimal] = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  // Log weight form inside profile
  const [logWeightInput, setLogWeightInput] = useState('')
  const [logWeightDate, setLogWeightDate]   = useState('')

  // Med manager
  const [newMedName, setNewMedName]     = useState('')
  const [newMedFactor, setNewMedFactor] = useState('')
  const [newMedConc, setNewMedConc]     = useState('')
  const [newMedIndic, setNewMedIndic]   = useState('')
  const [editingMed, setEditingMed]     = useState(null)

  const importRef    = useRef(null)
  const csvImportRef = useRef(null)
  const photoRef     = useRef(null)

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const sb = await checkSupabase()
      setUseSupabase(sb); setDbStatus(sb ? 'connected' : 'local')
      const [medsData, logData, animalsData] = await Promise.all([
        loadMeds(sb), loadTreatments(sb), loadAnimals(sb),
      ])
      setMeds(medsData); setLog(logData); setAnimals(animalsData)
      setMedication(medsData[0]?.name || '')
      setSettings(loadSettings())
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => { if (!loading) saveTreatmentsLocal(log) }, [log, loading])
  useEffect(() => {
    if (!meds.find(m => m.name === medication) && meds.length) setMedication(meds[0].name)
  }, [meds])

  // Load weight logs when opening animal profile
  useEffect(() => {
    if (!selectedAnimal) return
    loadWeightLogs(selectedAnimal.name, useSupabase).then(setAnimalWeightLogs)
  }, [selectedAnimal])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const isKg = settings.weightUnit === 'kg'
  function showNotif(msg, type = 'ok') {
    setNotif(msg); setNotifType(type)
    setTimeout(() => setNotif(null), 3000)
  }
  function updateSettings(patch) {
    const next = { ...settings, ...patch }; setSettings(next); saveSettings(next)
  }
  function inputToKg(val) {
    const n = parseFloat(val); if (isNaN(n)) return null
    return isKg ? n : toKg(n)
  }
  function kgToDisplay(kg) {
    if (!kg && kg !== 0) return ''
    return isKg ? kg : toLbs(kg)
  }

  const weightKg  = inputToKg(weightInput)
  const dose      = weightKg ? calcDose(weightKg, medication, meds) : null
  const activeMed = meds.find(m => m.name === medication)

  const knownAnimals = useMemo(() => {
    const map = {}
    log.forEach(e => { map[e.animalName] = e.weight_kg })
    animals.forEach(a => { if (!(a.name in map)) map[a.name] = null })
    return map
  }, [log, animals])

  const suggestions = useMemo(() => {
    if (!animalName.trim() || nameLocked) return []
    return Object.keys(knownAnimals).filter(n => n.toLowerCase().includes(animalName.toLowerCase()))
  }, [animalName, knownAnimals, nameLocked])

  useEffect(() => {
    if (!nameLocked && animalName.trim()) {
      const kg = knownAnimals[animalName.trim()]
      if (kg != null) setWeightInput(String(kgToDisplay(kg)))
    }
  }, [animalName, isKg])

  const animalHistory = useMemo(() => {
    const map = {}
    log.forEach(e => {
      if (!map[e.animalName]) map[e.animalName] = []
      map[e.animalName].push(e)
    })
    return map
  }, [log])

  const animalProfiles = useMemo(() => {
    const names = new Set([...Object.keys(animalHistory), ...animals.map(a => a.name)])
    return Array.from(names).sort().map(name => {
      const profile = animals.find(a => a.name === name) || {}
      const history = animalHistory[name] || []
      return { name, photo_url: profile.photo_url || null, notes: profile.notes || '', id: profile.id, history }
    })
  }, [animalHistory, animals])

  // ── Calculator ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!animalName.trim() || !weightKg || !dose) { showNotif('⚠ Please fill in all fields.', 'warn'); return }
    const entry = {
      id: Date.now(), timestamp: new Date().toLocaleString(),
      animalName: animalName.trim(), weight_kg: weightKg,
      weight_lbs: toLbs(weightKg), medication, dose: parseFloat(dose), notes: '',
    }
    const saved = await addTreatment(entry, useSupabase)
    // Ensure animal exists
    if (!animals.find(a => a.name === entry.animalName)) {
      await upsertAnimal({ name: entry.animalName }, useSupabase)
      setAnimals(prev => [...prev, { name: entry.animalName, photo_url: null, notes: '' }])
    }
    // Also log the weight
    await addWeightLog({ animal_name: entry.animalName, weight_kg: weightKg }, useSupabase)
    setLog(prev => [saved, ...prev])
    showNotif(`✓ ${saved.animalName} · ${saved.medication.split(' ')[0]} · ${saved.dose} mL`)
    setNameLocked(true); setWeightLocked(true)
  }

  function handleClearLock() {
    setAnimalName(''); setWeightInput('')
    setNameLocked(false); setWeightLocked(false)
  }

  // ── Log standalone weight ────────────────────────────────────────────────────
  async function handleLogWeight(animalName) {
    const kg = inputToKg(logWeightInput)
    if (!kg || kg <= 0) { showNotif('⚠ Enter a valid weight.', 'warn'); return }
    const recorded_at = logWeightDate ? new Date(logWeightDate).toISOString() : new Date().toISOString()
    const saved = await addWeightLog({ animal_name: animalName, weight_kg: kg, recorded_at }, useSupabase)
    setAnimalWeightLogs(prev => [...prev, saved].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)))
    setLogWeightInput(''); setLogWeightDate('')
    showNotif(`✓ Weight logged: ${kg} kg`)
  }

  async function handleDeleteWeightLog(id) {
    await deleteWeightLog(id, useSupabase)
    setAnimalWeightLogs(prev => prev.filter(r => r.id !== id))
  }

  // ── Medications ───────────────────────────────────────────────────────────────
  async function handleAddMed() {
    const name = newMedName.trim(); const factor = parseFloat(newMedFactor)
    if (!name || isNaN(factor) || factor <= 0) { showNotif('⚠ Enter a valid name and factor.', 'warn'); return }
    if (meds.find(m => m.name.toLowerCase() === name.toLowerCase())) { showNotif('⚠ Already exists.', 'warn'); return }
    const med = { name, factor, concentration: newMedConc.trim(), indication: newMedIndic.trim() }
    const saved = await addMed(med, useSupabase)
    const updated = [...meds, saved]; setMeds(updated); saveMeds(updated, false)
    setNewMedName(''); setNewMedFactor(''); setNewMedConc(''); setNewMedIndic('')
    showNotif(`✓ Added ${name}`)
  }

  function handleEditMed(idx) {
    setEditingMed(idx); setNewMedName(meds[idx].name); setNewMedFactor(String(meds[idx].factor))
    setNewMedConc(meds[idx].concentration || ''); setNewMedIndic(meds[idx].indication || '')
  }

  async function handleSaveEdit() {
    const name = newMedName.trim(); const factor = parseFloat(newMedFactor)
    if (!name || isNaN(factor) || factor <= 0) { showNotif('⚠ Enter valid values.', 'warn'); return }
    const updated = meds.map((m, i) => i === editingMed ? { ...m, name, factor, concentration: newMedConc.trim(), indication: newMedIndic.trim() } : m)
    await updateMed(updated[editingMed], useSupabase); setMeds(updated); saveMeds(updated, false)
    setEditingMed(null); setNewMedName(''); setNewMedFactor(''); setNewMedConc(''); setNewMedIndic('')
    showNotif('✓ Updated')
  }

  async function handleDeleteMed(idx) {
    await deleteMed(meds[idx], useSupabase)
    const updated = meds.filter((_, i) => i !== idx); setMeds(updated); saveMeds(updated, false)
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const text = await file.text(); const parsed = parseMedCSV(text)
      const existing = new Set(meds.map(m => m.name.toLowerCase()))
      const fresh = parsed.filter(m => !existing.has(m.name.toLowerCase()))
      if (!fresh.length) { showNotif('No new medications found.', 'warn'); return }
      const updated = [...meds, ...fresh]; setMeds(updated); await saveMeds(updated, useSupabase)
      showNotif(`✓ Imported ${fresh.length} medication${fresh.length !== 1 ? 's' : ''}`)
    } catch { showNotif('✗ CSV parse failed.', 'err') }
    e.target.value = ''
  }

  // ── Photos ────────────────────────────────────────────────────────────────────
  async function handlePhotoUpload(e, name) {
    const file = e.target.files[0]; if (!file) return
    setPhotoUploading(true)
    const url = await uploadAnimalPhoto(name, file)
    if (url) {
      await upsertAnimal({ name, photo_url: url }, useSupabase)
      setAnimals(prev => prev.map(a => a.name === name ? { ...a, photo_url: url } : a))
      if (selectedAnimal?.name === name) setSelectedAnimal(prev => ({ ...prev, photo_url: url }))
      showNotif('✓ Photo updated')
    } else { showNotif('✗ Upload failed — check Supabase Storage bucket.', 'err') }
    setPhotoUploading(false); e.target.value = ''
  }

  // ── Import/Export ─────────────────────────────────────────────────────────────
  async function handleImportJSON(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const { treatments, medications, animals: imp, weightLogs } = await importJSON(file, useSupabase)
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

  // ── Chart data ────────────────────────────────────────────────────────────────
  const medCounts = useMemo(() => {
    const c = {}; meds.forEach(m => { c[m.name] = 0 })
    log.forEach(e => { c[e.medication] = (c[e.medication] || 0) + 1 })
    return c
  }, [log, meds])
  const maxCount = Math.max(...Object.values(medCounts), 1)

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f4f0eb', fontFamily:'DM Sans,sans-serif', color:'#3d6b52', fontSize:'18px', fontWeight:700 }}>
      🐾 Loading...
    </div>
  )

  // ── Animal Profile ────────────────────────────────────────────────────────────
  if (selectedAnimal) {
    const profile = animalProfiles.find(a => a.name === selectedAnimal.name) || selectedAnimal
    const history = profile.history || []
    const lastTreatment = history[0]
    const lastWeight = animalWeightLogs.length ? animalWeightLogs[animalWeightLogs.length - 1] : null

    return (
      <div style={S.root}>
        <style>{css}</style>
        {notif && <div style={{ ...S.notif, background: notifType==='err'?'#7a2020':notifType==='warn'?'#6b5a20':'#2a3d30' }}>{notif}</div>}

        <header style={S.header}>
          <button onClick={() => { setSelectedAnimal(null); setAnimalWeightLogs([]) }} style={S.backBtn}>← Back</button>
          <div style={S.logo}>🐱</div>
          <div>
            <div style={S.title}>{profile.name}</div>
            <div style={S.subtitle}>
              {lastWeight ? `${isKg ? lastWeight.weight_kg+' kg' : lastWeight.weight_lbs+' lbs'}` : 'No weight recorded'}
              {' · '}{history.length} treatment{history.length!==1?'s':''}
            </div>
          </div>
          <button onClick={() => {
            setAnimalName(profile.name)
            if (lastWeight) setWeightInput(String(isKg ? lastWeight.weight_kg : lastWeight.weight_lbs))
            else if (lastTreatment) setWeightInput(String(isKg ? lastTreatment.weight_kg : lastTreatment.weight_lbs))
            setNameLocked(true); setWeightLocked(true)
            setSelectedAnimal(null); setAnimalWeightLogs([]); setTab('calculator')
          }} style={{ ...S.editBtn, marginLeft:'auto' }}>+ Treat</button>
        </header>

        <main style={S.main}>

          {/* Photo + notes */}
          <div style={{ ...S.card, display:'flex', gap:'16px', alignItems:'flex-start' }}>
            <div style={S.photoContainer}>
              {profile.photo_url
                ? <img src={profile.photo_url} alt={profile.name} style={S.photo} />
                : <div style={S.photoPlaceholder}>🐱</div>
              }
              <input type="file" accept="image/*" ref={photoRef} onChange={e => handlePhotoUpload(e, profile.name)} style={{ display:'none' }} />
              <button style={S.photoBtn} onClick={() => photoRef.current.click()} disabled={photoUploading}>
                {photoUploading ? '⏳' : profile.photo_url ? '📷 Change' : '📷 Add Photo'}
              </button>
              {!useSupabase && <div style={{ fontSize:'10px', color:'#c47c7c', marginTop:'4px', textAlign:'center' }}>Needs Supabase</div>}
            </div>
            <div style={{ flex:1 }}>
              <div style={S.fieldLabel}>Notes</div>
              <textarea style={{ ...S.input, minHeight:'70px', resize:'vertical', fontSize:'13px' }}
                placeholder="Notes about this animal..."
                value={editingAnimal?.name === profile.name ? editingAnimal.notes : profile.notes}
                onChange={e => setEditingAnimal({ name: profile.name, notes: e.target.value })}
                onBlur={async () => {
                  if (editingAnimal?.name === profile.name) {
                    await upsertAnimal({ name: profile.name, notes: editingAnimal.notes, photo_url: profile.photo_url }, useSupabase)
                    setAnimals(prev => prev.map(a => a.name === profile.name ? { ...a, notes: editingAnimal.notes } : a))
                    setEditingAnimal(null)
                  }
                }} />
              {lastWeight && (
                <div style={{ marginTop:'10px', display:'flex', gap:'10px' }}>
                  <div style={S.miniStat}><div style={S.miniStatNum}>{lastWeight.weight_kg} kg</div><div style={S.miniStatLabel}>Current</div></div>
                  <div style={S.miniStat}><div style={S.miniStatNum}>{lastWeight.weight_lbs} lbs</div><div style={S.miniStatLabel}>In lbs</div></div>
                  <div style={S.miniStat}><div style={S.miniStatNum}>{animalWeightLogs.length}</div><div style={S.miniStatLabel}>Weigh-ins</div></div>
                </div>
              )}
            </div>
          </div>

          {/* Weight chart */}
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <h3 style={{ ...S.cardTitle, margin:0 }}>Weight Over Time</h3>
              <span style={{ fontSize:'12px', color:'#9a8a7a' }}>{isKg ? 'kg' : 'lbs'}</span>
            </div>
            {animalWeightLogs.length >= 2
              ? <WeightChart entries={animalWeightLogs} isKg={isKg} range={weightRange} onRangeChange={setWeightRange} />
              : <p style={{ ...S.cardDesc, margin:0 }}>
                  {animalWeightLogs.length === 1
                    ? `One weigh-in recorded (${animalWeightLogs[0].weight_kg} kg). Log at least one more to see the chart.`
                    : 'No weight data yet. Log a weight below or save a treatment.'}
                </p>
            }
          </div>

          {/* Log weight */}
          <div style={S.card}>
            <h3 style={S.cardTitle}>Log Weight</h3>
            <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <div style={S.fieldLabel}>Weight ({isKg ? 'kg' : 'lbs'})</div>
                <input style={S.input} type="number" step="0.01"
                  placeholder={isKg ? '4.20' : '9.3'}
                  value={logWeightInput} onChange={e => setLogWeightInput(e.target.value)} />
              </div>
              <div style={{ flex:1 }}>
                <div style={S.fieldLabel}>Date (optional)</div>
                <input style={S.input} type="date" value={logWeightDate}
                  onChange={e => setLogWeightDate(e.target.value)} />
              </div>
              <button style={{ ...S.saveBtn, flex:'0 0 auto', width:'auto', padding:'10px 18px', fontSize:'13px' }}
                onClick={() => handleLogWeight(profile.name)} className="save-btn">
                Log
              </button>
            </div>
          </div>

          {/* Weight log table */}
          {animalWeightLogs.length > 0 && (
            <div style={S.card}>
              <h3 style={{ ...S.cardTitle, marginBottom:'10px' }}>All Weigh-ins</h3>
              <div style={{ overflowX:'auto' }}>
                <table style={S.table}>
                  <thead><tr>
                    {['Date','kg','lbs',''].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[...animalWeightLogs].reverse().map(e => (
                      <tr key={e.id} style={S.tr}>
                        <td style={S.td}>{e.label}</td>
                        <td style={{ ...S.td, fontWeight:600 }}>{e.weight_kg}</td>
                        <td style={S.td}>{e.weight_lbs}</td>
                        <td style={S.td}>
                          <button onClick={() => handleDeleteWeightLog(e.id)}
                            style={{ ...S.actionBtnRed, padding:'2px 7px', fontSize:'11px' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Treatment history */}
          <div style={S.card}>
            <h3 style={S.cardTitle}>Treatment History</h3>
            {history.length === 0 && <p style={S.cardDesc}>No treatments recorded.</p>}
            {history.length > 0 && (
              <div style={{ overflowX:'auto' }}>
                <table style={S.table}>
                  <thead><tr>
                    {['Date', isKg?'kg':'lbs', 'Medication','Dose (mL)'].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {history.map(e => (
                      <tr key={e.id} style={S.tr}>
                        <td style={S.td}>{e.timestamp}</td>
                        <td style={S.td}>{isKg ? e.weight_kg : e.weight_lbs}</td>
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
            )}
          </div>

        </main>
      </div>
    )
  }

  // ── Main App ──────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{css}</style>
      {notif && <div style={{ ...S.notif, background: notifType==='err'?'#7a2020':notifType==='warn'?'#6b5a20':'#2a3d30' }}>{notif}</div>}

      <header style={S.header}>
        <div style={S.logo}>🐾</div>
        <div>
          <div style={S.title}>Vet Dosage Tracker</div>
          <div style={S.subtitle}>Medication Calculator & Treatment Log</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ ...S.dbPill, background: dbStatus==='connected'?'#1a4a2e':'#3a2e1a' }}>
            <div style={{ ...S.dbDot, background: dbStatus==='connected'?'#4ade80':'#fbbf24' }} />
            {dbStatus === 'connected' ? 'Supabase' : 'Local'}
          </div>
          <div style={S.logBadge}>{log.length}</div>
        </div>
      </header>

      <div style={S.tabBar}>
        {[['calculator','💊','Calc'],['animals','🐱','Animals'],['log','📋','Log'],['dashboard','📊','Stats'],['meds','⚗️','Meds'],['settings','⚙️','Settings']].map(([t,icon,label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...S.tabBtn, ...(tab===t ? S.tabBtnActive : {}) }}>
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
              {nameLocked ? `Locked on ${animalName} — change med and save again.` : 'Type a name to auto-fill last weight.'}
            </p>

            <div style={{ position:'relative', marginBottom:'14px' }}>
              <div style={S.fieldLabel}>Animal Name</div>
              <input style={{ ...S.input, ...(nameLocked ? S.inputLocked : {}) }}
                placeholder="e.g. Mochi" value={animalName} readOnly={nameLocked}
                onChange={e => { setAnimalName(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
              {showSuggestions && suggestions.length > 0 && (
                <div style={S.dropdown}>
                  {suggestions.map(n => (
                    <div key={n} style={S.dropdownItem} onMouseDown={() => {
                      const kg = knownAnimals[n]; setAnimalName(n)
                      if (kg) setWeightInput(String(isKg ? kg : toLbs(kg)))
                      setShowSuggestions(false)
                    }}>
                      <span style={{ fontWeight:600 }}>🐱 {n}</span>
                      {knownAnimals[n] && <span style={{ color:'#9a8a7a', fontSize:'12px' }}>{isKg ? knownAnimals[n]+' kg' : toLbs(knownAnimals[n])+' lbs'}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom:'14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                <div style={S.fieldLabel}>Body Weight ({isKg ? 'kg' : 'lbs'})</div>
                {weightLocked && <button onClick={() => setWeightLocked(false)} style={S.editBtn}>✎ Edit</button>}
                {weightInput && weightKg && (
                  <div style={{ marginLeft:'auto', fontSize:'11px', color:'#9a8a7a' }}>
                    = {isKg ? `${toLbs(weightKg)} lbs` : `${weightKg} kg`}
                  </div>
                )}
              </div>
              <input style={{ ...S.input, ...(weightLocked ? S.inputLocked : {}) }}
                type="number" step="0.01" placeholder={isKg ? 'e.g. 4.2' : 'e.g. 9.3'}
                value={weightInput} readOnly={weightLocked}
                onChange={e => setWeightInput(e.target.value)} />
            </div>

            <div style={{ marginBottom:'20px' }}>
              <div style={S.fieldLabel}>Medication</div>
              <select style={S.select} value={medication} onChange={e => setMedication(e.target.value)}>
                {meds.map(m => <option key={m.name} value={m.name}>{m.name}{m.indication ? ` — ${m.indication}` : ''}</option>)}
              </select>
              {activeMed?.indication && (
                <div style={{ fontSize:'11px', color:'#9a8a7a', marginTop:'5px' }}>
                  {activeMed.concentration && <span style={{ marginRight:'10px' }}>💊 {activeMed.concentration}</span>}
                  <span>🎯 {activeMed.indication}</span>
                </div>
              )}
            </div>

            <div style={S.doseBox}>
              <div style={S.doseLabel}>Calculated Dose</div>
              <div style={S.doseValue}>{dose ? `${dose} mL` : '—'}</div>
              {dose && activeMed && (
                <div style={S.doseFormula}>
                  {weightInput} {isKg?'kg':'lbs'} {!isKg && `(${weightKg} kg)`} × {activeMed.factor} = {dose} mL
                </div>
              )}
            </div>

            <button style={S.saveBtn} onClick={handleSave} className="save-btn">
              {nameLocked ? `Save (${animalName} · ${medication.split(' ')[0]}) →` : 'Save to Treatment Log →'}
            </button>
          </div>
        )}

        {/* ── ANIMALS ── */}
        {tab === 'animals' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Animals</h2>
              <p style={S.cardDesc}>{animalProfiles.length === 0 ? 'No animals yet — save a treatment to add one.' : `${animalProfiles.length} animal${animalProfiles.length!==1?'s':''} tracked.`}</p>
            </div>
            <div style={S.animalGrid}>
              {animalProfiles.map(profile => {
                const last = profile.history[0]
                return (
                  <div key={profile.name} style={{ ...S.animalCard, cursor:'pointer' }}
                    onClick={() => { setSelectedAnimal(profile); setWeightRange('all') }}
                    className="animal-card">
                    <div style={S.animalCardPhoto}>
                      {profile.photo_url
                        ? <img src={profile.photo_url} alt={profile.name} style={S.animalThumb} />
                        : <div style={S.animalThumbPlaceholder}>🐱</div>
                      }
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={S.animalName}>{profile.name}</div>
                      <div style={S.animalMeta}>
                        {last ? (isKg ? `${last.weight_kg} kg` : `${last.weight_lbs} lbs`) : 'No weight'}
                        {' · '}{profile.history.length} treatment{profile.history.length!==1?'s':''}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'6px' }}>
                        {[...new Set(profile.history.slice(0,3).map(e => e.medication))].map(med => (
                          <span key={med} style={{ ...S.medTag, background:getMedColor(meds,med)+'22', color:getMedColor(meds,med), borderColor:getMedColor(meds,med)+'55', fontSize:'10px' }}>
                            {med.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ color:'#ccc', fontSize:'18px', alignSelf:'center' }}>›</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── LOG ── */}
        {tab === 'log' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Treatment Log</h2>
              <p style={S.cardDesc}>{log.length === 0 ? 'No treatments recorded yet.' : `${log.length} treatment${log.length!==1?'s':''} · ${animalProfiles.length} animal${animalProfiles.length!==1?'s':''}`}</p>
            </div>
            {log.length > 0 && (
              <div style={S.card}>
                <div style={{ overflowX:'auto' }}>
                  <table style={S.table}>
                    <thead><tr>
                      {['Timestamp','Animal',isKg?'kg':'lbs','Medication','Dose (mL)'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {log.map(e => (
                        <tr key={e.id} style={{ ...S.tr, cursor:'pointer' }}
                          onClick={() => { setSelectedAnimal({ name: e.animalName }); setWeightRange('all') }}
                          className="log-row">
                          <td style={S.td}>{e.timestamp}</td>
                          <td style={{ ...S.td, fontWeight:600 }}>{e.animalName}</td>
                          <td style={S.td}>{isKg ? e.weight_kg : e.weight_lbs}</td>
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
              {[[log.length,'Treatments'],[animalProfiles.length,'Animals'],[meds.length,'Medications']].map(([n,l]) => (
                <div key={l} style={S.statCard}><div style={S.statNum}>{n}</div><div style={S.statLabel}>{l}</div></div>
              ))}
            </div>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Treatments by Medication</h3>
              {log.length === 0 && <p style={S.cardDesc}>No data yet.</p>}
              <div style={S.chartArea}>
                {meds.filter(m => (medCounts[m.name]||0) > 0).map(m => (
                  <div key={m.name} style={S.barRow}>
                    <div style={S.barLabel}>{m.name}</div>
                    <div style={S.barTrack}>
                      <div style={{ ...S.barFill, width:`${((medCounts[m.name]||0)/maxCount)*100}%`, background:getMedColor(meds,m.name) }} className="bar-fill" />
                    </div>
                    <div style={S.barCount}>{medCounts[m.name]||0}</div>
                  </div>
                ))}
                {log.length === 0 && meds.slice(0,5).map(m => (
                  <div key={m.name} style={S.barRow}>
                    <div style={S.barLabel}>{m.name}</div>
                    <div style={S.barTrack}><div style={{ ...S.barFill, width:'4%', background:getMedColor(meds,m.name), opacity:0.2 }} /></div>
                    <div style={S.barCount}>0</div>
                  </div>
                ))}
              </div>
            </div>
            {log.length > 0 && (
              <div style={S.card}>
                <h3 style={S.cardTitle}>Recent Activity</h3>
                {log.slice(0,6).map(e => (
                  <div key={e.id} style={{ ...S.activityRow, cursor:'pointer' }}
                    onClick={() => { setSelectedAnimal({ name: e.animalName }); setWeightRange('all') }}>
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
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
                <h2 style={{ ...S.cardTitle, margin:0 }}>Medications</h2>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input type="file" accept=".csv" ref={csvImportRef} onChange={handleCSVImport} style={{ display:'none' }} />
                  <button style={S.editBtn} onClick={() => csvImportRef.current.click()}>⬆ Import CSV</button>
                </div>
              </div>
              <p style={S.cardDesc}>All factors are mL per kg body weight.</p>
              <div style={S.medList}>
                {meds.map((m, i) => (
                  <div key={m.name+i} style={S.medRow}>
                    {editingMed === i ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:'8px', width:'100%' }}>
                        <div style={{ display:'flex', gap:'8px' }}>
                          <input style={{ ...S.input, flex:2, fontSize:'13px', padding:'7px 10px' }} value={newMedName} onChange={e => setNewMedName(e.target.value)} />
                          <input style={{ ...S.input, flex:'0 0 80px', fontSize:'13px', padding:'7px 10px' }} type="number" step="0.0001" value={newMedFactor} onChange={e => setNewMedFactor(e.target.value)} />
                        </div>
                        <div style={{ display:'flex', gap:'8px' }}>
                          <input style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} placeholder="Concentration" value={newMedConc} onChange={e => setNewMedConc(e.target.value)} />
                          <input style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} placeholder="Indication" value={newMedIndic} onChange={e => setNewMedIndic(e.target.value)} />
                        </div>
                        <div style={{ display:'flex', gap:'8px' }}>
                          <button style={S.actionBtnGreen} onClick={handleSaveEdit}>Save</button>
                          <button style={S.actionBtnGhost} onClick={() => { setEditingMed(null); setNewMedName(''); setNewMedFactor(''); setNewMedConc(''); setNewMedIndic('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:'13px' }}>{m.name}</div>
                          <div style={{ fontSize:'11px', color:'#9a8a7a', marginTop:'2px' }}>
                            ×{m.factor} mL/kg
                            {m.concentration && <span style={{ margin:'0 6px' }}>· {m.concentration}</span>}
                            {m.indication && <span style={{ color:'#7a9a87' }}>· {m.indication}</span>}
                          </div>
                        </div>
                        <div style={{ ...S.medTag, background:getMedColor(meds,m.name)+'22', color:getMedColor(meds,m.name), borderColor:getMedColor(meds,m.name)+'55', fontSize:'11px', flexShrink:0 }}>
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
              <h3 style={S.cardTitle}>Add Medication</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <div style={{ display:'flex', gap:'10px' }}>
                  <div style={{ flex:2 }}>
                    <div style={S.fieldLabel}>Name</div>
                    <input style={S.input} placeholder="e.g. Ponazuril 15%" value={newMedName} onChange={e => setNewMedName(e.target.value)} />
                  </div>
                  <div style={{ flex:'0 0 110px' }}>
                    <div style={S.fieldLabel}>Factor (mL/kg)</div>
                    <input style={S.input} type="number" step="0.0001" placeholder="0.0000" value={newMedFactor} onChange={e => setNewMedFactor(e.target.value)} />
                  </div>
                </div>
                <div style={{ display:'flex', gap:'10px' }}>
                  <div style={{ flex:1 }}>
                    <div style={S.fieldLabel}>Concentration</div>
                    <input style={S.input} placeholder="e.g. 100 mg/mL" value={newMedConc} onChange={e => setNewMedConc(e.target.value)} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={S.fieldLabel}>Indication</div>
                    <input style={S.input} placeholder="e.g. Coccidia" value={newMedIndic} onChange={e => setNewMedIndic(e.target.value)} />
                  </div>
                </div>
                {newMedFactor && !isNaN(parseFloat(newMedFactor)) && parseFloat(newMedFactor) > 0 && (
                  <div style={{ fontSize:'12px', color:'#7a6a5a' }}>
                    Example: 4 kg cat → {(4 * parseFloat(newMedFactor)).toFixed(2)} mL
                  </div>
                )}
                <button style={S.saveBtn} onClick={handleAddMed} className="save-btn">Add Medication</button>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Settings</h2>
              <p style={S.cardDesc}>App-wide preferences, stored locally.</p>
              <div style={S.settingRow}>
                <div>
                  <div style={{ fontWeight:600, fontSize:'14px' }}>Weight Unit</div>
                  <div style={{ fontSize:'12px', color:'#9a8a7a', marginTop:'2px' }}>Default is kg. Calculations always use kg internally.</div>
                </div>
                <div style={S.toggle}>
                  <button style={{ ...S.toggleBtn, ...(isKg ? S.toggleBtnActive : {}) }} onClick={() => updateSettings({ weightUnit:'kg' })}>kg</button>
                  <button style={{ ...S.toggleBtn, ...(!isKg ? S.toggleBtnActive : {}) }} onClick={() => updateSettings({ weightUnit:'lbs' })}>lbs</button>
                </div>
              </div>
              <div style={{ ...S.settingRow, borderBottom:'none' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:'14px' }}>Storage</div>
                  <div style={{ fontSize:'12px', color: dbStatus==='connected'?'#4ade80':'#fbbf24', marginTop:'2px' }}>
                    {dbStatus === 'connected' ? '🟢 Connected to Supabase' : '🟡 Using localStorage (this device only)'}
                  </div>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Export Data</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <button style={S.exportBtn} onClick={() => exportJSON(log, meds, animals, [])} className="export-btn">
                  ⬇ Export as JSON
                  <span style={S.exportSub}>Full backup — treatments, medications, animals</span>
                </button>
                <button style={S.exportBtn} onClick={() => exportCSV(log)} className="export-btn">
                  ⬇ Export as CSV
                  <span style={S.exportSub}>Treatments only — open in Excel or Sheets</span>
                </button>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Import Data</h3>
              <p style={S.cardDesc}>Import a previously exported JSON backup. Duplicates skipped.</p>
              <input type="file" accept=".json" ref={importRef} onChange={handleImportJSON} style={{ display:'none' }} />
              <button style={{ ...S.saveBtn, background:'#4a6b8a' }} onClick={() => importRef.current.click()} className="save-btn">
                ⬆ Import JSON Backup
              </button>
            </div>
            {dbStatus === 'local' && (
              <div style={{ ...S.card, borderColor:'#c8a84a', background:'#fdf8ed' }}>
                <h3 style={{ ...S.cardTitle, color:'#7a5a10' }}>💡 Move to Cloud</h3>
                <p style={{ fontSize:'13px', color:'#7a5a10', margin:0, lineHeight:'1.5' }}>
                  Storing locally on this device only. Ensure Supabase env vars are set in Vercel and redeploy, then use Import above.
                </p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily:"'DM Sans','Nunito',sans-serif", background:'#f4f0eb', minHeight:'100vh', color:'#2a2018' },
  header: { background:'#2a3d30', color:'#e8f0e9', padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px' },
  logo: { fontSize:'22px' }, title: { fontSize:'16px', fontWeight:700, letterSpacing:'-0.3px' },
  subtitle: { fontSize:'11px', opacity:0.6, marginTop:'1px' },
  backBtn: { background:'transparent', border:'none', color:'#e8f0e9', fontSize:'14px', fontWeight:600, cursor:'pointer', padding:'4px 8px', borderRadius:'6px', marginRight:'4px' },
  dbPill: { display:'flex', alignItems:'center', gap:'5px', borderRadius:'20px', padding:'3px 9px', fontSize:'11px', fontWeight:600, color:'#c8e6d0' },
  dbDot: { width:'6px', height:'6px', borderRadius:'50%' },
  logBadge: { background:'#3d6b52', color:'#c8e6d0', borderRadius:'20px', padding:'3px 9px', fontSize:'11px', fontWeight:600 },
  tabBar: { display:'flex', background:'#e8e2d9', borderBottom:'2px solid #d5ccc0', overflowX:'auto' },
  tabBtn: { flex:1, minWidth:'55px', padding:'10px 4px', border:'none', background:'transparent', cursor:'pointer', fontSize:'11px', fontWeight:600, color:'#7a6a5a', transition:'all 0.15s', borderBottom:'3px solid transparent', marginBottom:'-2px', whiteSpace:'nowrap' },
  tabBtnActive: { color:'#2a3d30', borderBottomColor:'#3d6b52', background:'#f4f0eb' },
  main: { padding:'12px', maxWidth:'700px', margin:'0 auto' },
  card: { background:'#fff', borderRadius:'14px', padding:'16px', marginBottom:'12px', boxShadow:'0 2px 12px rgba(42,32,24,0.07)', border:'1px solid #ede6dd' },
  cardTitle: { fontSize:'16px', fontWeight:700, margin:'0 0 5px', color:'#1e2d22' },
  cardDesc: { fontSize:'13px', color:'#7a6a5a', margin:'0 0 14px' },
  fieldLabel: { fontSize:'11px', fontWeight:700, color:'#5a4a3a', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' },
  input: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid #d5ccc0', fontSize:'15px', background:'#faf8f5', outline:'none', color:'#2a2018', fontFamily:'inherit', boxSizing:'border-box' },
  inputLocked: { background:'#f0ebe2', color:'#5a4a3a', borderColor:'#c8bfb0' },
  select: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid #d5ccc0', fontSize:'13px', background:'#faf8f5', outline:'none', color:'#2a2018', fontFamily:'inherit', cursor:'pointer' },
  doseBox: { background:'linear-gradient(135deg,#2a3d30 0%,#3d6b52 100%)', borderRadius:'12px', padding:'16px', textAlign:'center', marginBottom:'14px', color:'#e8f5ec' },
  doseLabel: { fontSize:'11px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', opacity:0.7 },
  doseValue: { fontSize:'36px', fontWeight:800, letterSpacing:'-1px', margin:'6px 0 3px' },
  doseFormula: { fontSize:'11px', opacity:0.6 },
  saveBtn: { width:'100%', padding:'13px', borderRadius:'10px', border:'none', background:'#3d6b52', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer', transition:'background 0.15s,transform 0.1s' },
  clearBtn: { padding:'5px 12px', borderRadius:'20px', border:'1.5px solid #d5ccc0', background:'#faf8f5', color:'#7a6a5a', fontSize:'12px', fontWeight:600, cursor:'pointer' },
  editBtn: { padding:'4px 10px', borderRadius:'20px', border:'1.5px solid #b8d4c0', background:'#eef6f1', color:'#3d6b52', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  notif: { position:'fixed', top:'14px', left:'50%', transform:'translateX(-50%)', color:'#e8f5ec', padding:'10px 20px', borderRadius:'30px', fontSize:'13px', fontWeight:600, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', whiteSpace:'nowrap', maxWidth:'92vw', overflow:'hidden', textOverflow:'ellipsis' },
  dropdown: { position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1.5px solid #d5ccc0', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)', zIndex:100 },
  dropdownItem: { padding:'10px 14px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'14px', borderBottom:'1px solid #f0ebe4' },
  animalGrid: { display:'flex', flexDirection:'column', gap:'10px' },
  animalCard: { background:'#fff', borderRadius:'14px', padding:'14px', border:'1px solid #ede6dd', boxShadow:'0 2px 8px rgba(42,32,24,0.06)', display:'flex', alignItems:'center', gap:'14px' },
  animalCardPhoto: { flexShrink:0 },
  animalThumb: { width:'56px', height:'56px', borderRadius:'12px', objectFit:'cover' },
  animalThumbPlaceholder: { width:'56px', height:'56px', borderRadius:'12px', background:'#f0ebe4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px' },
  animalName: { fontSize:'15px', fontWeight:700, marginBottom:'3px' },
  animalMeta: { fontSize:'12px', color:'#9a8a7a' },
  medTag: { padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:700, border:'1px solid', whiteSpace:'nowrap' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'13px' },
  th: { textAlign:'left', padding:'8px 10px', color:'#7a6a5a', fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #ede6dd' },
  tr: { borderBottom:'1px solid #f0ebe4' },
  td: { padding:'9px 10px', color:'#2a2018' },
  statsRow: { display:'flex', gap:'10px', marginBottom:'12px' },
  statCard: { flex:1, background:'#fff', borderRadius:'12px', padding:'12px', textAlign:'center', border:'1px solid #ede6dd', boxShadow:'0 2px 8px rgba(42,32,24,0.06)' },
  statNum: { fontSize:'24px', fontWeight:800, color:'#2a3d30' },
  statLabel: { fontSize:'11px', color:'#9a8a7a', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginTop:'3px' },
  chartArea: { display:'flex', flexDirection:'column', gap:'10px', marginTop:'12px' },
  barRow: { display:'flex', alignItems:'center', gap:'8px' },
  barLabel: { fontSize:'11px', fontWeight:600, color:'#5a4a3a', width:'160px', flexShrink:0 },
  barTrack: { flex:1, height:'16px', background:'#f0ebe4', borderRadius:'10px', overflow:'hidden' },
  barFill: { height:'100%', borderRadius:'10px', minWidth:'3px' },
  barCount: { fontSize:'13px', fontWeight:700, width:'22px', textAlign:'right', color:'#3d6b52' },
  activityRow: { display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom:'1px solid #f0ebe4', fontSize:'13px' },
  activityDot: { width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 },
  activityTime: { marginLeft:'auto', fontSize:'11px', color:'#bbb', whiteSpace:'nowrap' },
  medList: { display:'flex', flexDirection:'column', gap:'7px', marginBottom:'4px' },
  medRow: { display:'flex', alignItems:'center', gap:'7px', padding:'10px 12px', background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd' },
  actionBtnGhost: { padding:'5px 9px', borderRadius:'7px', border:'1.5px solid #d5ccc0', background:'transparent', color:'#7a6a5a', fontSize:'12px', fontWeight:600, cursor:'pointer', flexShrink:0 },
  actionBtnGreen: { padding:'5px 9px', borderRadius:'7px', border:'1.5px solid #3d6b52', background:'#eef6f1', color:'#3d6b52', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  actionBtnRed: { padding:'5px 9px', borderRadius:'7px', border:'1.5px solid #e0b0b0', background:'#fdf0f0', color:'#b05050', fontSize:'12px', fontWeight:700, cursor:'pointer', flexShrink:0 },
  settingRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid #f0ebe4' },
  toggle: { display:'flex', background:'#f0ebe4', borderRadius:'20px', padding:'3px' },
  toggleBtn: { padding:'5px 14px', borderRadius:'17px', border:'none', background:'transparent', fontSize:'13px', fontWeight:600, cursor:'pointer', color:'#7a6a5a', transition:'all 0.15s' },
  toggleBtnActive: { background:'#2a3d30', color:'#e8f5ec' },
  exportBtn: { display:'flex', flexDirection:'column', gap:'3px', width:'100%', padding:'14px 16px', borderRadius:'10px', border:'1.5px solid #d5ccc0', background:'#faf8f5', color:'#2a2018', fontSize:'14px', fontWeight:700, cursor:'pointer', textAlign:'left', transition:'background 0.15s' },
  exportSub: { fontSize:'11px', color:'#9a8a7a', fontWeight:400 },
  photoContainer: { display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', flexShrink:0 },
  photo: { width:'96px', height:'96px', borderRadius:'14px', objectFit:'cover', border:'2px solid #ede6dd' },
  photoPlaceholder: { width:'96px', height:'96px', borderRadius:'14px', background:'#f0ebe4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'44px', border:'2px dashed #d5ccc0' },
  photoBtn: { padding:'5px 10px', borderRadius:'20px', border:'1.5px solid #b8d4c0', background:'#eef6f1', color:'#3d6b52', fontSize:'11px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' },
  miniStat: { background:'#f4f0eb', borderRadius:'8px', padding:'7px 10px', textAlign:'center' },
  miniStatNum: { fontSize:'15px', fontWeight:800, color:'#2a3d30' },
  miniStatLabel: { fontSize:'10px', color:'#9a8a7a', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' },
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; }
  .save-btn:hover { background: #2a5240 !important; transform: translateY(-1px); }
  .save-btn:active { transform: translateY(0px); }
  .export-btn:hover { background: #f0ebe2 !important; }
  .animal-card:hover { border-color: #b8d4c0 !important; box-shadow: 0 4px 16px rgba(42,32,24,0.1) !important; }
  .log-row:hover { background: #faf8f5; }
  input:focus, select:focus, textarea:focus { border-color: #3d6b52 !important; box-shadow: 0 0 0 3px rgba(61,107,82,0.15); }
  .bar-fill { transition: width 0.6s cubic-bezier(.23,1.01,.32,1); }
`
