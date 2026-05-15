interface Props{label:string;color:string}
const M:Record<string,{bg:string,c:string}>={
  success:{bg:'rgba(109,170,69,.14)',c:'var(--success)'},warn:{bg:'rgba(253,171,67,.14)',c:'var(--warn)'},
  error:{bg:'rgba(209,99,167,.14)',c:'var(--error)'},primary:{bg:'rgba(79,152,163,.14)',c:'var(--primary)'},
  muted:{bg:'rgba(150,148,144,.12)',c:'var(--muted)'},
}
export default function LoadBadge({label,color}:Props){
  const s=M[color]||M.muted
  return <span style={{display:'inline-flex',alignItems:'center',padding:'.32rem .65rem',borderRadius:999,fontSize:'var(--text-xs)',fontWeight:700,background:s.bg,color:s.c}}>{label}</span>
}
