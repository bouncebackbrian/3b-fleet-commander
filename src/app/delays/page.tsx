'use client'
import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { SAMPLE_DELAYS } from '@/lib/store'
import type { DelayEntry } from '@/types'
const DELAY_TYPES=['Traffic','Gate','Shipper Wait','Receiver Wait','No receiving driver','Dispatch Delay','Paperwork','Scale/Fuel','Other']
export default function Delays() {
  const [entries,setEntries]=useState<DelayEntry[]>(SAMPLE_DELAYS)
  const [form,setForm]=useState({loadNumber:'',trailer:'',delayType:'Traffic',location:'',totalHours:'',billable:'Review' as 'Yes'|'No'|'Review',detentionRate:'',notes:''})
  function handleSave(e:React.FormEvent){
    e.preventDefault()
    const hours=Number(form.totalHours)||0,rate=Number(form.detentionRate)||0
    const entry:DelayEntry={id:Math.random().toString(36).slice(2),loadNumber:form.loadNumber,trailer:form.trailer||undefined,delayType:form.delayType,location:form.location,totalHours:hours,billable:form.billable,detentionRate:rate||undefined,potentialPay:form.billable==='Yes'?hours*rate:0,dispatcherNotified:false,proofSaved:false,notes:form.notes||undefined,createdAt:new Date().toISOString()}
    setEntries(e=>[entry,...e])
    setForm(f=>({...f,loadNumber:'',location:'',totalHours:'',notes:''}))
  }
  const totalHours=entries.reduce((a,e)=>a+(e.totalHours||0),0)
  const billableHours=entries.filter(e=>e.billable==='Yes').reduce((a,e)=>a+(e.totalHours||0),0)
  return (
    <>
      <TopBar title="Delay & Detention" module="ops" subtitle="Document every wait — it becomes money or a dispute"/>
      <main style={{padding:'1.4rem',display:'grid',gap:'1.4rem'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(200px,100%),1fr))',gap:'1rem'}}>
          <KpiCard label="Entries" value={entries.length.toString()}/>
          <KpiCard label="Total hours" value={totalHours.toFixed(2)+'h'} note="All documented delays"/>
          <KpiCard label="Billable hours" value={billableHours.toFixed(2)+'h'} color={billableHours>0?'error':undefined}/>
          <KpiCard label="Under review" value={entries.filter(e=>e.billable==='Review').length.toString()} color="warn"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:'1.4rem',alignItems:'start'}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,overflow:'auto'}}>
            <table>
              <thead><tr>{['Load #','Type','Location','Hours','Billable','Dispatch notified','Notes'].map(h=>(
                <th key={h} style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap',borderBottom:'1px solid var(--border)',textAlign:'left'}}>{h}</th>
              ))}</tr></thead>
              <tbody>{entries.map(e=>(
                <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-sm)'}}>{e.loadNumber}</td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)'}}>{e.delayType}</td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.location}</td>
                  <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)',color:e.totalHours>1?'var(--warn)':'var(--text)'}}>{e.totalHours||'TBD'}</td>
                  <td style={{padding:'.85rem 1rem'}}><LoadBadge label={e.billable} color={e.billable==='Yes'?'error':e.billable==='Review'?'warn':'muted'}/></td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:e.dispatcherNotified?'var(--success)':'var(--error)'}}>{e.dispatcherNotified?'Yes':'No'}</td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.notes}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <form onSubmit={handleSave} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'1.5rem',display:'grid',gap:'1rem'}}>
            <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Log delay</h2>
            {([['loadNumber','Load #','text'],['trailer','Trailer #','text'],['location','Location','text'],['totalHours','Total hours','number'],['detentionRate','Detention $/hr','number']] as [keyof typeof form,string,string][]).map(([k,label,type])=>(
              <div key={k}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>{label}</label>
              <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} type={type} step={type==='number'?'any':undefined} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}/></div>
            ))}
            <div><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Delay type</label>
              <select value={form.delayType} onChange={e=>setForm(f=>({...f,delayType:e.target.value}))} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}>
                {DELAY_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Billable?</label>
              <select value={form.billable} onChange={e=>setForm(f=>({...f,billable:e.target.value as 'Yes'|'No'|'Review'}))} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}>
                <option>Review</option><option>Yes</option><option>No</option></select></div>
            <div><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Notes</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)',resize:'vertical'}}/></div>
            <button type="submit" style={{padding:'.9rem',borderRadius:12,background:'var(--primary)',color:'white',fontWeight:700,fontSize:'var(--text-sm)'}}>Save delay entry</button>
          </form>
        </div>
      </main>
    </>
  )
}
