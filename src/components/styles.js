// Shared styles for the app. Plain object, no hooks, no JSX.

export const PALETTE = ['#7c9e87','#6b8fa8','#b08a6e','#9b7eb0','#c47c7c','#a89b6b','#6b9ea8','#a86b8a','#7ea87c','#a87c6b','#8a7ca8','#6ba88a']

export function getMedColor(meds, name) {
  const idx = meds.findIndex(m => m.name === name)
  return PALETTE[idx % PALETTE.length] || '#888'
}

export const S = {
  root: { fontFamily:"'DM Sans','Nunito',sans-serif", background:'#f4f0eb', minHeight:'100vh', color:'#2a2018' },
  header: { background:'#2a3d30', color:'#e8f0e9', padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px' },
  logo: { fontSize:'22px' },
  title: { fontSize:'16px', fontWeight:700, letterSpacing:'-0.3px' },
  subtitle: { fontSize:'11px', opacity:0.6, marginTop:'1px' },
  backBtn: { background:'transparent', border:'none', color:'#e8f0e9', fontSize:'14px', fontWeight:600, cursor:'pointer', padding:'4px 8px', borderRadius:'6px', marginRight:'4px' },
  dbPill: { display:'flex', alignItems:'center', gap:'5px', borderRadius:'20px', padding:'3px 9px', fontSize:'11px', fontWeight:600, color:'#c8e6d0' },
  dbDot: { width:'6px', height:'6px', borderRadius:'50%' },
  logBadge: { background:'#3d6b52', color:'#c8e6d0', borderRadius:'20px', padding:'3px 9px', fontSize:'11px', fontWeight:600 },
  tabBar: { display:'flex', background:'#e8e2d9', borderBottom:'2px solid #d5ccc0', overflowX:'auto' },
  tabBtn: { flex:1, minWidth:'55px', padding:'10px 4px', border:'none', background:'transparent', cursor:'pointer', fontSize:'11px', fontWeight:600, color:'#7a6a5a', transition:'all 0.15s', borderBottom:'3px solid transparent', marginBottom:'-2px', whiteSpace:'nowrap' },
  tabBtnActive: { color:'#2a3d30', borderBottomColor:'#3d6b52', background:'#f4f0eb' },
  main: { padding:'12px', maxWidth:'700px', margin:'0 auto' },
  card: { background:'#fff', borderRadius:'14px', padding:'16px', marginBottom:'12px', boxShadow:'0 2px 12px rgba(42,32,24,0.07)', border:'1px solid #ede6dd' },
  cardTitle: { fontSize:'16px', fontWeight:700, margin:'0 0 5px', color:'#1e2d22' },
  cardDesc: { fontSize:'13px', color:'#7a6a5a', margin:'0 0 14px' },
  fieldLabel: { fontSize:'11px', fontWeight:700, color:'#5a4a3a', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' },
  input: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid #d5ccc0', fontSize:'15px', background:'#faf8f5', outline:'none', color:'#2a2018', fontFamily:'inherit', boxSizing:'border-box' },
  inputLocked: { background:'#f0ebe2', color:'#5a4a3a', borderColor:'#c8bfb0' },
  select: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid #d5ccc0', fontSize:'13px', background:'#faf8f5', outline:'none', color:'#2a2018', fontFamily:'inherit', cursor:'pointer' },
  doseBox: { background:'linear-gradient(135deg,#2a3d30 0%,#3d6b52 100%)', borderRadius:'12px', padding:'16px', textAlign:'center', marginBottom:'14px', color:'#e8f5ec' },
  doseLabel: { fontSize:'11px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', opacity:0.7 },
  doseValue: { fontSize:'36px', fontWeight:800, letterSpacing:'-1px', margin:'6px 0 3px' },
  doseFormula: { fontSize:'11px', opacity:0.6 },
  saveBtn: { width:'100%', padding:'13px', borderRadius:'10px', border:'none', background:'#3d6b52', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer' },
  clearBtn: { padding:'5px 12px', borderRadius:'20px', border:'1.5px solid #d5ccc0', background:'#faf8f5', color:'#7a6a5a', fontSize:'12px', fontWeight:600, cursor:'pointer' },
  editBtn: { padding:'4px 10px', borderRadius:'20px', border:'1.5px solid #b8d4c0', background:'#eef6f1', color:'#3d6b52', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  notif: { position:'fixed', top:'14px', left:'50%', transform:'translateX(-50%)', color:'#e8f5ec', padding:'10px 20px', borderRadius:'30px', fontSize:'13px', fontWeight:600, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', whiteSpace:'nowrap', maxWidth:'92vw', overflow:'hidden', textOverflow:'ellipsis' },
  dropdown: { position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1.5px solid #d5ccc0', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)', zIndex:100 },
  dropdownItem: { padding:'10px 14px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'14px', borderBottom:'1px solid #f0ebe4' },
  animalGrid: { display:'flex', flexDirection:'column', gap:'10px' },
  animalCard: { background:'#fff', borderRadius:'14px', padding:'14px', border:'1px solid #ede6dd', boxShadow:'0 2px 8px rgba(42,32,24,0.06)', display:'flex', alignItems:'center', gap:'14px' },
  animalCardPhoto: { flexShrink:0 },
  animalThumb: { width:'56px', height:'56px', borderRadius:'12px', objectFit:'cover' },
  animalThumbPlaceholder: { width:'56px', height:'56px', borderRadius:'12px', background:'#f0ebe4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px' },
  animalName: { fontSize:'15px', fontWeight:700, marginBottom:'3px' },
  animalMeta: { fontSize:'12px', color:'#9a8a7a' },
  medTag: { padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:700, border:'1px solid', whiteSpace:'nowrap' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'13px' },
  th: { textAlign:'left', padding:'8px 10px', color:'#7a6a5a', fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #ede6dd' },
  tr: { borderBottom:'1px solid #f0ebe4' },
  td: { padding:'9px 10px', color:'#2a2018' },
  statsRow: { display:'flex', gap:'10px', marginBottom:'12px' },
  statCard: { flex:1, background:'#fff', borderRadius:'12px', padding:'12px', textAlign:'center', border:'1px solid #ede6dd', boxShadow:'0 2px 8px rgba(42,32,24,0.06)' },
  statNum: { fontSize:'24px', fontWeight:800, color:'#2a3d30' },
  statLabel: { fontSize:'11px', color:'#9a8a7a', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginTop:'3px' },
  chartArea: { display:'flex', flexDirection:'column', gap:'10px', marginTop:'12px' },
  barRow: { display:'flex', alignItems:'center', gap:'8px' },
  barLabel: { fontSize:'11px', fontWeight:600, color:'#5a4a3a', width:'160px', flexShrink:0 },
  barTrack: { flex:1, height:'16px', background:'#f0ebe4', borderRadius:'10px', overflow:'hidden' },
  barFill: { height:'100%', borderRadius:'10px', minWidth:'3px' },
  barCount: { fontSize:'13px', fontWeight:700, width:'22px', textAlign:'right', color:'#3d6b52' },
  activityRow: { display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom:'1px solid #f0ebe4', fontSize:'13px' },
  activityDot: { width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 },
  activityTime: { marginLeft:'auto', fontSize:'11px', color:'#bbb', whiteSpace:'nowrap' },
  medList: { display:'flex', flexDirection:'column', gap:'7px', marginBottom:'4px' },
  medRow: { display:'flex', alignItems:'center', gap:'7px', padding:'10px 12px', background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd' },
  actionBtnGhost: { padding:'5px 9px', borderRadius:'7px', border:'1.5px solid #d5ccc0', background:'transparent', color:'#7a6a5a', fontSize:'12px', fontWeight:600, cursor:'pointer', flexShrink:0 },
  actionBtnGreen: { padding:'5px 9px', borderRadius:'7px', border:'1.5px solid #3d6b52', background:'#eef6f1', color:'#3d6b52', fontSize:'12px', fontWeight:700, cursor:'pointer' },
  actionBtnRed: { padding:'5px 9px', borderRadius:'7px', border:'1.5px solid #e0b0b0', background:'#fdf0f0', color:'#b05050', fontSize:'12px', fontWeight:700, cursor:'pointer', flexShrink:0 },
  settingRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid #f0ebe4' },
  toggle: { display:'flex', background:'#f0ebe4', borderRadius:'20px', padding:'3px' },
  toggleBtn: { padding:'5px 14px', borderRadius:'17px', border:'none', background:'transparent', fontSize:'13px', fontWeight:600, cursor:'pointer', color:'#7a6a5a' },
  toggleBtnActive: { background:'#2a3d30', color:'#e8f5ec' },
  exportBtn: { display:'flex', flexDirection:'column', gap:'3px', width:'100%', padding:'14px 16px', borderRadius:'10px', border:'1.5px solid #d5ccc0', background:'#faf8f5', color:'#2a2018', fontSize:'14px', fontWeight:700, cursor:'pointer', textAlign:'left' },
  exportSub: { fontSize:'11px', color:'#9a8a7a', fontWeight:400 },
  photoContainer: { display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', flexShrink:0 },
  photo: { width:'96px', height:'96px', borderRadius:'14px', objectFit:'cover', border:'2px solid #ede6dd' },
  photoPlaceholder: { width:'96px', height:'96px', borderRadius:'14px', background:'#f0ebe4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'44px', border:'2px dashed #d5ccc0' },
  photoBtn: { padding:'5px 10px', borderRadius:'20px', border:'1.5px solid #b8d4c0', background:'#eef6f1', color:'#3d6b52', fontSize:'11px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' },
  miniStat: { background:'#f4f0eb', borderRadius:'8px', padding:'7px 10px', textAlign:'center', minWidth:'60px' },
  miniStatNum: { fontSize:'15px', fontWeight:800, color:'#2a3d30' },
  miniStatLabel: { fontSize:'10px', color:'#9a8a7a', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' },
  metricGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:'10px' },
  examRow: { display:'flex', gap:'10px', alignItems:'flex-start', padding:'12px', background:'#faf8f5', borderRadius:'10px', border:'1px solid #ede6dd' },
  examMetricBadge: { padding:'2px 8px', borderRadius:'20px', fontSize:'11px', background:'#eef6f1', border:'1px solid #c8dece', color:'#2a3d30', whiteSpace:'nowrap' },
}

export const cssText = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
* { box-sizing: border-box; }
input:focus, select:focus, textarea:focus { border-color: #3d6b52 !important; box-shadow: 0 0 0 3px rgba(61,107,82,0.15); }
.bar-fill { transition: width 0.6s cubic-bezier(.23,1.01,.32,1); }
.animal-card:hover { border-color: #b8d4c0 !important; box-shadow: 0 4px 16px rgba(42,32,24,0.1) !important; }
.log-row:hover { background: #faf8f5; }
`
