'use client'
import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import RedFlag from '@/components/ui/RedFlag'
import { SAMPLE_LOADS, SAMPLE_DELAYS, SAMPLE_FUEL, classify, calcMetrics } from '@/lib/store'
import type { Load } from '@/types'
const fmt=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtM=(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
export default function Dashboard() {
  const [loads]=useState<Load[]>(SAMPLE_LOADS)
  const m=calcMetrics(loads)
  const flags=[
    ...loads.filter(l=>!l.actualMiles).map(l=>`Load ${l.loadNumber}: actual ELD miles not entered — cannot verify settlement.`),
    ...loads.filter(l=>l.waitHours>0&&!l.detentionPay).map(l=>`Load ${l.loadNumber}: ${l.waitHours.toFixed(2)}h wait — detention not documented.`),
    ...SAMPLE_DELAYS.filter(d=>d.billable==='Review').map(d=>`Load ${d.loadNumber} — "${d.delayType}" billable status needs a decision.`),
    ...SAMPLE_FUEL.filter(f=>!f.receiptSaved&&f.totalCost>0).map(f=>`Fuel at ${f.location}: receipt not saved.`),
  ]
  const handleExport=()=>{
    const blob=new Blob([JSON.stringify({loads,delays:SAMPLE_DELAYS,fuel:SAMPLE_FUEL},null,2)],{type:'application/json'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='3b-fleet-export.json';a.click()
  }
  return (
    <>
      <TopBar title="Fleet Dashboard" module="mis" subtitle={`May 14 2026 · ${m.totalLoads} loads · Dispatcher: Trev`} onExport={handleExport}/>
      <main style={{padding:'1.4rem',display:'grid',gap:'1.4rem'}}>
        <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(210px,100%),1fr))',gap:'1rem'}}>
          <KpiCard label="Dispatch miles" value={fmt(m.dispatchMiles)} note="All booked moves"/>
          <KpiCard label="Actual miles" value={m.actualMiles?fmt(m.actualMiles):'—'} note="Enter ELD miles" color={m.actualMiles?undefined:'warn'}/>
          <KpiCard label="Paid miles" value={m.paidMiles?fmt(m.paidMiles):'—'} note="Settlement baseline" color={m.paidMiles?undefined:'warn'}/>
          <KpiCard label="Est. pay @ .55" value={fmtM(m.estPay)} note="Dispatch × CPM" color="primary"/>
          <KpiCard label="Fuel cost" value={fmtM(m.fuel)} note="Confirmed receipts" color={m.fuel>0?'warn':undefined}/>
          <KpiCard label="Net (est.)" value={fmtM(m.estPay-m.fuel)} note="Before unsaved fuel" color="success"/>
          <KpiCard label="Wait hours" value={m.waitHours.toFixed(2)+'h'} note="Total drag" color={m.waitHours>1?'warn':undefined}/>
          <KpiCard label="Unpaid miles" value={fmt(m.unpaidMiles)} note="Actual − paid" color={m.unpaidMiles>25?'error':undefined}/>
        </section>
        <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:'1.4rem',alignItems:'start'}}>
          <div style={{display:'grid',gap:'1rem'}}>
            <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Load log</h2>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,overflow:'auto',boxShadow:'var(--shadow-sm)'}}>
              <table>
                <thead><tr>{['Load #','Move','Origin → Dest.','Disp. mi','Est. pay','Fuel','Wait h','Grade'].map(h=>(
                  <th key={h} style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap',borderBottom:'1px solid var(--border)',textAlign:'left'}}>{h}</th>
                ))}</tr></thead>
                <tbody>{loads.map(l=>{const c=classify(l);return(
                  <tr key={l.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-sm)'}}>
                      {l.loadNumber}{l.trailer&&<div style={{color:'var(--muted)',fontWeight:400,fontSize:'var(--text-xs)'}}>{l.trailer}</div>}
                    </td>
                    <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)',whiteSpace:'nowrap'}}>{l.moveType}</td>
                    <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)',maxWidth:200}}>
                      <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.origin}</div>
                      <div style={{color:'var(--muted)',fontSize:'var(--text-xs)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>→ {l.destination}</div>
                    </td>
                    <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)'}}>{fmt(l.dispatchMiles)}</td>
                    <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)',color:'var(--primary)'}}>{fmtM(l.dispatchMiles*l.cpmRate)}</td>
                    <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)',color:l.fuelCost>0?'var(--warn)':'var(--faint)'}}>{l.fuelCost>0?fmtM(l.fuelCost):'—'}</td>
                    <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)',color:l.waitHours>1?'var(--warn)':'var(--text)'}}>{l.waitHours||'—'}</td>
                    <td style={{padding:'.85rem 1rem'}}><LoadBadge label={c.label} color={c.color}/></td>
                  </tr>
                )})}</tbody>
              </table>
            </div>
          </div>
          <div style={{display:'grid',gap:'1rem'}}>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,padding:'1.2rem',display:'grid',gap:'.9rem'}}>
              <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Red flags</h2>
              {flags.length===0?<p style={{color:'var(--muted)',fontSize:'var(--text-sm)'}}>No flags. Enter actual + paid miles to complete audit.</p>:flags.map((f,i)=><RedFlag key={i} message={f}/>)}
            </div>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,padding:'1.2rem',display:'grid',gap:'.8rem'}}>
              <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Pay analysis</h2>
              {[['@ $0.50 CPM',fmtM(m.dispatchMiles*.50)],['@ $0.55 CPM',fmtM(m.dispatchMiles*.55)],['Fuel (confirmed)','− '+fmtM(m.fuel)],['Net @ .55',fmtM(m.dispatchMiles*.55-m.fuel)]].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',paddingBottom:'.8rem',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontSize:'var(--text-sm)',color:'var(--muted)'}}>{l}</span>
                  <strong style={{fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>{v}</strong>
                </div>
              ))}
            </div>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,padding:'1.2rem',display:'grid',gap:'.75rem'}}>
              <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Delays</h2>
              {SAMPLE_DELAYS.map(d=>(
                <div key={d.id} style={{paddingBottom:'.75rem',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <strong style={{fontSize:'var(--text-sm)'}}>{d.delayType}</strong>
                    <LoadBadge label={d.billable} color={d.billable==='Review'?'warn':d.billable==='Yes'?'error':'muted'}/>
                  </div>
                  <div style={{fontSize:'var(--text-xs)',color:'var(--muted)',marginTop:3}}>Load {d.loadNumber} · {d.totalHours?d.totalHours+'h':'TBD'}</div>
                  <div style={{fontSize:'var(--text-xs)',color:'var(--faint)',marginTop:2}}>{d.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{padding:'.9rem 1.2rem',borderRadius:14,background:'rgba(85,145,199,.08)',border:'1px solid rgba(85,145,199,.2)',color:'var(--blue)',fontSize:'var(--text-sm)',display:'flex',gap:10}}>
          <span style={{flexShrink:0}}>ℹ</span>
          <span><strong>Supabase not connected.</strong> Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code> to enable live data.</span>
        </div>
      </main>
    </>
  )
}
