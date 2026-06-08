import { useState, useEffect, useMemo, useRef } from 'react'
import { S, getMedColor } from './styles'
import { ProfileHeader } from './Header'
import { MetricChart } from './MetricChart'
import {
  loadExams, saveExam, deleteExam,
  upsertAnimal, uploadAnimalPhoto,
  toKg, toLbs,
} from '../lib/dataService'

export function AnimalProfile({
  profile, meds, metricDefs, isKg, useSupabase,
  doseWeightMetric,
  onBack, onTreat, onPhotoUpdate, onNotesUpdate,
  onLatestExamUpdate,
  showNotif,
}) {
  const [exams, setExams] = useState([])
  const [activeMetric, setActiveMetric] = useState(doseWeightMetric)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [notesDraft, setNotesDraft] = useState(null)

  const [examDate, setExamDate] = useState('')
  const [examNotes, setExamNotes] = useState('')
  const [examMetrics, setExamMetrics] = useState({})

  const photoRef = useRef(null)

  useEffect(() => {
    loadExams(profile.name, useSupabase).then(setExams)
  }, [profile.name])

  const latestExam = exams[0]
  const latestWeightKg = latestExam?.metrics?.find(m => m.metric === doseWeightMetric)?.value

  const examMetricKeys = useMemo(() => {
    const keys = new Set()
    exams.forEach(e => e.metrics.forEach(m => keys.add(m.metric)))
    return Array.from(keys)
  }, [exams])

  const chartMetricDef = metricDefs.find(d => d.key === activeMetric)

  async function handleSaveExam() {
    const metrics = Object.entries(examMetrics)
      .filter(([_, v]) => v !== '' && !isNaN(parseFloat(v)))
      .map(([key, val]) => {
        const def = metricDefs.find(d => d.key === key)
        let value = parseFloat(val)
        if (key === 'weight_kg' && !isKg) value = toKg(value)
        return { metric: key, value, unit: def?.unit || '' }
      })
    if (!metrics.length) { showNotif('⚠ Enter at least one metric.', 'warn'); return }
    const recorded_at = examDate ? new Date(examDate).toISOString() : new Date().toISOString()
    const exam = await saveExam({ animal_name: profile.name, recorded_at, notes: examNotes, metrics }, useSupabase)
    const updated = [exam, ...exams].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
    setExams(updated)
    if (!latestExam || new Date(exam.recorded_at) >= new Date(latestExam.recorded_at)) {
      onLatestExamUpdate(profile.name, exam)
    }
    setExamMetrics({}); setExamDate(''); setExamNotes('')
    showNotif('✓ Exam saved')
  }

  async function handleDeleteExam(id) {
    await deleteExam(id, useSupabase)
    setExams(prev => prev.filter(e => e.id !== id))
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]; if (!file) return
    setPhotoUploading(true)
    const url = await uploadAnimalPhoto(profile.name, file)
    if (url) {
      await upsertAnimal({ name: profile.name, photo_url: url }, useSupabase)
      onPhotoUpdate(profile.name, url)
      showNotif('✓ Photo updated')
    } else {
      showNotif('✗ Upload failed — check Supabase Storage bucket.', 'err')
    }
    setPhotoUploading(false)
    e.target.value = ''
  }

  const subtitle = `${latestWeightKg != null ? (isKg ? `${latestWeightKg} kg` : `${toLbs(latestWeightKg)} lbs`) : 'No exam recorded'} · ${profile.history.length} treatment${profile.history.length !== 1 ? 's' : ''}`

  const rightAction = (
    <button onClick={onTreat} style={{ ...S.editBtn, marginLeft:'auto' }}>+ Treat</button>
  )

  return (
    <div style={S.root}>
      <ProfileHeader title={profile.name} subtitle={subtitle} onBack={onBack} rightAction={rightAction} />

      <main style={S.main}>

        {/* Photo + notes */}
        <div style={{ ...S.card, display:'flex', gap:'16px', alignItems:'flex-start' }}>
          <div style={S.photoContainer}>
            {profile.photo_url
              ? <img src={profile.photo_url} alt={profile.name} style={S.photo} />
              : <div style={S.photoPlaceholder}>🐱</div>
            }
            <input type="file" accept="image/*" ref={photoRef} onChange={handlePhotoUpload} style={{ display:'none' }} />
            <button style={S.photoBtn} onClick={() => photoRef.current.click()} disabled={photoUploading}>
              {photoUploading ? '⏳' : profile.photo_url ? '📷 Change' : '📷 Add Photo'}
            </button>
            {!useSupabase && (
              <div style={{ fontSize:'10px', color:'#c47c7c', marginTop:'4px', textAlign:'center' }}>
                Needs Supabase
              </div>
            )}
          </div>
          <div style={{ flex:1 }}>
            {latestExam && (
              <div style={{ marginBottom:'10px' }}>
                <div style={S.fieldLabel}>Latest Exam — {latestExam.label}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                  {latestExam.metrics.map(m => {
                    const def = metricDefs.find(d => d.key === m.metric)
                    const dval = m.metric === 'weight_kg' && !isKg ? toLbs(m.value) : m.value
                    const dunit = m.metric === 'weight_kg' ? (isKg ? 'kg' : 'lbs') : (def?.unit || m.unit || '')
                    return (
                      <div key={m.metric} style={S.miniStat}>
                        <div style={S.miniStatNum}>{dval} <span style={{ fontSize:'10px', fontWeight:400 }}>{dunit}</span></div>
                        <div style={S.miniStatLabel}>{def?.label || m.metric}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={S.fieldLabel}>Notes</div>
            <textarea
              style={{ ...S.input, minHeight:'60px', resize:'vertical', fontSize:'13px' }}
              placeholder="Notes about this animal..."
              value={notesDraft !== null ? notesDraft : profile.notes}
              onChange={e => setNotesDraft(e.target.value)}
              onBlur={async () => {
                if (notesDraft !== null && notesDraft !== profile.notes) {
                  await upsertAnimal({ name: profile.name, notes: notesDraft, photo_url: profile.photo_url }, useSupabase)
                  onNotesUpdate(profile.name, notesDraft)
                }
                setNotesDraft(null)
              }}
            />
          </div>
        </div>

        {/* Charts */}
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
                        style={{ ...S.toggleBtn, ...(activeMetric === key ? S.toggleBtnActive : {}), padding:'3px 10px', fontSize:'11px' }}
                        onClick={() => setActiveMetric(key)}>
                        {def?.label || key}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <MetricChart
              exams={exams}
              metricKey={activeMetric}
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
          <div style={S.metricGrid}>
            {metricDefs.map(def => {
              const displayLabel = def.key === 'weight_kg'
                ? `${def.label} (${isKg ? 'kg' : 'lbs'})`
                : `${def.label}${def.unit ? ` (${def.unit})` : ''}`
              return (
                <div key={def.key}>
                  <div style={S.fieldLabel}>{displayLabel}</div>
                  <input
                    style={S.input}
                    type="number" step="0.01"
                    placeholder={def.key === 'weight_kg' ? (isKg ? '4.2' : '9.3') : ''}
                    value={examMetrics[def.key] || ''}
                    onChange={e => setExamMetrics(prev => ({ ...prev, [def.key]: e.target.value }))}
                  />
                </div>
              )
            })}
          </div>
          <button style={{ ...S.saveBtn, marginTop:'12px' }} onClick={handleSaveExam}>Save Exam</button>
        </div>

        {/* Exam history */}
        {exams.length > 0 && (
          <div style={S.card}>
            <h3 style={S.cardTitle}>Exam History</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {exams.map(exam => (
                <ExamHistoryRow key={exam.id} exam={exam} metricDefs={metricDefs} isKg={isKg} onDelete={() => handleDeleteExam(exam.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Treatment history */}
        <div style={S.card}>
          <h3 style={S.cardTitle}>Treatment History</h3>
          {profile.history.length === 0 && <p style={S.cardDesc}>No treatments recorded.</p>}
          {profile.history.length > 0 && (
            <div style={{ overflowX:'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['Date','Medication','Dose (mL)'].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {profile.history.map(e => (
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

function ExamHistoryRow({ exam, metricDefs, isKg, onDelete }) {
  return (
    <div style={S.examRow}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'5px' }}>
          {exam.label}
          {exam.notes && <span style={{ fontWeight:400, color:'#9a8a7a', marginLeft:'8px', fontSize:'12px' }}>{exam.notes}</span>}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
          {exam.metrics.map(m => {
            const def = metricDefs.find(d => d.key === m.metric)
            const dval = m.metric === 'weight_kg' && !isKg ? toLbs(m.value) : m.value
            const dunit = m.metric === 'weight_kg' ? (isKg ? 'kg' : 'lbs') : (def?.unit || m.unit || '')
            return (
              <span key={m.metric} style={S.examMetricBadge}>
                <span style={{ color:'#9a8a7a', fontSize:'10px' }}>{def?.label || m.metric}</span>
                {' '}<strong>{dval}</strong> {dunit}
              </span>
            )
          })}
        </div>
      </div>
      <button onClick={onDelete} style={{ ...S.actionBtnRed, padding:'3px 8px', fontSize:'11px', alignSelf:'flex-start' }}>✕</button>
    </div>
  )
}
