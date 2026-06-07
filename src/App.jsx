import { useState, useMemo, useRef, useEffect } from 'react'
import {
  checkSupabase, loadMeds, loadTreatments, loadAnimals,
  loadExams, loadLatestExams, saveExam, deleteExam,
  loadMetricDefs, saveMetricDefs, addMetricDef, deleteMetricDef,
  addTreatment, addMed, updateMed, deleteMed, saveMeds,
  upsertAnimal, uploadAnimalPhoto,
  saveTreatmentsLocal, loadSettings, saveSettings,
  exportJSON, exportCSV, importJSON, parseMedCSV,
  toKg, toLbs,
} from './lib/dataService'

const PALETTE = ['#7c9e87','#6b8fa8','#b08a6e','#9b7eb0','#c47c7c','#a89b6b','#6b9ea8','#a86b8a','#7ea87c','#a87c6b','#8a7ca8','#6ba88a']
const getMedColor = (meds, name) => PALETTE[meds.findIndex(m => m.name === name) % PALETTE.length] || '#888'

function calcDose(weightKg, medName, meds) {
  const med = meds.find(m => m.name === medName)
  if (!med || !weightKg || isNaN(weightKg) || parseFloat(weightKg) <= 0) return null
  return (parseFloat(weightKg) * med.factor).toFixed(2)
}

