import { useState, useRef, useMemo } from 'react'
import { S, getMedColor } from './styles'
import {
  addMed, updateMed, deleteMed, saveMeds,
  addMetricDef, deleteMetricDef, saveMetricDefs,
  parseMedCSV,
} from '../lib/dataService'

export function MedsTab({
  meds, setMeds,
  metricDefs, setMetricDefs,
  log,
  useSupabase,
  showNotif,
}) {
  const [editingMed, setEditingMed] = useState(null)
  const [newMedName, setNewMedName] = useState('')
  const [newMedFactor, setNewMedFactor] = useState('')
  const [newMedConc, setNewMedConc] = useState('')
  const [newMedIndic, setNewMedIndic] = useState('')

  const [showMetricForm, setShowMetricForm] = useState(false)
  const [newMetricKey, setNewMetricKey] = useState('')
  const [newMetricLabel, setNewMetricLabel] = useState('')
  const [newMetricUnit, setNewMetricUnit] = useState('')

  const csvImportRef = useRef(null)

  const medCounts = useMemo(() => {
    const c = {}
    meds.forEach(m => { c[m.name] = 0 })
    log.forEach(e => { c[e.medication] = (c[e.medication] || 0) + 1 })
    return c
  }, [log, meds])

  async function handleAddMed() {
    const name = newMedName.trim()
    const factor = parseFloat(newMedFactor)
    if (!name || isNaN(factor) || factor <= 0) {
      showNotif('⚠ Enter valid name and factor.', 'warn'); return
    }
    if (meds.find(m => m.name.toLowerCase() === name.toLowerCase())) {
      showNotif('⚠ Already exists.', 'warn'); return
    }
    const med = { name, factor, concentration: newMedConc.trim(), indication: newMedIndic.trim() }
    const saved = await addMed(med, useSupabase)
    const updated = [...meds, saved]
    setMeds(updated); saveMeds(updated, false)
    setNewMedName(''); setNewMedFactor(''); setNewMedConc(''); setNewMedIndic('')
    showNotif(`✓ Added ${name}`)
  }

  function handleEditMed(idx) {
    setEditingMed(idx)
    setNewMedName(meds[idx].name)
    setNewMedFactor(String(meds[idx].factor))
    setNewMedConc(meds[idx].concentration || '')
    setNewMedIndic(meds[idx].indication || '')
  }

  async function handleSaveEditMed() {
    const name = newMedName.trim()
    const factor = parseFloat(newMedFactor)
    if (!name || isNaN(factor) || factor <= 0) { showNotif('⚠ Enter valid values.', 'warn'); return }
    const updated = meds.map((m, i) => i === editingMed ? { ...m, name, factor, concentration: newMedConc.trim(), indication: newMedIndic.trim() } : m)
    await updateMed(updated[editingMed], useSupabase)
    setMeds(updated); saveMeds(updated, false)
    setEditingMed(null); setNewMedName(''); setNewMedFactor(''); setNewMedConc(''); setNewMedIndic('')
    showNotif('✓ Updated')
  }

  async function handleDeleteMed(idx) {
    await deleteMed(meds[idx], useSupabase)
    const updated = meds.filter((_, i) => i !== idx)
    setMeds(updated); saveMeds(updated, false)
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const text = await file.text()
      const parsed = parseMedCSV(text)
      const existing = new Set(meds.map(m => m.name.toLowerCase()))
      const fresh = parsed.filter(m => !existing.has(m.name.toLowerCase()))
      if (!fresh.length) { showNotif('No new medications.', 'warn'); return }
      const updated = [...meds, ...fresh]
      setMeds(updated)
      await saveMeds(updated, useSupabase)
      showNotif(`✓ Imported ${fresh.length}`)
    } catch { showNotif('✗ CSV parse failed.', 'err') }
    e.target.value = ''
  }

  async function handleAddMetricDef() {
    const key = newMetricKey.trim().toLowerCase().replace(/\s+/g, '_')
    if (!key || !newMetricLabel.trim()) { showNotif('⚠ Key and label required.', 'warn'); return }
    if (metricDefs.find(d => d.key === key)) { showNotif('⚠ Metric already exists.', 'warn'); return }
    const def = {
      key, label: newMetricLabel.trim(), unit: newMetricUnit.trim(),
      is_dose_weight: false, display_order: metricDefs.length + 1,
    }
    const saved = await addMetricDef(def, useSupabase)
    const updated = [...metricDefs, saved]
    setMetricDefs(updated); saveMetricDefs(updated, false)
    setNewMetricKey(''); setNewMetricLabel(''); setNewMetricUnit('')
    setShowMetricForm(false)
    showNotif(`✓ Added ${def.label}`)
  }

  async function handleDeleteMetricDef(key) {
    await deleteMetricDef(key, useSupabase)
    const updated = metricDefs.filter(d => d.key !== key)
    setMetricDefs(updated); saveMetricDefs(updated, false)
  }

  return (
    <div>
      {/* Metric definitions */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
          <h2 style={{ ...S.cardTitle, margin:0 }}>Exam Metrics</h2>
          <button style={S.editBtn} onClick={() => setShowMetricForm(f => !f)}>
            {showMetricForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
        <p style={S.cardDesc}>Metrics captured during exams.</p>
        <div style={S.medList}>
          {metricDefs.map(d => (
            <div key={d.key} style={S.medRow}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'13px' }}>
                  {d.label}
                  {d.is_dose_weight && (
                    <span style={{ marginLeft:'6px', fontSize:'10px', background:'#eef6f1', color:'#3d6b52', border:'1px solid #b8d4c0', borderRadius:'10px', padding:'1px 7px' }}>
                      dose weight
                    </span>
                  )}
                </div>
                <div style={{ fontSize:'11px', color:'#9a8a7a' }}>
                  key: {d.key}{d.unit && ` · unit: ${d.unit}`}
                </div>
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
            <button style={S.saveBtn} onClick={handleAddMetricDef}>Add Metric</button>
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
            <div key={m.name + i} style={S.medRow}>
              {editingMed === i ? (
                <MedEditRow
                  name={newMedName} setName={setNewMedName}
                  factor={newMedFactor} setFactor={setNewMedFactor}
                  conc={newMedConc} setConc={setNewMedConc}
                  indic={newMedIndic} setIndic={setNewMedIndic}
                  onSave={handleSaveEditMed}
                  onCancel={() => { setEditingMed(null); setNewMedName(''); setNewMedFactor(''); setNewMedConc(''); setNewMedIndic('') }}
                />
              ) : (
                <MedDisplayRow
                  med={m} meds={meds} usesCount={medCounts[m.name] || 0}
                  onEdit={() => handleEditMed(i)}
                  onDelete={() => handleDeleteMed(i)}
                />
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
              <input style={S.input} type="number" step="0.0001" value={newMedFactor} onChange={e => setNewMedFactor(e.target.value)} />
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
              Example: 4 kg → {(4 * parseFloat(newMedFactor)).toFixed(2)} mL
            </div>
          )}
          <button style={S.saveBtn} onClick={handleAddMed}>Add Medication</button>
        </div>
      </div>
    </div>
  )
}

function MedDisplayRow({ med, meds, usesCount, onEdit, onDelete }) {
  return (
    <>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:'13px' }}>{med.name}</div>
        <div style={{ fontSize:'11px', color:'#9a8a7a', marginTop:'2px' }}>
          ×{med.factor} mL/kg
          {med.concentration && <span style={{ margin:'0 6px' }}>· {med.concentration}</span>}
          {med.indication && <span style={{ color:'#7a9a87' }}>· {med.indication}</span>}
        </div>
      </div>
      <div style={{ ...S.medTag, background:getMedColor(meds,med.name)+'22', color:getMedColor(meds,med.name), borderColor:getMedColor(meds,med.name)+'55', fontSize:'11px', flexShrink:0 }}>
        {usesCount} uses
      </div>
      <button style={S.actionBtnGhost} onClick={onEdit}>✎</button>
      <button style={S.actionBtnRed} onClick={onDelete}>✕</button>
    </>
  )
}

function MedEditRow({ name, setName, factor, setFactor, conc, setConc, indic, setIndic, onSave, onCancel }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px', width:'100%' }}>
      <div style={{ display:'flex', gap:'8px' }}>
        <input style={{ ...S.input, flex:2, fontSize:'13px', padding:'7px 10px' }} value={name} onChange={e => setName(e.target.value)} />
        <input style={{ ...S.input, flex:'0 0 80px', fontSize:'13px', padding:'7px 10px' }} type="number" step="0.0001" value={factor} onChange={e => setFactor(e.target.value)} />
      </div>
      <div style={{ display:'flex', gap:'8px' }}>
        <input style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} placeholder="Concentration" value={conc} onChange={e => setConc(e.target.value)} />
        <input style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} placeholder="Indication" value={indic} onChange={e => setIndic(e.target.value)} />
      </div>
      <div style={{ display:'flex', gap:'8px' }}>
        <button style={S.actionBtnGreen} onClick={onSave}>Save</button>
        <button style={S.actionBtnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
