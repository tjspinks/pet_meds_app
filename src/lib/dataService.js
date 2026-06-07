/**
 * dataService.js — v4
 * Exam-based metric system. Treatments are decoupled from weight.
 * Weight (and all vitals) live in exams/exam_metrics.
 */

import { supabase } from './supabase'

const LS_LOG         = 'vt_log'
const LS_MEDS        = 'vt_meds'
const LS_ANIMALS     = 'vt_animals'
const LS_EXAMS       = 'vt_exams'
const LS_METRICS_DEF = 'vt_metric_defs'
const LS_SETTINGS    = 'vt_settings'

// ─── localStorage helpers ─────────────────────────────────────
function lsGet(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback }
  catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Unit helpers ─────────────────────────────────────────────
export const toKg  = lbs => Math.round((lbs / 2.205) * 1000) / 1000
export const toLbs = kg  => Math.round((kg  * 2.205) * 100)  / 100

// ─── Connection ───────────────────────────────────────────────
export async function checkSupabase() {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('treatments').select('id').limit(1)
    return !error
  } catch { return false }
}

// ─── Settings ─────────────────────────────────────────────────
export function loadSettings() { return lsGet(LS_SETTINGS, { weightUnit: 'kg' }) }
export function saveSettings(s) { lsSet(LS_SETTINGS, s) }

// ─── Metric definitions ───────────────────────────────────────
export const DEFAULT_METRIC_DEFS = [
  { key: 'weight_kg',  label: 'Weight',      unit: 'kg',  is_dose_weight: true,  display_order: 1 },
  { key: 'length_cm',  label: 'Length',       unit: 'cm',  is_dose_weight: false, display_order: 2 },
  { key: 'temp_f',     label: 'Temperature',  unit: '°F',  is_dose_weight: false, display_order: 3 },
  { key: 'age_weeks',  label: 'Age',          unit: 'wks', is_dose_weight: false, display_order: 4 },
]

export async function loadMetricDefs(useSupabase) {
  if (useSupabase) {
    try {
      const { data, error } = await supabase
        .from('metric_definitions').select('*').order('display_order')
      if (!error && data?.length) return data
    } catch { /* table may not exist yet — fall through */ }
  }
  const local = lsGet(LS_METRICS_DEF, null)
  return local?.length ? local : DEFAULT_METRIC_DEFS
}

export async function saveMetricDefs(defs, useSupabase) {
  lsSet(LS_METRICS_DEF, defs)
  if (useSupabase) {
    await supabase.from('metric_definitions').upsert(
      defs.map(d => ({ key: d.key, label: d.label, unit: d.unit, is_dose_weight: !!d.is_dose_weight, display_order: d.display_order })),
      { onConflict: 'key' }
    )
  }
}

export async function addMetricDef(def, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('metric_definitions')
      .insert({ key: def.key, label: def.label, unit: def.unit, is_dose_weight: !!def.is_dose_weight, display_order: def.display_order ?? 99 })
      .select().single()
    return data
  }
  return { ...def, id: Date.now() }
}

export async function deleteMetricDef(key, useSupabase) {
  if (useSupabase)
    await supabase.from('metric_definitions').delete().eq('key', key)
}

// ─── Medications ─────────────────────────────────────────────
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
    if (!error && data?.length) return data
  }
  return lsGet(LS_MEDS, DEFAULT_MEDS)
}

