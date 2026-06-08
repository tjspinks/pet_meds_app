import { useState, useMemo } from 'react'
import { toLbs } from '../lib/dataService'

export function MetricChart({ exams, metricKey, unit, isKg }) {
  const [tooltip, setTooltip] = useState(null)

  const W = 560, H = 160
  const PAD_L = 44, PAD_R = 14, PAD_T = 14, PAD_B = 32
  const cW = W - PAD_L - PAD_R
  const cH = H - PAD_T - PAD_B

  const points = useMemo(() => {
    return exams
      .filter(e => e.metrics.some(m => m.metric === metricKey))
      .map(e => {
        const m = e.metrics.find(mm => mm.metric === metricKey)
        let val = m.value
        if (metricKey === 'weight_kg' && !isKg) val = toLbs(val)
        return { val, label: e.label, recorded_at: e.recorded_at }
      })
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
  }, [exams, metricKey, isKg])

  if (points.length < 2) {
    return (
      <div style={{ textAlign:'center', padding:'24px 0', color:'#9a8a7a', fontSize:'13px' }}>
        {points.length === 0
          ? `No ${unit} data recorded yet.`
          : 'Need at least 2 data points to show a chart.'}
      </div>
    )
  }

  const vals = points.map(p => p.val)
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  const spread = maxVal - minVal || 0.5
  const padV = spread * 0.18

  const xOf = i => PAD_L + (i / Math.max(points.length - 1, 1)) * cW
  const yOf = v => PAD_T + cH - ((v - (minVal - padV)) / (spread + padV * 2)) * cH

  const ptCoords = points.map((p, i) => ({ x: xOf(i), y: yOf(p.val), p }))
  const polyline = ptCoords.map(p => `${p.x},${p.y}`).join(' ')

  const tickCount = 3
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (minVal - padV) + ((spread + padV * 2) * i / tickCount)
    return { v: Math.round(v * 10) / 10, y: PAD_T + cH - (i / tickCount) * cH }
  })

  const xLabelIdx = points.length <= 5
    ? points.map((_, i) => i)
    : [0,1,2,3,4].map(i => Math.round(i * (points.length - 1) / 4))

  const displayUnit = metricKey === 'weight_kg' ? (isKg ? 'kg' : 'lbs') : unit

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', overflow:'visible' }}
      onMouseLeave={() => setTooltip(null)}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={t.y} x2={PAD_L + cW} y2={t.y} stroke="#ede6dd" strokeWidth="1" />
          <text x={PAD_L - 5} y={t.y + 4} textAnchor="end" fontSize="9" fill="#9a8a7a">{t.v}</text>
        </g>
      ))}
      {xLabelIdx.map(i => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9a8a7a">
          {points[i]?.label}
        </text>
      ))}
      <polygon
        points={`${PAD_L},${PAD_T + cH} ${polyline} ${PAD_L + cW},${PAD_T + cH}`}
        fill="#3d6b52" fillOpacity="0.07"
      />
      <polyline points={polyline} fill="none" stroke="#3d6b52" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {ptCoords.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#3d6b52" stroke="#fff" strokeWidth="1.5" />
          <circle cx={p.x} cy={p.y} r="14" fill="transparent" style={{ cursor:'crosshair' }}
            onMouseEnter={() => setTooltip(p)} />
        </g>
      ))}
      {tooltip && <ChartTooltip tooltip={tooltip} displayUnit={displayUnit} PAD_L={PAD_L} PAD_T={PAD_T} cW={cW} />}
    </svg>
  )
}

function ChartTooltip({ tooltip, displayUnit, PAD_L, PAD_T, cW }) {
  const tx = Math.min(Math.max(tooltip.x, PAD_L + 32), PAD_L + cW - 32)
  const ty = tooltip.y > PAD_T + 36 ? tooltip.y - 34 : tooltip.y + 14
  return (
    <g>
      <rect x={tx - 36} y={ty - 13} width="72" height="26" rx="6" fill="#2a3d30" opacity="0.92" />
      <text x={tx} y={ty} textAnchor="middle" fontSize="12" fontWeight="700" fill="#e8f5ec">
        {tooltip.p.val} {displayUnit}
      </text>
      <text x={tx} y={ty + 11} textAnchor="middle" fontSize="9" fill="#9ac8b0">
        {tooltip.p.label}
      </text>
    </g>
  )
}
