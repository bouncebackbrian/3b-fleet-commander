'use client'
import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { SAMPLE_LOADS, classify, calcMetrics } from '@/lib/store'
import type { Load, MoveType, LoadStatus } from '@/types'
const fmt=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtM=(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const MOVES:MoveType[]=['Loaded','Relay / Drop','Drop & Hook','Yard Move','Deadhead','Personal']
const STATUSES:LoadStatus[]=['Pending','In Transit','Complete','Issue']
const BLANK={date:'',loadNumber:'',bolRef:'',dispatcher:'Trev',broker:'',trailer:'',moveType:'Loaded' as MoveType,driverType:'Solo',origin:'',destination:'',status:'Pending' as LoadStatus,dispatchMiles:'',actualMiles:'',deadheadMiles:'',paidMiles:'',cpmRate:'0.55',fuelCost:'',waitHours:'',detentionHours:'',detentionPay:'',settlementPay:'',notes:'',hosNotes:'',paperworkLocation:''}
export default function Loads() {
  const [loads,setLoads]=useState<Load[]>(SAMPLE_LOADS)
  const [form,setForm]=useState(BLANK)
  const [open,setOpen]=useState(false)
  const m=calcMetrics(loads)
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))
  const n=(k:keyof typeof BLANK)=>Number(form[k])||0
  function handleSave(e:React.FormEvent){
    e.preventDefault()
    const load:Load={id:Math.random().toString(36).slice(2),date:form.date,loadNumber:form.loadNumber,bolRef:form.bolRef||undefined,dispatcher:form.dispatcher,broker:form.broker||undefined,trailer:form.trailer||undefined,moveType:form.moveType,driverType:form.driverType||undefined,origin:form.origin,destination:form.destination,status:form.status,dispatchMiles:n('dispatchMiles'),actualMiles:n('actualMiles'),deadheadMiles:n('deadheadMiles'),paidMiles:n('paidMiles'),cpmRate:n('cpmRate')||0.55,fuelCost:n('fuelCost'),waitHours:n('waitHours'),detentionHours:n('detentionHours'),detentionPay:n('detentionPay'),settlementPay:n('settlementPay'),notes:form.notes||undefined,hosNotes:form.hosNotes||undefined,paperworkLocation:form.paperworkLocation||undefined,proofSaved:false,settlementVerified:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
    setLoads(l=>[load,...l]);setForm(BLANK);setOpen(false)
  }
  const fi=(k:keyof typeof BLANK,label:string,type='text',step?:string)=>(
    <div key={k}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>{label}</label>
    <input value={form[k]} onChange={e=>set(k,e.target.value)} type={type} step={step} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}/></div>
  )
  return (
    <>
      <TopBar title="Load Log" module="mis" subtitle={`${loads.length} loads · ${fmt(m.dispatchMiles)} dispatch mi · est. ${fmtM(m.estPay)}`}/>
      <main style={{padding:'1.4rem',display:'grid',gap:'1.4rem'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(200px,100%),1fr))',gap:'1rem'}}>
          <KpiCard label="Total loads" value={loads.length.toString()}/>
          <KpiCard label="Dispatch miles" value={fmt(m.dispatchMiles)}/>
          <KpiCard label="Est. pay @ .55" value={fmtM(m.estPay)} color="primary"/>
          <KpiCard label="Total fuel" value={fmtM(m.fuel)} color={m.fuel>0?'warn':undefined}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>All loads</h2>
          <button onClick={()=>setOpen(true)} style={{padding:'.7rem 1.2rem',borderRadius:12,background:'var(--primary)',color:'white',fontWeight:700,fontSize:'var(--text-sm)'}}>+ Add load</button>
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,overflow:'auto',boxShadow:'var(--shadow-sm)'}}>
          <table>
            <thead><tr>{['Date','Load #','Trailer','Move','Origin','Destination','Disp. mi','Est. pay','Fuel','Wait h','Grade','Status'].map(h=>(
              <th key={h} style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap',borderBottom:'1px solid var(--border)',textAlign:'left'}}>{h}</th>
            ))}</tr></thead>
            <tbody>{loads.map(l=>{const c=classify(l);return(
              <tr key={l.id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)',whiteSpace:'nowrap'}}>{l.date}</td>
                <td style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-sm)'}}>{l.loadNumber}</td>
                <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)',color:'var(--muted)'}}>{l.trailer||'—'}</td>
                <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)',whiteSpace:'nowrap'}}>{l.moveType}</td>
                <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.origin}</td>
                <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.destination}</td>
                <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)'}}>{fmt(l.dispatchMiles)}</td>
                <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)',color:'var(--primary)'}}>{fmtM(l.dispatchMiles*l.cpmRate)}</td>
                <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)',color:l.fuelCost>0?'var(--warn)':'var(--faint)'}}>{l.fuelCost>0?fmtM(l.fuelCost):'—'}</td>
                <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>{l.waitHours||'—'}</td>
                <td style={{padding:'.85rem 1rem'}}><LoadBadge label={c.label} color={c.color}/></td>
                <td style={{padding:'.85rem 1rem'}}><LoadBadge label={l.status} color={l.status==='Complete'?'success':l.status==='Issue'?'error':'muted'}/></td>
              </tr>
            )})}</tbody>
          </table>
        </div>
        {open&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',zIndex:50,display:'grid',placeItems:'center',padding:'1rem'}}>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:22,padding:'1.8rem',maxWidth:700,width:'100%',maxHeight:'92dvh',overflow:'auto',boxShadow:'var(--shadow-lg)'}}>
              <h2 style={{fontSize:'var(--text-lg)',fontWeight:800,marginBottom:'1.4rem'}}>Add new load</h2>
              <form onSubmit={handleSave} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                {fi('date','Date','date')}{fi('loadNumber','Load #')}{fi('bolRef','BOL / Ref')}{fi('dispatcher','Dispatcher')}
                {fi('broker','Broker')}{fi('trailer','Trailer #')}{fi('origin','Origin')}{fi('destination','Destination')}
                {fi('dispatchMiles','Dispatch miles','number')}{fi('actualMiles','Actual (ELD) miles','number')}
                {fi('deadheadMiles','Deadhead miles','number')}{fi('paidMiles','Paid miles','number')}
                {fi('cpmRate','CPM rate','number','0.01')}{fi('fuelCost','Fuel cost $','number','0.01')}
                {fi('waitHours','Wait hours','number','0.01')}{fi('settlementPay','Settlement pay $','number','0.01')}
                <div style={{gridColumn:'1/-1'}}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Move type</label>
                  <select value={form.moveType} onChange={e=>set('moveType',e.target.value)} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}>
                    {MOVES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div style={{gridColumn:'1/-1'}}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Notes</label>
                  <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={3} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)',resize:'vertical'}}/></div>
                <div style={{gridColumn:'1/-1',display:'flex',gap:12,justifyContent:'flex-end',marginTop:4}}>
                  <button type="button" onClick={()=>setOpen(false)} style={{padding:'.8rem 1.4rem',borderRadius:12,background:'var(--surface-off)',border:'1px solid var(--border)',fontWeight:600,fontSize:'var(--text-sm)'}}>Cancel</button>
                  <button type="submit" style={{padding:'.8rem 1.8rem',borderRadius:12,background:'var(--primary)',color:'white',fontWeight:700,fontSize:'var(--text-sm)'}}>Save load</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
