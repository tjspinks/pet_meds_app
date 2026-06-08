import { S, getMedColor } from './styles'
import { toLbs } from '../lib/dataService'

export function AnimalsList({ animalProfiles, meds, isKg, onSelect }) {
  return (
    <div>
      <div style={S.card}>
        <h2 style={S.cardTitle}>Animals</h2>
        <p style={S.cardDesc}>
          {animalProfiles.length === 0
            ? 'No animals yet.'
            : `${animalProfiles.length} animal${animalProfiles.length !== 1 ? 's' : ''} tracked.`}
        </p>
      </div>
      <div style={S.animalGrid}>
        {animalProfiles.map(profile => (
          <AnimalCard key={profile.name} profile={profile} meds={meds} isKg={isKg} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function AnimalCard({ profile, meds, isKg, onSelect }) {
  return (
    <div style={{ ...S.animalCard, cursor:'pointer' }}
      onClick={() => onSelect(profile)}
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
          {profile.latestWeightKg != null && !profile.weightFromExam && (
            <span style={{ color:'#c8a84a', fontSize:'10px', marginLeft:'5px' }}>from treatment</span>
          )}
          {' · '}{profile.history.length} treatment{profile.history.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ color:'#ccc', fontSize:'18px', alignSelf:'center' }}>›</div>
    </div>
  )
}

export function LogTab({ log, animalCount, meds, onSelectAnimal }) {
  return (
    <div>
      <div style={S.card}>
        <h2 style={S.cardTitle}>Treatment Log</h2>
        <p style={S.cardDesc}>
          {log.length === 0
            ? 'No treatments recorded yet.'
            : `${log.length} treatment${log.length !== 1 ? 's' : ''} · ${animalCount} animal${animalCount !== 1 ? 's' : ''}`}
        </p>
      </div>
      {log.length > 0 && (
        <div style={S.card}>
          <div style={{ overflowX:'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Timestamp','Animal','Medication','Dose (mL)'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map(e => (
                  <tr key={e.id} style={{ ...S.tr, cursor:'pointer' }}
                    onClick={() => onSelectAnimal({ name: e.animalName })}
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
  )
}
