/**
 * dataService.js
 * All storage logic lives here. Swap this file to change backends.
 */

import { supabase } from './supabase'

const LS_LOG         = 'vt_log'
const LS_MEDS        = 'vt_meds'
const LS_ANIMALS     = 'vt_animals'
const LS_WEIGHT_LOGS = 'vt_weight_logs'
const LS_SETTINGS    = 'vt_settings'

// ─── localStorage helpers ─────────────────────────────────────────────────────
function lsGet(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback }
  catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────
export const toKg  = lbs => Math.round((lbs / 2.205) * 1000) / 1000
export const toLbs = kg  => Math.round((kg  * 2.205) * 100)  / 100

// ─── Connection check ─────────────────────────────────────────────────────────
export async function checkSupabase() {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('treatments').select('id').limit(1)
    return !error
  } catch { return false }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export function loadSettings() {
  return lsGet(LS_SETTINGS, { weightUnit: 'kg' })
}
export function saveSettings(s) { lsSet(LS_SETTINGS, s) }

// ─── Medications ─────────────────────────────────────────────────────────────
export const DEFAULT_MEDS = [
  { name: 'Diclazuril 1%',                  concentration: '10 mg/mL',  indication: 'Coccidia',                             factor: 0.1102 },
  { name: 'Diclazuril 5%',                  concentration: '50 mg/mL',  indication: 'Coccidia',                             factor: 0.0999 },
  { name: 'Metronidazole 10% HIGH',          concentration: '100 mg/mL', indication: 'Bacteria / Giardia',                   factor: 0.2646 },
  { name: 'Metronidazole 10% LOW',           concentration: '100 mg/mL', indication: 'Bacteria / Giardia',                   factor: 0.2205 },
  { name: 'Ponazuril 10%',                   concentration: '100 mg/mL', indication: 'Coccidia',                             factor: 0.2998 },
  { name: 'Praziquantel 5% HIGH',            concentration: '50 mg/mL',  indication: 'Tapeworms',                            factor: 0.2006 },
  { name: 'Praziquantel 5% LOW',             concentration: '50 mg/mL',  indication: 'Tapeworms',                            factor: 0.0992 },
  { name: 'Ronidazole 10%',                  concentration: '100 mg/mL', indication: 'Tritrichomonas foetus',                factor: 0.2998 },
  { name: 'Selamectin 12%',                  concentration: '120 mg/mL', indication: 'Fleas / Mites / Hookworms',            factor: 0.0507 },
  { name: 'Toltrazuril (standard)',          concentration: '50 mg/mL',  indication: 'Coccidia',                             factor: 0.1102 },
  { name: 'Toltrazuril 5%',                  concentration: '50 mg/mL',  indication: 'Coccidia',                             factor: 0.3968 },
  { name: 'Toltrazuril 10%',                 concentration: '100 mg/mL', indication: 'Coccidia (Concentrated)',              factor: 0.2205 },
  { name: 'Tylosin 10%',                     concentration: '100 mg/mL', indication: 'Clostridium / IBIP',                   factor: 0.1102 },
  { name: 'Tinidazole 5%',                   concentration: '50 mg/mL',  indication: 'Giardia / Resistant Protozoa',         factor: 0.5997 },
  { name: 'Fenbendazole 10% (Clean Sweep)',  concentration: '100 mg/mL', indication: 'Roundworms / Hookworms',               factor: 0.5004 },
  { name: 'Nitenpyram 5% (Flea Shield)',     concentration: '50 mg/mL',  indication: 'Fleas (Rapid Action)',                 factor: 0.0198 },
  { name: 'Ivermectin 1% Liquid',            concentration: '10 mg/mL',  indication: 'Mites / Heartworm Microfilaria',       factor: 0.0441 },
  { name: 'Spectinomycin 5%',                concentration: '50 mg/mL',  indication: 'Enteritis / Bacterial Gut Infections', factor: 0.4409 },
]

export async function loadMeds(useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase.from('medications').select('*').order('name')
    if (!error && data?.length > 0)
      return data.map(r => ({ id: r.id, name: r.name, factor: r.factor, concentration: r.concentration, indication: r.indication }))
  }
  return lsGet(LS_MEDS, DEFAULT_MEDS)
}

