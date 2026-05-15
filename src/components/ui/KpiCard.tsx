interface Props{label:string;value:string;note?:string;color?:'primary'|'success'|'warn'|'error'}
const M={primary:'var(--primary)',success:'var(--success)',warn:'var(--warn)',error:'var(--error)'}
export default function KpiCard({label,value,note,color}:Props){
  const c=color?M[color]:'var(--text)'
  return (
    <article style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,boxShadow:'var(--shadow-sm)',padding:'1.2rem',...(color?{borderColor:`color-mix(in srgb,${c} 35%,transparent)`}:{})}}>
      <span style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:5}}>{label}</span>
      <strong style={{display:'block',fontSize:'clamp(1.45rem,1.1rem + .9vw,1.9rem)',fontWeight:900,fontVariantNumeric:'tabular-nums',color:c}}>{value}</strong>
      {note&&<em style={{display:'block',marginTop:5,fontStyle:'normal',fontSize:'var(--text-xs)',color:'var(--faint)'}}>{note}</em>}
    </article>
  )
}