export async function saveMeds(meds, useSupabase) {
  lsSet(LS_MEDS, meds)
  if (useSupabase)
    await supabase.from('medications').upsert(
      meds.map(m => ({ name: m.name, factor: m.factor, concentration: m.concentration || null, indication: m.indication || null })),
      { onConflict: 'name' }
    )
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

// ─── Animals ─────────────────────────────────────────────────
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

// ─── Exams ────────────────────────────────────────────────────
/**
 * Load all exams for one animal, newest first, with metrics array.
 * Each exam: { id, animal_name, recorded_at, notes, label, metrics: [{ metric, value, unit }] }
 */
export async function loadExams(animalName, useSupabase) {
  if (useSupabase) {
    try {
      const { data: examRows, error } = await supabase
        .from('exams')
        .select('*, exam_metrics(*)')
        .eq('animal_name', animalName)
        .order('recorded_at', { ascending: false })
      if (!error && examRows) return examRows.map(formatExam)
    } catch { /* table may not exist yet */ }
  }
  // localStorage
  const all = lsGet(LS_EXAMS, [])
  return all
    .filter(e => e.animal_name === animalName)
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
    .map(formatExam)
}

/**
 * Load latest exam per animal for the animals list / calculator autofill.
 * Returns map: { animalName: exam }
 */
export async function loadLatestExams(useSupabase) {
  if (useSupabase) {
    try {
      // Get the most recent exam per animal with its metrics
      const { data, error } = await supabase
        .from('exams')
        .select('*, exam_metrics(*)')
        .order('recorded_at', { ascending: false })
      if (!error && data) {
        const map = {}
        data.forEach(row => {
          if (!map[row.animal_name]) map[row.animal_name] = formatExam(row)
        })
        return map
      }
    } catch { /* table may not exist yet */ }
  }
  // localStorage
  const all = lsGet(LS_EXAMS, [])
  const map = {}
  all.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
    .forEach(e => { if (!map[e.animal_name]) map[e.animal_name] = formatExam(e) })
  return map
}

function formatExam(row) {
  const metrics = (row.exam_metrics || []).map(m => ({
    id: m.id, metric: m.metric, value: m.value, unit: m.unit
  }))
  return {
    id:          row.id,
    animal_name: row.animal_name,
    recorded_at: row.recorded_at,
    notes:       row.notes || '',
    label:       new Date(row.recorded_at).toLocaleDateString(),
    metrics,
  }
}

export async function saveExam(exam, useSupabase) {
  // exam = { animal_name, recorded_at, notes, metrics: [{ metric, value, unit }] }
  if (useSupabase) {
    const { data: examRow } = await supabase.from('exams')
      .insert({ animal_name: exam.animal_name, recorded_at: exam.recorded_at, notes: exam.notes || null })
      .select().single()
    if (exam.metrics?.length) {
      await supabase.from('exam_metrics').insert(
        exam.metrics.map(m => ({ exam_id: examRow.id, metric: m.metric, value: m.value, unit: m.unit || null }))
      )
    }
    return formatExam({ ...examRow, exam_metrics: exam.metrics?.map((m,i) => ({ ...m, id: i })) || [] })
  }
  // localStorage
  const saved = {
    ...exam,
    id: Date.now(),
    exam_metrics: exam.metrics || [],
  }
  const all = lsGet(LS_EXAMS, [])
  lsSet(LS_EXAMS, [...all, saved])
  return formatExam(saved)
}

export async function deleteExam(id, useSupabase) {
  if (useSupabase)
    await supabase.from('exams').delete().eq('id', id) // cascade deletes metrics
  else {
    const all = lsGet(LS_EXAMS, [])
    lsSet(LS_EXAMS, all.filter(e => e.id !== id))
  }
}

// ─── Treatments ───────────────────────────────────────────────
export async function loadTreatments(useSupabase) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('treatments').select('*').order('created_at', { ascending: false })
    if (!error && data) return data.map(r => ({
      id:         r.id,
      timestamp:  new Date(r.created_at).toLocaleString(),
      animalName: r.animal_name,
      medication: r.medication,
      dose:       r.dose,
      notes:      r.notes || '',
    }))
  }
  return lsGet(LS_LOG, [])
}

export async function addTreatment(entry, useSupabase) {
  if (useSupabase) {
    const { data } = await supabase.from('treatments').insert({
      animal_name: entry.animalName,
      medication:  entry.medication,
      dose:        entry.dose,
      notes:       entry.notes || null,
    }).select().single()
    return { ...entry, id: data.id }
  }
  return entry
}

export function saveTreatmentsLocal(treatments) { lsSet(LS_LOG, treatments) }

// ─── CSV medication import ────────────────────────────────────
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

// ─── Export / Import ─────────────────────────────────────────
export function exportJSON(treatments, meds, animals, exams, metricDefs) {
  const payload = {
    exportedAt: new Date().toISOString(), version: 4,
    medications: meds, animals, treatments, exams, metricDefs,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  download(blob, `vet-tracker-export-${dateStr()}.json`)
}

export function exportCSV(treatments) {
  const header = 'Timestamp,Animal Name,Medication,Dose (mL)'
  const rows   = treatments.map(t =>
    [t.timestamp, `"${t.animalName}"`, `"${t.medication}"`, t.dose].join(',')
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
        const { treatments = [], medications = [], animals = [], exams = [], metricDefs = [] } = parsed
        if (useSupabase) {
          if (medications.length)
            await supabase.from('medications').upsert(
              medications.map(m => ({ name: m.name, factor: m.factor, concentration: m.concentration||null, indication: m.indication||null })),
              { onConflict: 'name' }
            )
          if (animals.length)
            await supabase.from('animals').upsert(
              animals.map(a => ({ name: a.name, photo_url: a.photo_url||null, notes: a.notes||null })),
              { onConflict: 'name' }
            )
          if (treatments.length)
            await supabase.from('treatments').insert(
              treatments.map(t => ({
                animal_name: t.animalName,
                medication:  t.medication,
                dose:        t.dose,
                created_at:  t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString(),
              }))
            )
        }
        resolve({ treatments, medications, animals, exams, metricDefs })
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
