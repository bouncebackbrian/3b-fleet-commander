'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Truck, FileCheck, Clock, Fuel, Settings, ChevronLeft, ChevronRight } from 'lucide-react'

const MODULES = [
  {
    group: 'Mileage Intelligence',
    items: [
      {href:'/dashboard', label:'Dashboard', icon:LayoutDashboard},
      {href:'/loads',     label:'Load Log',  icon:Truck},
      {href:'/audit',     label:'Settlement Audit', icon:FileCheck},
    ]
  },
  {
    group: 'Operations',
    items: [
      {href:'/delays', label:'Delay & Detention', icon:Clock},
      {href:'/fuel',   label:'Fuel Log',          icon:Fuel},
    ]
  },
  {
    group: 'System',
    items: [
      {href:'/settings', label:'Settings', icon:Settings},
    ]
  }
]

export default function Sidebar() {
  const [col, setCol] = useState(false)
  const path = usePathname()
  return (
    <aside style={{width:col?68:268,transition:'width 220ms cubic-bezier(0.16,1,0.3,1)',background:'color-mix(in srgb,var(--surface) 94%,black 6%)',borderRight:'1px solid var(--border)',position:'sticky',top:0,height:'100dvh',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden',zIndex:20}}>

      {/* Logo */}
      <div style={{padding:'1rem .9rem',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--border)',flexShrink:0}}>
        <div style={{width:38,height:38,borderRadius:11,flexShrink:0,background:'linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 55%,white 45%))',display:'grid',placeItems:'center',boxShadow:'0 2px 10px rgba(0,0,0,.32)'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 16h6l2-8 3 8 2-5h3"/><path d="M3 19h18"/>
          </svg>
        </div>
        {!col && (
          <div style={{overflow:'hidden'}}>
            <div style={{fontWeight:900,fontSize:'.95rem',lineHeight:1.1,letterSpacing:'-.02em',whiteSpace:'nowrap'}}>3B Fleet Commander</div>
            <div style={{fontSize:'var(--text-xs)',color:'var(--primary)',marginTop:2,fontWeight:600,whiteSpace:'nowrap',letterSpacing:'.04em'}}>MILEAGE INTELLIGENCE</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:'.6rem .45rem',display:'flex',flexDirection:'column',gap:0,overflowY:'auto'}}>
        {MODULES.map(({group, items}) => (
          <div key={group} style={{marginBottom:'.5rem'}}>
            {!col && (
              <div style={{fontSize:'var(--text-xs)',color:'var(--faint)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',padding:'.5rem .85rem .3rem',userSelect:'none'}}>
                {group}
              </div>
            )}
            {col && <div style={{height:'.5rem'}}/>}
            {items.map(({href,label,icon:Icon}) => {
              const active = path === href || path.startsWith(href+'/')
              return (
                <Link key={href} href={href} title={col ? label : undefined}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'.7rem .85rem',borderRadius:11,textDecoration:'none',whiteSpace:'nowrap',overflow:'hidden',
                    background: active ? 'rgba(79,152,163,.14)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--muted)',
                    fontWeight: active ? 700 : 500,
                    fontSize:'var(--text-sm)',
                    transition:'all 180ms cubic-bezier(0.16,1,0.3,1)'}}>
                  <Icon size={16} style={{flexShrink:0}}/>
                  {!col && <span>{label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* MIS badge + collapse */}
      <div style={{padding:'.5rem .45rem .9rem',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:6}}>
        {!col && (
          <div style={{margin:'0 .45rem',padding:'.5rem .75rem',borderRadius:10,background:'rgba(79,152,163,.08)',border:'1px solid rgba(79,152,163,.18)',display:'flex',alignItems:'center',gap:7}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'var(--primary)',flexShrink:0,boxShadow:'0 0 6px var(--primary)'}}/>
            <span style={{fontSize:'var(--text-xs)',color:'var(--primary)',fontWeight:700,letterSpacing:'.05em'}}>MIS ACTIVE</span>
          </div>
        )}
        <button onClick={()=>setCol(!col)} aria-label={col?'Expand':'Collapse'}
          style={{padding:'.65rem .85rem',borderRadius:10,display:'flex',alignItems:'center',justifyContent:col?'center':'flex-end',gap:6,width:'100%',color:'var(--muted)',fontSize:'var(--text-xs)',transition:'all var(--transition)'}}>
          {col ? <ChevronRight size={15}/> : <><ChevronLeft size={15}/><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  )
}