export async function saveMeds(meds, useSupabase) {
  lsSet(LS_MEDS, meds)
  if (useSupabase) {
    await supabase.from('medications').upsert(
      meds.map(m => ({ name: m.name, factor: m.factor, concentration: m.concentration || null, indication: m.indication || null })),
      { onConflict: 'name' }
    )
  }
}

export async function addMed(med, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('medications')
      .insert({ name: med.name, factor: med.factor, concentration: med.concentration || null, indication: med.indication || null })
      .select().single()
    return data
  }
  return { ...med, id: Date.now() }
}

export async function updateMed(med, useSupabase) {
  if (useSupabase && med.id)
    await supabase.from('medications')
      .update({ name: med.name, factor: med.factor, concentration: med.concentration || null, indication: med.indication || null })
      .eq('id', med.id)
}

export async function deleteMed(med, useSupabase) {
  if (useSupabase && med.id)
    await supabase.from('medications').delete().eq('id', med.id)
}

// ─── Animals ──────────────────────────────────────────────────────────────────
export async function loadAnimals(useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase.from('animals').select('*').order('name')
    if (!error && data) return data
  }
  return lsGet(LS_ANIMALS, [])
}

export async function upsertAnimal(animal, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('animals')
      .upsert({ name: animal.name, photo_url: animal.photo_url ?? null, notes: animal.notes ?? null }, { onConflict: 'name' })
      .select().single()
    return data
  }
  const list = lsGet(LS_ANIMALS, [])
  const updated = list.find(a => a.name === animal.name)
    ? list.map(a => a.name === animal.name ? { ...a, ...animal } : a)
    : [...list, { ...animal, id: Date.now() }]
  lsSet(LS_ANIMALS, updated)
  return animal
}

