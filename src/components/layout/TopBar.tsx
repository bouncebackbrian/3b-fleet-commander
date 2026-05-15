'use client'
import { useState, useEffect } from 'react'
import { Sun, Moon, Download } from 'lucide-react'
interface Props { title:string; subtitle?:string; onExport?:()=>void; module?:'mis'|'ops'|'sys' }
export default function TopBar({title,subtitle,onExport,module='mis'}:Props) {
  const [theme,setTheme]=useState<'dark'|'light'>('dark')
  useEffect(()=>{ const t=document.documentElement.getAttribute('data-theme') as 'dark'|'light'; if(t)setTheme(t) },[])
  const toggle=()=>{ const n=theme==='dark'?'light':'dark'; setTheme(n); document.documentElement.setAttribute('data-theme',n) }
  const moduleLabel = module==='mis' ? 'Mileage Intelligence System' : module==='ops' ? 'Operations' : 'System'
  return (
    <header style={{position:'sticky',top:0,zIndex:10,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem',padding:'.85rem 1.5rem',backdropFilter:'blur(16px)',background:'color-mix(in srgb,var(--bg) 80%,transparent)',borderBottom:'1px solid var(--border)'}}>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
          <span style={{fontSize:'var(--text-xs)',color:'var(--primary)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',background:'rgba(79,152,163,.1)',padding:'.2rem .6rem',borderRadius:6}}>{moduleLabel}</span>
        </div>
        <h1 style={{fontSize:'var(--text-xl)',fontWeight:900,letterSpacing:'-.03em',lineHeight:1}}>{title}</h1>
        {subtitle&&<p style={{fontSize:'var(--text-xs)',color:'var(--muted)',marginTop:4}}>{subtitle}</p>}
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
        {onExport&&<button onClick={onExport} style={{padding:'.65rem 1rem',borderRadius:10,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',fontSize:'var(--text-sm)',fontWeight:600,display:'flex',alignItems:'center',gap:6}}><Download size={14}/>Export</button>}
        <button onClick={toggle} aria-label="Toggle theme" style={{padding:'.65rem',borderRadius:10,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--muted)',display:'flex',alignItems:'center'}}>
          {theme==='dark'?<Sun size={14}/>:<Moon size={14}/>}
        </button>
      </div>
    </header>
  )
}
