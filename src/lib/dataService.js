/**
 * dataService.js
 *
 * Unified data layer. When Supabase is available and reachable, it uses that.
 * Falls back to localStorage automatically if offline or Supabase isn't configured.
 *
 * To swap to a different backend later, only this file needs to change.
 */

import { supabase } from './supabase'

const LS_LOG = 'vt_log'
const LS_MEDS = 'vt_meds'

// ─── localStorage helpers ────────────────────────────────────────────────────

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Connection check ────────────────────────────────────────────────────────

export async function checkSupabase() {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('treatments').select('id').limit(1)
    return !error
  } catch { return false }
}

// ─── Medications ─────────────────────────────────────────────────────────────

const DEFAULT_MEDS = [
  { name: 'Toltrazuril (standard)', factor: 0.05 },
  { name: 'Toltrazuril 5%', factor: 0.18 },
  { name: 'Diclazuril 1%', factor: 0.05 },
  { name: 'Metronidazole 10%', factor: 0.72 },
  { name: 'Tylosin 10%', factor: 0.05 },
]

export async function loadMeds(useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase.from('medications').select('*').order('name')
    if (!error && data.length > 0) return data.map(r => ({ id: r.id, name: r.name, factor: r.factor }))
  }
  return lsGet(LS_MEDS, DEFAULT_MEDS)
}

export async function saveMeds(meds, useSupabase) {
  lsSet(LS_MEDS, meds) // always write locally too
  if (useSupabase) {
    // upsert all meds by name
    await supabase.from('medications').upsert(
      meds.map(m => ({ name: m.name, factor: m.factor })),
      { onConflict: 'name' }
    )
  }
}

export async function addMed(med, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('medications').insert({ name: med.name, factor: med.factor }).select().single()
    return data
  }
  return { ...med, id: Date.now() }
}

export async function updateMed(med, useSupabase) {
  if (useSupabase && med.id) {
    await supabase.from('medications').update({ name: med.name, factor: med.factor }).eq('id', med.id)
  }
}

export async function deleteMed(med, useSupabase) {
  if (useSupabase && med.id) {
    await supabase.from('medications').delete().eq('id', med.id)
  }
}

// ─── Treatments ──────────────────────────────────────────────────────────────

export async function loadTreatments(useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('treatments')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) return data.map(r => ({
      id: r.id,
      timestamp: new Date(r.created_at).toLocaleString(),
      animalName: r.animal_name,
      weight: r.weight,
      medication: r.medication,
      dose: r.dose,
    }))
  }
  return lsGet(LS_LOG, [])
}

export async function addTreatment(entry, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('treatments').insert({
      animal_name: entry.animalName,
      weight: entry.weight,
      medication: entry.medication,
      dose: entry.dose,
    }).select().single()
    return { ...entry, id: data.id }
  }
  return entry
}

export function saveTreatmentsLocal(treatments) {
  lsSet(LS_LOG, treatments)
}

// ─── Import / Export ─────────────────────────────────────────────────────────

export function exportJSON(treatments, meds) {
  const payload = { exportedAt: new Date().toISOString(), medications: meds, treatments }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  download(blob, `vet-tracker-export-${dateStr()}.json`)
}

export function exportCSV(treatments) {
  const header = 'Timestamp,Animal Name,Weight (lbs),Medication,Dose (mL)'
  const rows = treatments.map(t =>
    [t.timestamp, `"${t.animalName}"`, t.weight, `"${t.medication}"`, t.dose].join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  download(blob, `vet-tracker-export-${dateStr()}.csv`)
}

export async function importJSON(file, useSupabase) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const { treatments, medications } = JSON.parse(e.target.result)
        if (useSupabase) {
          if (medications?.length) {
            await supabase.from('medications').upsert(
              medications.map(m => ({ name: m.name, factor: m.factor })),
              { onConflict: 'name' }
            )
          }
          if (treatments?.length) {
            await supabase.from('treatments').insert(
              treatments.map(t => ({
                animal_name: t.animalName,
                weight: t.weight,
                medication: t.medication,
                dose: t.dose,
                created_at: t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString(),
              }))
            )
          }
        }
        resolve({ treatments: treatments || [], medications: medications || [] })
      } catch(err) { reject(err) }
    }
    reader.readAsText(file)
  })
}

function dateStr() {
  return new Date().toISOString().slice(0, 10)
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
