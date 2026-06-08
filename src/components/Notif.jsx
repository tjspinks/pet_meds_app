import { S } from './styles'

export function Notif({ message, type }) {
  if (!message) return null
  const bg = type === 'err' ? '#7a2020' : type === 'warn' ? '#6b5a20' : '#2a3d30'
  return <div style={{ ...S.notif, background: bg }}>{message}</div>
}
