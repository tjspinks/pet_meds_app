import { useState, useMemo, useEffect } from 'react'
import { S } from './styles'
import { toKg, toLbs } from '../lib/dataService'

function calcDose(weightKg, medName, meds) {
  const med = meds.find(m => m.name === medName)
  if (!med || !weightKg || isNaN(weightKg) || parseFloat(weightKg) <= 0) return null
  return (parseFloat(weightKg) * med.factor).toFixed(2)
}

export function Calculator({
  meds, knownAnimals, isKg,
  animalName, setAnimalName,
  weightInput, setWeightInput,
  medication, setMedication,
  nameLocked, weightLocked, setWeightLocked,
  onClearLock, onSave,
}) {
  const [showSuggestions, setShowSuggestions] = useState(false)

  const inputToKg = v => {
    const n = parseFloat(v); if (isNaN(n)) return null
    return isKg ? n : toKg(n)
  }
  const kgToDisplay = kg => {
    if (kg == null) return ''
    return isKg ? kg : toLbs(kg)
  }

  const weightKg = inputToKg(weightInput)
  const dose = weightKg ? calcDose(weightKg, medication, meds) : null
  const activeMed = meds.find(m => m.name === medication)

  const suggestions = useMemo(() => {
    if (!animalName.trim() || nameLocked) return []
    return Object.keys(knownAnimals).filter(n =>
      n.toLowerCase().includes(animalName.toLowerCase())
    )
  }, [animalName, knownAnimals, nameLocked])

  useEffect(() => {
    if (!nameLocked && animalName.trim()) {
      const kg = knownAnimals[animalName.trim()]
      if (kg != null) setWeightInput(String(kgToDisplay(kg)))
    }
  }, [animalName, isKg])

  return (
    <div style={S.card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
        <h2 style={S.cardTitle}>Dose Calculator</h2>
        {(nameLocked || weightLocked) && (
          <button onClick={onClearLock} style={S.clearBtn}>✕ New animal</button>
        )}
      </div>
      <p style={S.cardDesc}>
        {nameLocked
          ? `Locked on ${animalName} — change med and save again.`
          : 'Type a name to auto-fill weight from latest exam.'}
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
                onMouseDown={() => {
                  const kg = knownAnimals[n]
                  setAnimalName(n)
                  if (kg != null) setWeightInput(String(kgToDisplay(kg)))
                  setShowSuggestions(false)
                }}>
                <span style={{ fontWeight:600 }}>🐱 {n}</span>
                {knownAnimals[n] != null && (
                  <span style={{ color:'#9a8a7a', fontSize:'12px' }}>
                    {isKg ? `${knownAnimals[n]} kg` : `${toLbs(knownAnimals[n])} lbs`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weight */}
      <div style={{ marginBottom:'14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
          <div style={S.fieldLabel}>Body Weight ({isKg ? 'kg' : 'lbs'})</div>
          {weightLocked && (
            <button onClick={() => setWeightLocked(false)} style={S.editBtn}>✎ Edit</button>
          )}
          {weightInput && weightKg && (
            <div style={{ marginLeft:'auto', fontSize:'11px', color:'#9a8a7a' }}>
              = {isKg ? `${toLbs(weightKg)} lbs` : `${weightKg} kg`}
            </div>
          )}
        </div>
        <input
          style={{ ...S.input, ...(weightLocked ? S.inputLocked : {}) }}
          type="number" step="0.01"
          placeholder={isKg ? 'e.g. 4.2' : 'e.g. 9.3'}
          value={weightInput}
          readOnly={weightLocked}
          onChange={e => setWeightInput(e.target.value)}
        />
      </div>

      {/* Medication */}
      <div style={{ marginBottom:'20px' }}>
        <div style={S.fieldLabel}>Medication</div>
        <select style={S.select} value={medication} onChange={e => setMedication(e.target.value)}>
          {meds.map(m => (
            <option key={m.name} value={m.name}>
              {m.name}{m.indication ? ` — ${m.indication}` : ''}
            </option>
          ))}
        </select>
        {activeMed?.indication && (
          <div style={{ fontSize:'11px', color:'#9a8a7a', marginTop:'5px' }}>
            {activeMed.concentration && <span style={{ marginRight:'10px' }}>💊 {activeMed.concentration}</span>}
            <span>🎯 {activeMed.indication}</span>
          </div>
        )}
      </div>

      {/* Dose */}
      <div style={S.doseBox}>
        <div style={S.doseLabel}>Calculated Dose</div>
        <div style={S.doseValue}>{dose ? `${dose} mL` : '—'}</div>
        {dose && activeMed && (
          <div style={S.doseFormula}>
            {weightInput} {isKg ? 'kg' : 'lbs'} {!isKg && `(${weightKg} kg)`} × {activeMed.factor} = {dose} mL
          </div>
        )}
      </div>

      <button style={S.saveBtn} onClick={() => onSave(weightKg, dose)}>
        {nameLocked ? `Save (${animalName} · ${medication.split(' ')[0]}) →` : 'Save to Treatment Log →'}
      </button>
    </div>
  )
}
