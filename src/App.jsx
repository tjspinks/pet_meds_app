import { useState, useEffect, useMemo } from 'react'
import {
  checkSupabase, loadMeds, loadTreatments, loadAnimals,
  loadLatestExams, loadMetricDefs,
  addTreatment, upsertAnimal,
  saveTreatmentsLocal, loadSettings, saveSettings,
  toKg, toLbs,
} from './lib/dataService'

import { S, cssText } from './components/styles'
import { Notif } from './components/Notif'
import { Header, TabBar } from './components/Header'
import { Calculator } from './components/Calculator'
import { AnimalsList, LogTab } from './components/AnimalsList'
import { Dashboard } from './components/Dashboard'
import { MedsTab } from './components/MedsTab'
import { SettingsTab } from './components/SettingsTab'
import { AnimalProfile } from './components/AnimalProfile'

export default function App() {
  // Data
  const [meds, setMeds] = useState([])
  const [log, setLog] = useState([])
  const [animals, setAnimals] = useState([])
  const [latestExams, setLatestExams] = useState({})
  const [metricDefs, setMetricDefs] = useState([])
  const [settings, setSettings] = useState({ weightUnit: 'kg' })

  // Connection
  const [useSupabase, setUseSupabase] = useState(false)
  const [dbStatus, setDbStatus] = useState('checking')
  const [loading, setLoading] = useState(true)

  // UI
  const [tab, setTab] = useState('calculator')
  const [selectedAnimal, setSelectedAnimal] = useState(null)
  const [notif, setNotif] = useState({ msg: null, type: 'ok' })

  // Calculator state (lifted up so it survives tab nav and animal profile "+Treat")
  const [animalName, setAnimalName] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [weightLocked, setWeightLocked] = useState(false)
  const [nameLocked, setNameLocked] = useState(false)
  const [medication, setMedication] = useState('')

  // ── Init ──
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

  const isKg = settings.weightUnit === 'kg'

  function showNotif(msg, type = 'ok') {
    setNotif({ msg, type })
    setTimeout(() => setNotif({ msg: null, type: 'ok' }), 3000)
  }

  function updateSettings(patch) {
    const next = { ...settings, ...patch }
    setSettings(next); saveSettings(next)
  }

  // ── Derived ──
  const doseWeightMetric = metricDefs.find(d => d.is_dose_weight)?.key || 'weight_kg'

  const animalHistory = useMemo(() => {
    const map = {}
    log.forEach(e => {
      if (!map[e.animalName]) map[e.animalName] = []
      map[e.animalName].push(e)
    })
    return map
  }, [log])

  const knownAnimals = useMemo(() => {
    const map = {}
    Object.entries(latestExams).forEach(([name, exam]) => {
      const wm = exam?.metrics?.find(m => m.metric === doseWeightMetric)
      if (wm) map[name] = wm.value
    })
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

  const animalProfiles = useMemo(() => {
    const names = new Set([...Object.keys(animalHistory), ...animals.map(a => a.name)])
    return Array.from(names).sort().map(name => {
      const p = animals.find(a => a.name === name) || {}
      const history = animalHistory[name] || []
      const latestExam = latestExams[name] || null
      const weightMetric = latestExam?.metrics?.find(m => m.metric === doseWeightMetric)
      const fallbackWeightKg = (() => {
        const lastTx = history[0]
        if (!lastTx) return null
        if (lastTx.weight_kg != null) return lastTx.weight_kg
        if (lastTx.weight != null) return toKg(lastTx.weight)
        return null
      })()
      return {
        name,
        photo_url: p.photo_url || null,
        notes: p.notes || '',
        id: p.id,
        history,
        latestExam,
        latestWeightKg: weightMetric?.value ?? fallbackWeightKg,
        weightFromExam: !!weightMetric,
      }
    })
  }, [animalHistory, animals, latestExams, doseWeightMetric])

  // ── Handlers ──
  async function handleSaveCalculator(weightKg, dose) {
    if (!animalName.trim() || !weightKg || !dose) {
      showNotif('⚠ Please fill in all fields.', 'warn'); return
    }
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      animalName: animalName.trim(),
      medication,
      dose: parseFloat(dose),
      notes: '',
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

  function handleSelectAnimal(profile) {
    setSelectedAnimal(profile)
  }

  function handleTreatFromProfile(profile) {
    const last = profile.latestWeightKg
    setAnimalName(profile.name)
    if (last != null) setWeightInput(String(isKg ? last : toLbs(last)))
    setNameLocked(true); setWeightLocked(last != null)
    setSelectedAnimal(null); setTab('calculator')
  }

  function handlePhotoUpdate(name, url) {
    setAnimals(prev => prev.map(a => a.name === name ? { ...a, photo_url: url } : a))
  }

  function handleNotesUpdate(name, notes) {
    setAnimals(prev => prev.map(a => a.name === name ? { ...a, notes } : a))
  }

  function handleLatestExamUpdate(name, exam) {
    setLatestExams(prev => ({ ...prev, [name]: exam }))
  }

  // ── Render ──
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f4f0eb', fontFamily:'DM Sans,sans-serif', color:'#3d6b52', fontSize:'18px', fontWeight:700 }}>
        🐾 Loading...
      </div>
    )
  }

  if (selectedAnimal) {
    const profile = animalProfiles.find(a => a.name === selectedAnimal.name) || selectedAnimal
    return (
      <>
        <style>{cssText}</style>
        <Notif message={notif.msg} type={notif.type} />
        <AnimalProfile
          profile={profile}
          meds={meds}
          metricDefs={metricDefs}
          isKg={isKg}
          useSupabase={useSupabase}
          doseWeightMetric={doseWeightMetric}
          onBack={() => setSelectedAnimal(null)}
          onTreat={() => handleTreatFromProfile(profile)}
          onPhotoUpdate={handlePhotoUpdate}
          onNotesUpdate={handleNotesUpdate}
          onLatestExamUpdate={handleLatestExamUpdate}
          showNotif={showNotif}
        />
      </>
    )
  }

  return (
    <div style={S.root}>
      <style>{cssText}</style>
      <Notif message={notif.msg} type={notif.type} />
      <Header dbStatus={dbStatus} logCount={log.length} />
      <TabBar activeTab={tab} onChange={setTab} />
      <main style={S.main}>
        {tab === 'calculator' && (
          <Calculator
            meds={meds}
            knownAnimals={knownAnimals}
            isKg={isKg}
            animalName={animalName} setAnimalName={setAnimalName}
            weightInput={weightInput} setWeightInput={setWeightInput}
            medication={medication} setMedication={setMedication}
            nameLocked={nameLocked}
            weightLocked={weightLocked} setWeightLocked={setWeightLocked}
            onClearLock={handleClearLock}
            onSave={handleSaveCalculator}
          />
        )}
        {tab === 'animals' && (
          <AnimalsList
            animalProfiles={animalProfiles}
            meds={meds} isKg={isKg}
            onSelect={handleSelectAnimal}
          />
        )}
        {tab === 'log' && (
          <LogTab
            log={log}
            animalCount={animalProfiles.length}
            meds={meds}
            onSelectAnimal={handleSelectAnimal}
          />
        )}
        {tab === 'dashboard' && (
          <Dashboard
            log={log} meds={meds}
            animalCount={animalProfiles.length}
            onSelectAnimal={handleSelectAnimal}
          />
        )}
        {tab === 'meds' && (
          <MedsTab
            meds={meds} setMeds={setMeds}
            metricDefs={metricDefs} setMetricDefs={setMetricDefs}
            log={log}
            useSupabase={useSupabase}
            showNotif={showNotif}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            settings={settings} updateSettings={updateSettings}
            dbStatus={dbStatus}
            log={log} meds={meds} animals={animals}
            setMeds={setMeds} setAnimals={setAnimals} setLog={setLog}
            useSupabase={useSupabase}
            showNotif={showNotif}
          />
        )}
      </main>
    </div>
  )
}
