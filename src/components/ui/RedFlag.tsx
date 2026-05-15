interface Props{message:string}
export default function RedFlag({message}:Props){
  return (
    <div style={{display:'flex',gap:9,alignItems:'flex-start',padding:'.8rem 1rem',borderRadius:13,background:'rgba(209,99,167,.09)',border:'1px solid rgba(209,99,167,.18)',color:'var(--error)',fontSize:'var(--text-sm)'}}>
      <span style={{flexShrink:0,marginTop:1}}>⚠</span><span>{message}</span>
    </div>
  )
}
