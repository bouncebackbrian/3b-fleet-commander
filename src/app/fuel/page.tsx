'use client'
import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import { SAMPLE_FUEL } from '@/lib/store'
import type { FuelEntry } from '@/types'
const fmtM=(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
export default function Fuel() {
  const [entries,setEntries]=useState<FuelEntry[]>(SAMPLE_FUEL)
  const [form,setForm]=useState({date:'',location:'',fuelType:'Tractor' as FuelEntry['fuelType'],gallons:'',pricePerGal:'',totalCost:'',loadNumber:'',notes:''})
  function handleSave(e:React.FormEvent){
    e.preventDefault()
    const gallons=Number(form.gallons)||0,ppg=Number(form.pricePerGal)||0,total=Number(form.totalCost)||(gallons*ppg)
    const entry:FuelEntry={id:Math.random().toString(36).slice(2),date:form.date,location:form.location,fuelType:form.fuelType,gallons,pricePerGal:ppg||undefined,totalCost:total,loadNumber:form.loadNumber||undefined,receiptSaved:false,notes:form.notes||undefined,createdAt:new Date().toISOString()}
    setEntries(e=>[entry,...e])
    setForm(f=>({...f,date:'',location:'',gallons:'',pricePerGal:'',totalCost:'',loadNumber:'',notes:''}))
  }
  const totalCost=entries.reduce((a,e)=>a+(e.totalCost||0),0)
  const reefer=entries.filter(e=>e.fuelType==='Reefer').reduce((a,e)=>a+(e.totalCost||0),0)
  const tractor=entries.filter(e=>e.fuelType==='Tractor').reduce((a,e)=>a+(e.totalCost||0),0)
  return (
    <>
      <TopBar title="Fuel Log" module="ops" subtitle="Track every gallon — tractor, reefer, and DEF"/>
      <main style={{padding:'1.4rem',display:'grid',gap:'1.4rem'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(200px,100%),1fr))',gap:'1rem'}}>
          <KpiCard label="Total fuel cost" value={fmtM(totalCost)} color={totalCost>0?'warn':undefined}/>
          <KpiCard label="Tractor fuel" value={fmtM(tractor)}/>
          <KpiCard label="Reefer fuel" value={fmtM(reefer)}/>
          <KpiCard label="Fuel entries" value={entries.length.toString()}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:'1.4rem',alignItems:'start'}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,overflow:'auto'}}>
            <table>
              <thead><tr>{['Date','Location','Type','Gallons','$/gal','Total','Load #','Receipt'].map(h=>(
                <th key={h} style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap',borderBottom:'1px solid var(--border)',textAlign:'left'}}>{h}</th>
              ))}</tr></thead>
              <tbody>{entries.map(e=>(
                <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)',whiteSpace:'nowrap'}}>{e.date}</td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-sm)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.location}</td>
                  <td style={{padding:'.85rem 1rem'}}><LoadBadge label={e.fuelType} color={e.fuelType==='Reefer'?'primary':e.fuelType==='DEF'?'muted':'warn'}/></td>
                  <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>{e.gallons.toFixed(3)}</td>
                  <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)',color:'var(--muted)'}}>{e.pricePerGal?fmtM(e.pricePerGal):'—'}</td>
                  <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)',color:'var(--warn)'}}>{fmtM(e.totalCost)}</td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)'}}>{e.loadNumber||'—'}</td>
                  <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:e.receiptSaved?'var(--success)':'var(--error)'}}>{e.receiptSaved?'✓ Saved':'Missing'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <form onSubmit={handleSave} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'1.5rem',display:'grid',gap:'1rem'}}>
            <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Add fuel entry</h2>
            {([['date','Date','date'],['location','Location','text'],['gallons','Gallons','number'],['pricePerGal','Price/gal','number'],['totalCost','Total cost $','number'],['loadNumber','Load # (optional)','text']] as [keyof typeof form,string,string][]).map(([k,label,type])=>(
              <div key={k}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>{label}</label>
              <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} type={type} step={type==='number'?'any':undefined} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}/></div>
            ))}
            <div><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Fuel type</label>
              <select value={form.fuelType} onChange={e=>setForm(f=>({...f,fuelType:e.target.value as FuelEntry['fuelType']}))} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}>
                <option>Tractor</option><option>Reefer</option><option>DEF</option></select></div>
            <div><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Notes</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)',resize:'vertical'}}/></div>
            <button type="submit" style={{padding:'.9rem',borderRadius:12,background:'var(--primary)',color:'white',fontWeight:700,fontSize:'var(--text-sm)'}}>Save fuel entry</button>
          </form>
        </div>
      </main>
    </>
  )
}