export async function uploadAnimalPhoto(animalName, file) {
  if (!supabase) return null
  try {
    const ext  = file.name.split('.').pop()
    const path = `${animalName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('animal-photos').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('animal-photos').getPublicUrl(path)
    return data.publicUrl
  } catch { return null }
}

// ─── Weight logs ──────────────────────────────────────────────────────────────
export async function loadWeightLogs(animalName, useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('animal_name', animalName)
      .order('recorded_at', { ascending: true })
    if (!error && data) return data.map(r => ({
      id: r.id,
      animal_name: r.animal_name,
      weight_kg:   r.weight_kg,
      weight_lbs:  r.weight_lbs ?? toLbs(r.weight_kg),
      recorded_at: r.recorded_at,
      label:       new Date(r.recorded_at).toLocaleDateString(),
    }))
  }
  // localStorage fallback: filter from all weight logs
  const all = lsGet(LS_WEIGHT_LOGS, [])
  return all
    .filter(r => r.animal_name === animalName)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
}

export async function addWeightLog(entry, useSupabase) {
  const row = {
    animal_name: entry.animal_name,
    weight_kg:   entry.weight_kg,
    weight_lbs:  toLbs(entry.weight_kg),
    recorded_at: entry.recorded_at || new Date().toISOString(),
    label:       new Date(entry.recorded_at || Date.now()).toLocaleDateString(),
  }
  if (useSupabase) {
    const { data } = await supabase.from('weight_logs')
      .insert({ animal_name: row.animal_name, weight_kg: row.weight_kg, recorded_at: row.recorded_at })
      .select().single()
    return { ...row, id: data.id }
  }
  const saved = { ...row, id: Date.now() }
  const all = lsGet(LS_WEIGHT_LOGS, [])
  lsSet(LS_WEIGHT_LOGS, [...all, saved])
  return saved
}

export async function deleteWeightLog(id, useSupabase) {
  if (useSupabase) {
    await supabase.from('weight_logs').delete().eq('id', id)
  } else {
    const all = lsGet(LS_WEIGHT_LOGS, [])
    lsSet(LS_WEIGHT_LOGS, all.filter(r => r.id !== id))
  }
}

// ─── Treatments ───────────────────────────────────────────────────────────────
export async function loadTreatments(useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('treatments').select('*').order('created_at', { ascending: false })
    if (!error && data) return data.map(r => ({
      id:          r.id,
      timestamp:   new Date(r.created_at).toLocaleString(),
      animalName:  r.animal_name,
      weight_kg:   r.weight_kg,
      weight_lbs:  r.weight_lbs ?? toLbs(r.weight_kg),
      medication:  r.medication,
      dose:        r.dose,
      notes:       r.notes || '',
    }))
  }
  const raw = lsGet(LS_LOG, [])
  return raw.map(r => ({
    ...r,
    weight_kg:  r.weight_kg  ?? toKg(r.weight ?? 0),
    weight_lbs: r.weight_lbs ?? (r.weight ?? toLbs(r.weight_kg ?? 0)),
  }))
}

export async function addTreatment(entry, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('treatments').insert({
      animal_name: entry.animalName,
      weight_kg:   entry.weight_kg,
      medication:  entry.medication,
      dose:        entry.dose,
      notes:       entry.notes || null,
    }).select().single()
    return { ...entry, id: data.id, weight_lbs: data.weight_lbs ?? toLbs(entry.weight_kg) }
  }
  return entry
}

export function saveTreatmentsLocal(treatments) { lsSet(LS_LOG, treatments) }

// ─── CSV medication import ────────────────────────────────────────────────────
export function parseMedCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  const cols  = lines[0].toLowerCase().split(',').map(c => c.trim().replace(/['"]/g, ''))
  const nameIdx   = cols.findIndex(c => c.includes('med') || c === 'name')
  const factorIdx = cols.findIndex(c => c.includes('factor') || c.includes('dose'))
  const concIdx   = cols.findIndex(c => c.includes('conc'))
  const indicIdx  = cols.findIndex(c => c.includes('indic') || c.includes('target'))
  if (nameIdx === -1 || factorIdx === -1) throw new Error('CSV must have name and factor columns')
  return lines.slice(1).map(line => {
    const parts = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    return {
      name:          parts[nameIdx] || '',
      factor:        parseFloat(parts[factorIdx]) || 0,
      concentration: concIdx  >= 0 ? parts[concIdx]  : '',
      indication:    indicIdx >= 0 ? parts[indicIdx] : '',
    }
  }).filter(m => m.name && m.factor > 0)
}

// ─── Export / Import ──────────────────────────────────────────────────────────
export function exportJSON(treatments, meds, animals, weightLogs) {
  const payload = {
    exportedAt: new Date().toISOString(), version: 3,
    medications: meds, animals, treatments, weightLogs,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  download(blob, `vet-tracker-export-${dateStr()}.json`)
}

export function exportCSV(treatments) {
  const header = 'Timestamp,Animal Name,Weight (kg),Weight (lbs),Medication,Dose (mL)'
  const rows   = treatments.map(t =>
    [t.timestamp, `"${t.animalName}"`, t.weight_kg, t.weight_lbs, `"${t.medication}"`, t.dose].join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  download(blob, `vet-tracker-export-${dateStr()}.csv`)
}

export async function importJSON(file, useSupabase) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target.result)
        const { treatments = [], medications = [], animals = [], weightLogs = [] } = parsed
        if (useSupabase) {
          if (medications.length)
            await supabase.from('medications').upsert(
              medications.map(m => ({ name: m.name, factor: m.factor, concentration: m.concentration || null, indication: m.indication || null })),
              { onConflict: 'name' }
            )
          if (animals.length)
            await supabase.from('animals').upsert(
              animals.map(a => ({ name: a.name, photo_url: a.photo_url || null, notes: a.notes || null })),
              { onConflict: 'name' }
            )
          if (weightLogs.length)
            await supabase.from('weight_logs').insert(
              weightLogs.map(w => ({ animal_name: w.animal_name, weight_kg: w.weight_kg, recorded_at: w.recorded_at || new Date().toISOString() }))
            )
          if (treatments.length)
            await supabase.from('treatments').insert(
              treatments.map(t => ({
                animal_name: t.animalName,
                weight_kg:   t.weight_kg ?? toKg(t.weight ?? 0),
                medication:  t.medication,
                dose:        t.dose,
                created_at:  t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString(),
              }))
            )
        }
        resolve({ treatments, medications, animals, weightLogs })
      } catch(err) { reject(err) }
    }
    reader.readAsText(file)
  })
}

function dateStr() { return new Date().toISOString().slice(0, 10) }
function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
