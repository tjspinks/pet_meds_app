import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  const [status, setStatus] = useState('checking...')
  const [animals, setAnimals] = useState([])
  const [treatments, setTreatments] = useState([])

  useEffect(() => {
    async function init() {
      if (!supabase) { setStatus('No Supabase configured'); return }
      try {
        const { data: a } = await supabase.from('animals').select('*')
        const { data: t } = await supabase.from('treatments').select('*').order('created_at', { ascending: false })
        setAnimals(a || [])
        setTreatments(t || [])
        setStatus('connected')
      } catch (e) {
        setStatus('error: ' + e.message)
      }
    }
    init()
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '700px', margin: '0 auto' }}>
      <h1>🐾 Vet Tracker — Minimal</h1>
      <p>Status: <strong>{status}</strong></p>
      <h2>Animals ({animals.length})</h2>
      <ul>{animals.map(a => <li key={a.id || a.name}>{a.name}</li>)}</ul>
      <h2>Treatments ({treatments.length})</h2>
      <ul>{treatments.slice(0, 10).map(t => (
        <li key={t.id}>{t.animal_name} — {t.medication} — {t.dose} mL</li>
      ))}</ul>
    </div>
  )
}