// ─── Metric chart (SVG) ───────────────────────────────────────
function MetricChart({ exams, metricKey, unit, isKg }) {
  const [tooltip, setTooltip] = useState(null)
  const W = 560, H = 160, PAD = { top: 14, right: 14, bottom: 32, left: 44 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top  - PAD.bottom

  const points = useMemo(() => {
    return exams
      .filter(e => e.metrics.some(m => m.metric === metricKey))
      .map(e => {
        const m = e.metrics.find(m => m.metric === metricKey)
        let val = m.value
        // Convert weight display unit
        if (metricKey === 'weight_kg' && !isKg) val = toLbs(val)
        return { val, label: e.label, recorded_at: e.recorded_at }
      })
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
  }, [exams, metricKey, isKg])

  if (points.length < 2) return (
    <div style={{ textAlign:'center', padding:'24px 0', color:'#9a8a7a', fontSize:'13px' }}>
      {points.length === 0 ? `No ${unit} data recorded yet.` : `Need at least 2 data points to show a chart.`}
    </div>
  )

  const vals   = points.map(p => p.val)
  const minVal = Math.min(...vals), maxVal = Math.max(...vals)
  const spread = maxVal - minVal || 0.5
  const padV   = spread * 0.18
  const xOf = i  => PAD.left + (i / Math.max(points.length - 1, 1)) * cW
  const yOf = v  => PAD.top  + cH - ((v - (minVal - padV)) / (spread + padV * 2)) * cH
  const ptCoords = points.map((p, i) => ({ x: xOf(i), y: yOf(p.val), p }))
  const polyline = ptCoords.map(p => `${p.x},${p.y}`).join(' ')
  const tickCount = 3
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (minVal - padV) + ((spread + padV * 2) * i / tickCount)
    return { v: Math.round(v * 10) / 10, y: PAD.top + cH - (i / tickCount) * cH }
  })
  const xLabelIdx = points.length <= 5
    ? points.map((_, i) => i)
    : [0,1,2,3,4].map(i => Math.round(i * (points.length - 1) / 4))

  const displayUnit = metricKey === 'weight_kg' ? (isKg ? 'kg' : 'lbs') : unit

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', overflow:'visible' }}
      onMouseLeave={() => setTooltip(null)}>
      {yTicks.map((t,i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={PAD.left+cW} y2={t.y} stroke="#ede6dd" strokeWidth="1" />
          <text x={PAD.left-5} y={t.y+4} textAnchor="end" fontSize="9" fill="#9a8a7a">{t.v}</text>
        </g>
      ))}
      {xLabelIdx.map(i => (
        <text key={i} x={xOf(i)} y={H-4} textAnchor="middle" fontSize="9" fill="#9a8a7a">
          {points[i]?.label}
        </text>
      ))}
      <polygon
        points={`${PAD.left},${PAD.top+cH} ${polyline} ${PAD.left+cW},${PAD.top+cH}`}
        fill="#3d6b52" fillOpacity="0.07" />
      <polyline points={polyline} fill="none" stroke="#3d6b52" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {ptCoords.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#3d6b52" stroke="#fff" strokeWidth="1.5" />
          <circle cx={p.x} cy={p.y} r="14" fill="transparent" style={{ cursor:'crosshair' }}
            onMouseEnter={() => setTooltip(p)} />
        </g>
      ))}
      {tooltip && (() => {
        const tx = Math.min(Math.max(tooltip.x, PAD.left+32), PAD.left+cW-32)
        const ty = tooltip.y > PAD.top+36 ? tooltip.y-34 : tooltip.y+14
        return (
          <g>
            <rect x={tx-36} y={ty-13} width="72" height="26" rx="6" fill="#2a3d30" opacity="0.92" />
            <text x={tx} y={ty} textAnchor="middle" fontSize="12" fontWeight="700" fill="#e8f5ec">
              {tooltip.p.val} {displayUnit}
            </text>
            <text x={tx} y={ty+11} textAnchor="middle" fontSize="9" fill="#9ac8b0">{tooltip.p.label}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// ─── App ──────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState('calculator')
  const [meds, setMeds]         = useState([])
  const [log, setLog]           = useState([])
  const [animals, setAnimals]   = useState([])
  const [latestExams, setLatestExams] = useState({}) // { animalName: exam }
  const [metricDefs, setMetricDefs]   = useState([])
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
  const [selectedAnimal, setSelectedAnimal]   = useState(null)
  const [animalExams, setAnimalExams]         = useState([])
  const [editingAnimal, setEditingAnimal]     = useState(null)
  const [photoUploading, setPhotoUploading]   = useState(false)
  const [activeChartMetric, setActiveChartMetric] = useState('weight_kg')

  // New exam form
  const [examDate, setExamDate]         = useState('')
  const [examNotes, setExamNotes]       = useState('')
  const [examMetrics, setExamMetrics]   = useState({}) // { key: value }

  // Metric def manager
  const [showMetricForm, setShowMetricForm] = useState(false)
  const [newMetricKey, setNewMetricKey]     = useState('')
  const [newMetricLabel, setNewMetricLabel] = useState('')
  const [newMetricUnit, setNewMetricUnit]   = useState('')
  const [newMetricIsDoseWeight, setNewMetricIsDoseWeight] = useState(false)

  // Med manager
  const [newMedName, setNewMedName]   = useState('')
  const [newMedFactor, setNewMedFactor] = useState('')
  const [newMedConc, setNewMedConc]   = useState('')
  const [newMedIndic, setNewMedIndic] = useState('')
  const [editingMed, setEditingMed]   = useState(null)

  const importRef    = useRef(null)
  const csvImportRef = useRef(null)
  const photoRef     = useRef(null)

  // ── Init ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const sb = await checkSupabase()
      setUseSupabase(sb); setDbStatus(sb ? 'connected' : 'local')
      const [medsData, logData, animalsData, latestExamsData, metricDefsData] = await Promise.all([
        loadMeds(sb), loadTreatments(sb), loadAnimals(sb),
        loadLatestExams(sb), loadMetricDefs(sb),
      ])
      setMeds(medsData); setLog(logData); setAnimals(animalsData)
      setLatestExams(latestExamsData); setMetricDefs(metricDefsData)
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

  // Load exams when opening animal profile
  useEffect(() => {
    if (!selectedAnimal) return
    loadExams(selectedAnimal.name, useSupabase).then(setAnimalExams)
  }, [selectedAnimal])

  // ── Helpers ──────────────────────────────────────────────────
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

  // Dose weight metric key from metricDefs
  const doseWeightMetric = metricDefs.find(d => d.is_dose_weight)?.key || 'weight_kg'

  // Known animals: name → latest weight_kg from latest exam
  const knownAnimals = useMemo(() => {
    const map = {}
    // Prefer exam weight, fall back to latest treatment weight
    Object.entries(latestExams).forEach(([name, exam]) => {
      const wm = exam?.metrics?.find(m => m.metric === doseWeightMetric)
      if (wm) map[name] = wm.value
    })
    // Fill in from treatment history for animals with no exam yet
    Object.entries(animalHistory).forEach(([name, history]) => {
      if (name in map) return
      const last = history[0]
      if (!last) return
      if (last.weight_kg != null) map[name] = last.weight_kg
      else if (last.weight != null) map[name] = toKg(last.weight)
    })
    animals.forEach(a => { if (!(a.name in map)) map[a.name] = null })
    return map
  }, [latestExams, animalHistory, animals, doseWeightMetric])

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
      const profile      = animals.find(a => a.name === name) || {}
      const history      = animalHistory[name] || []
      const latestExam   = latestExams[name] || null
      const weightMetric = latestExam?.metrics?.find(m => m.metric === doseWeightMetric)
      // Fall back to most recent treatment weight if no exam exists yet
      const fallbackWeightKg = (() => {
        const lastTx = history[0]
        if (!lastTx) return null
        if (lastTx.weight_kg != null) return lastTx.weight_kg
        if (lastTx.weight    != null) return toKg(lastTx.weight)
        return null
      })()
      return {
        name,
        photo_url:      profile.photo_url || null,
        notes:          profile.notes || '',
        id:             profile.id,
        history,
        latestExam,
        latestWeightKg: weightMetric?.value ?? fallbackWeightKg,
        weightFromExam: !!weightMetric,   // flag so UI can hint "no exam yet"
      }
    })
  }, [animalHistory, animals, latestExams, doseWeightMetric])

  // Metrics available in any exam for this animal (for chart tabs)
  const examMetricKeys = useMemo(() => {
    const keys = new Set()
    animalExams.forEach(e => e.metrics.forEach(m => keys.add(m.metric)))
    return Array.from(keys)
  }, [animalExams])

  // ── Calculator ───────────────────────────────────────────────
  async function handleSave() {
    if (!animalName.trim() || !weightKg || !dose) { showNotif('⚠ Please fill in all fields.', 'warn'); return }
    const entry = {
      id: Date.now(), timestamp: new Date().toLocaleString(),
      animalName: animalName.trim(), medication, dose: parseFloat(dose), notes: '',
    }
    const saved = await addTreatment(entry, useSupabase)
    if (!animals.find(a => a.name === entry.animalName)) {
      await upsertAnimal({ name: entry.animalName }, useSupabase)
      setAnimals(prev => [...prev, { name: entry.animalName, photo_url: null, notes: '' }])
    }
    setLog(prev => [saved, ...prev])
    showNotif(`✓ ${saved.animalName} · ${saved.medication.split(' ')[0]} · ${saved.dose} mL`)
    setNameLocked(true); setWeightLocked(true)
  }

  function handleClearLock() {
    setAnimalName(''); setWeightInput('')
    setNameLocked(false); setWeightLocked(false)
  }

  // ── Exams ────────────────────────────────────────────────────
  async function handleSaveExam(animalName) {
    const metrics = Object.entries(examMetrics)
      .filter(([_, v]) => v !== '' && !isNaN(parseFloat(v)))
      .map(([key, val]) => {
        const def = metricDefs.find(d => d.key === key)
        // Convert display unit back to kg for storage
        let value = parseFloat(val)
        if (key === 'weight_kg' && !isKg) value = toKg(value)
        return { metric: key, value, unit: def?.unit || '' }
      })
    if (!metrics.length) { showNotif('⚠ Enter at least one metric.', 'warn'); return }
    const recorded_at = examDate ? new Date(examDate).toISOString() : new Date().toISOString()
    const exam = await saveExam({ animal_name: animalName, recorded_at, notes: examNotes, metrics }, useSupabase)
    setAnimalExams(prev => [exam, ...prev])
    // Update latestExams if this is newer
    const current = latestExams[animalName]
    if (!current || new Date(exam.recorded_at) >= new Date(current.recorded_at)) {
      setLatestExams(prev => ({ ...prev, [animalName]: exam }))
    }
    setExamMetrics({}); setExamDate(''); setExamNotes('')
    showNotif('✓ Exam saved')
  }

  async function handleDeleteExam(id) {
    await deleteExam(id, useSupabase)
    setAnimalExams(prev => prev.filter(e => e.id !== id))
  }

  // ── Metric defs ──────────────────────────────────────────────
  async function handleAddMetricDef() {
    const key = newMetricKey.trim().toLowerCase().replace(/\s+/g, '_')
    if (!key || !newMetricLabel.trim()) { showNotif('⚠ Key and label required.', 'warn'); return }
    if (metricDefs.find(d => d.key === key)) { showNotif('⚠ Metric key already exists.', 'warn'); return }
    const def = {
      key, label: newMetricLabel.trim(), unit: newMetricUnit.trim(),
      is_dose_weight: newMetricIsDoseWeight, display_order: metricDefs.length + 1,
    }
    const saved = await addMetricDef(def, useSupabase)
    const updated = [...metricDefs, saved]
    setMetricDefs(updated); saveMetricDefs(updated, false)
    setNewMetricKey(''); setNewMetricLabel(''); setNewMetricUnit(''); setNewMetricIsDoseWeight(false)
    setShowMetricForm(false)
    showNotif(`✓ Added metric: ${def.label}`)
  }

  async function handleDeleteMetricDef(key) {
    await deleteMetricDef(key, useSupabase)
    const updated = metricDefs.filter(d => d.key !== key)
    setMetricDefs(updated); saveMetricDefs(updated, false)
  }

  // ── Medications ──────────────────────────────────────────────
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

  async function handleSaveEditMed() {
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

  // ── Photos ───────────────────────────────────────────────────
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

  // ── Import/Export ────────────────────────────────────────────
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

  // ── Chart data ───────────────────────────────────────────────
  const medCounts = useMemo(() => {
    const c = {}; meds.forEach(m => { c[m.name] = 0 })
    log.forEach(e => { c[e.medication] = (c[e.medication] || 0) + 1 })
    return c
  }, [log, meds])
  const maxCount = Math.max(...Object.values(medCounts), 1)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f4f0eb', fontFamily:'DM Sans,sans-serif', color:'#3d6b52', fontSize:'18px', fontWeight:700 }}>
      🐾 Loading...
    </div>
  )

  // ── Animal Profile ────────────────────────────────────────────
  if (selectedAnimal) {
    const profile = animalProfiles.find(a => a.name === selectedAnimal.name) || selectedAnimal
    const history = profile.history || []
    const latestExam = latestExams[profile.name]
    const latestWeightKg = latestExam?.metrics?.find(m => m.metric === doseWeightMetric)?.value
    const chartMetricDef = metricDefs.find(d => d.key === activeChartMetric)

    return (
      <div style={S.root}>
        <style>{css}</style>
        {notif && <div style={{ ...S.notif, background: notifType==='err'?'#7a2020':notifType==='warn'?'#6b5a20':'#2a3d30' }}>{notif}</div>}

        <header style={S.header}>
          <button onClick={() => { setSelectedAnimal(null); setAnimalExams([]) }} style={S.backBtn}>← Back</button>
          <div style={S.logo}>🐱</div>
          <div>
            <div style={S.title}>{profile.name}</div>
            <div style={S.subtitle}>
              {latestWeightKg ? `${isKg ? latestWeightKg+' kg' : toLbs(latestWeightKg)+' lbs'}` : 'No exam recorded'}
              {' · '}{history.length} treatment{history.length!==1?'s':''}
            </div>
          </div>
          <button onClick={() => {
            setAnimalName(profile.name)
            if (latestWeightKg) setWeightInput(String(isKg ? latestWeightKg : toLbs(latestWeightKg)))
            setNameLocked(true); setWeightLocked(!!latestWeightKg)
            setSelectedAnimal(null); setAnimalExams([]); setTab('calculator')
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
              {latestExam && (
                <div style={{ marginBottom:'10px' }}>
                  <div style={S.fieldLabel}>Latest Exam — {latestExam.label}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                    {latestExam.metrics.map(m => {
                      const def = metricDefs.find(d => d.key === m.metric)
                      const displayVal = m.metric === 'weight_kg' && !isKg ? toLbs(m.value) : m.value
                      const displayUnit = m.metric === 'weight_kg' ? (isKg ? 'kg' : 'lbs') : (def?.unit || m.unit || '')
                      return (
                        <div key={m.metric} style={S.miniStat}>
                          <div style={S.miniStatNum}>{displayVal} <span style={{ fontSize:'10px', fontWeight:400 }}>{displayUnit}</span></div>
                          <div style={S.miniStatLabel}>{def?.label || m.metric}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div style={S.fieldLabel}>Notes</div>
              <textarea style={{ ...S.input, minHeight:'60px', resize:'vertical', fontSize:'13px' }}
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
            </div>
          </div>

          {/* Charts — one per metric that has 2+ data points */}
          {examMetricKeys.length > 0 && (
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <h3 style={{ ...S.cardTitle, margin:0 }}>Trends</h3>
                {examMetricKeys.length > 1 && (
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {examMetricKeys.map(key => {
                      const def = metricDefs.find(d => d.key === key)
                      return (
                        <button key={key}
                          style={{ ...S.toggleBtn, ...(activeChartMetric === key ? S.toggleBtnActive : {}), padding:'3px 10px', fontSize:'11px' }}
                          onClick={() => setActiveChartMetric(key)}>
                          {def?.label || key}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <MetricChart
                exams={animalExams}
                metricKey={activeChartMetric}
                unit={chartMetricDef?.unit || ''}
                isKg={isKg}
              />
            </div>
          )}

          {/* Log new exam */}
          <div style={S.card}>
            <h3 style={S.cardTitle}>Log Exam</h3>
            <div style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
              <div style={{ flex:1 }}>
                <div style={S.fieldLabel}>Date (optional)</div>
                <input style={S.input} type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
              </div>
              <div style={{ flex:2 }}>
                <div style={S.fieldLabel}>Notes (optional)</div>
                <input style={S.input} placeholder="e.g. Routine check" value={examNotes} onChange={e => setExamNotes(e.target.value)} />
              </div>
            </div>

            {/* Metric inputs — one per defined metric */}
            <div style={S.metricGrid}>
              {metricDefs.map(def => {
                const displayLabel = def.key === 'weight_kg'
                  ? `${def.label} (${isKg ? 'kg' : 'lbs'})`
                  : `${def.label}${def.unit ? ` (${def.unit})` : ''}`
                return (
                  <div key={def.key}>
                    <div style={S.fieldLabel}>{displayLabel}</div>
                    <input style={S.input} type="number" step="0.01"
                      placeholder={def.key === 'weight_kg' ? (isKg ? '4.2' : '9.3') : ''}
                      value={examMetrics[def.key] || ''}
                      onChange={e => setExamMetrics(prev => ({ ...prev, [def.key]: e.target.value }))} />
                  </div>
                )
              })}
            </div>
            <button style={{ ...S.saveBtn, marginTop:'12px' }}
              onClick={() => handleSaveExam(profile.name)} className="save-btn">
              Save Exam
            </button>
          </div>

          {/* Exam history */}
          {animalExams.length > 0 && (
            <div style={S.card}>
              <h3 style={S.cardTitle}>Exam History</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {animalExams.map(exam => (
                  <div key={exam.id} style={S.examRow}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'5px' }}>{exam.label}
                        {exam.notes && <span style={{ fontWeight:400, color:'#9a8a7a', marginLeft:'8px', fontSize:'12px' }}>{exam.notes}</span>}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                        {exam.metrics.map(m => {
                          const def = metricDefs.find(d => d.key === m.metric)
                          const displayVal = m.metric === 'weight_kg' && !isKg ? toLbs(m.value) : m.value
                          const displayUnit = m.metric === 'weight_kg' ? (isKg ? 'kg' : 'lbs') : (def?.unit || m.unit || '')
                          return (
                            <span key={m.metric} style={S.examMetricBadge}>
                              <span style={{ color:'#9a8a7a', fontSize:'10px' }}>{def?.label || m.metric}</span>
                              {' '}<strong>{displayVal}</strong> {displayUnit}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteExam(exam.id)}
                      style={{ ...S.actionBtnRed, padding:'3px 8px', fontSize:'11px', alignSelf:'flex-start' }}>✕</button>
                  </div>
                ))}
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
                    {['Date','Medication','Dose (mL)'].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {history.map(e => (
                      <tr key={e.id} style={S.tr}>
                        <td style={S.td}>{e.timestamp}</td>
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

  // ── Main App ──────────────────────────────────────────────────
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
              {nameLocked
                ? `Locked on ${animalName}${weightLocked ? ` (${weightInput} ${isKg?'kg':'lbs'} from latest exam)` : ''} — change med and save again.`
                : 'Type a name to auto-fill weight from latest exam.'}
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
                <div style={S.fieldLabel}>Body Weight ({isKg?'kg':'lbs'})</div>
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
                  {weightInput} {isKg?'kg':'lbs'} {!isKg&&`(${weightKg} kg)`} × {activeMed.factor} = {dose} mL
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
              <p style={S.cardDesc}>{animalProfiles.length === 0 ? 'No animals yet.' : `${animalProfiles.length} animal${animalProfiles.length!==1?'s':''} tracked.`}</p>
            </div>
            <div style={S.animalGrid}>
              {animalProfiles.map(profile => (
                <div key={profile.name} style={{ ...S.animalCard, cursor:'pointer' }}
                  onClick={() => { setSelectedAnimal(profile); setActiveChartMetric('weight_kg') }}
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
                      {profile.latestWeightKg != null
                        ? (isKg ? `${profile.latestWeightKg} kg` : `${toLbs(profile.latestWeightKg)} lbs`)
                        : 'No weight recorded'}
                      {profile.latestWeightKg != null && !profile.weightFromExam
                        ? <span style={{ color:'#c8a84a', fontSize:'10px', marginLeft:'5px' }}>from treatment</span>
                        : null}
                      {' · '}{profile.history.length} treatment{profile.history.length!==1?'s':''}
                    </div>
                    {profile.latestExam && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'5px' }}>
                        {profile.latestExam.metrics.slice(0,3).map(m => {
                          const def = metricDefs.find(d => d.key === m.metric)
                          return (
                            <span key={m.metric} style={{ ...S.examMetricBadge, fontSize:'10px' }}>
                              {def?.label || m.metric}: {m.metric==='weight_kg'&&!isKg ? toLbs(m.value) : m.value} {m.metric==='weight_kg'?(isKg?'kg':'lbs'):(def?.unit||'')}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ color:'#ccc', fontSize:'18px', alignSelf:'center' }}>›</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LOG ── */}
        {tab === 'log' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Treatment Log</h2>
              <p style={S.cardDesc}>{log.length === 0 ? 'No treatments recorded yet.' : `${log.length} treatment${log.length!==1?'s':''}`}</p>
            </div>
            {log.length > 0 && (
              <div style={S.card}>
                <div style={{ overflowX:'auto' }}>
                  <table style={S.table}>
                    <thead><tr>
                      {['Timestamp','Animal','Medication','Dose (mL)'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {log.map(e => (
                        <tr key={e.id} style={{ ...S.tr, cursor:'pointer' }}
                          onClick={() => { setSelectedAnimal({ name: e.animalName }); setActiveChartMetric('weight_kg') }}
                          className="log-row">
                          <td style={S.td}>{e.timestamp}</td>
                          <td style={{ ...S.td, fontWeight:600 }}>{e.animalName}</td>
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
              </div>
            </div>
            {log.length > 0 && (
              <div style={S.card}>
                <h3 style={S.cardTitle}>Recent Activity</h3>
                {log.slice(0,6).map(e => (
                  <div key={e.id} style={{ ...S.activityRow, cursor:'pointer' }}
                    onClick={() => { setSelectedAnimal({ name: e.animalName }); setActiveChartMetric('weight_kg') }}>
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
            {/* Metric definitions */}
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
                <h2 style={{ ...S.cardTitle, margin:0 }}>Exam Metrics</h2>
                <button style={S.editBtn} onClick={() => setShowMetricForm(f => !f)}>
                  {showMetricForm ? 'Cancel' : '+ Add Metric'}
                </button>
              </div>
              <p style={S.cardDesc}>Metrics captured during exams. The dose-weight metric is used for calculations.</p>
              <div style={S.medList}>
                {metricDefs.map(d => (
                  <div key={d.key} style={S.medRow}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:'13px' }}>
                        {d.label}
                        {d.is_dose_weight && <span style={{ marginLeft:'6px', fontSize:'10px', background:'#eef6f1', color:'#3d6b52', border:'1px solid #b8d4c0', borderRadius:'10px', padding:'1px 7px' }}>dose weight</span>}
                      </div>
                      <div style={{ fontSize:'11px', color:'#9a8a7a' }}>key: {d.key}{d.unit && ` · unit: ${d.unit}`}</div>
                    </div>
                    {!d.is_dose_weight && (
                      <button style={S.actionBtnRed} onClick={() => handleDeleteMetricDef(d.key)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {showMetricForm && (
                <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'10px', padding:'14px', background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd' }}>
                  <div style={{ display:'flex', gap:'10px' }}>
                    <div style={{ flex:1 }}>
                      <div style={S.fieldLabel}>Key (no spaces)</div>
                      <input style={S.input} placeholder="e.g. muac_cm" value={newMetricKey} onChange={e => setNewMetricKey(e.target.value)} />
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={S.fieldLabel}>Label</div>
                      <input style={S.input} placeholder="e.g. MUAC" value={newMetricLabel} onChange={e => setNewMetricLabel(e.target.value)} />
                    </div>
                    <div style={{ flex:'0 0 80px' }}>
                      <div style={S.fieldLabel}>Unit</div>
                      <input style={S.input} placeholder="cm" value={newMetricUnit} onChange={e => setNewMetricUnit(e.target.value)} />
                    </div>
                  </div>
                  <button style={S.saveBtn} onClick={handleAddMetricDef} className="save-btn">Add Metric</button>
                </div>
              )}
            </div>

            {/* Medications */}
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
                <h2 style={{ ...S.cardTitle, margin:0 }}>Medications</h2>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input type="file" accept=".csv" ref={csvImportRef} onChange={handleCSVImport} style={{ display:'none' }} />
                  <button style={S.editBtn} onClick={() => csvImportRef.current.click()}>⬆ CSV</button>
                </div>
              </div>
              <p style={S.cardDesc}>Factors are mL per kg body weight.</p>
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
                          <button style={S.actionBtnGreen} onClick={handleSaveEditMed}>Save</button>
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
                  <div style={{ fontSize:'12px', color:'#7a6a5a' }}>Example: 4 kg → {(4*parseFloat(newMedFactor)).toFixed(2)} mL</div>
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
                  <div style={{ fontSize:'12px', color:'#9a8a7a', marginTop:'2px' }}>Default is kg. All calculations use kg internally.</div>
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
                    {dbStatus === 'connected' ? '🟢 Connected to Supabase' : '🟡 localStorage (this device only)'}
                  </div>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Export Data</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <button style={S.exportBtn} onClick={() => exportJSON(log, meds, animals, animalExams, metricDefs)} className="export-btn">
                  ⬇ Export as JSON
                  <span style={S.exportSub}>Full backup — treatments, meds, animals, exams</span>
                </button>
                <button style={S.exportBtn} onClick={() => exportCSV(log)} className="export-btn">
                  ⬇ Export as CSV
                  <span style={S.exportSub}>Treatments only — open in Excel or Sheets</span>
                </button>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Import Data</h3>
              <p style={S.cardDesc}>Import a previously exported JSON backup.</p>
              <input type="file" accept=".json" ref={importRef} onChange={handleImportJSON} style={{ display:'none' }} />
              <button style={{ ...S.saveBtn, background:'#4a6b8a' }} onClick={() => importRef.current.click()} className="save-btn">
                ⬆ Import JSON Backup
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────
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
  miniStat: { background:'#f4f0eb', borderRadius:'8px', padding:'7px 10px', textAlign:'center', minWidth:'60px' },
  miniStatNum: { fontSize:'15px', fontWeight:800, color:'#2a3d30' },
  miniStatLabel: { fontSize:'10px', color:'#9a8a7a', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' },
  metricGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:'10px' },
  examRow: { display:'flex', gap:'10px', alignItems:'flex-start', padding:'12px', background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd' },
  examMetricBadge: { padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#eef6f1', border:'1px solid #c8dece', color:'#2a3d30', whiteSpace:'nowrap' },
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
