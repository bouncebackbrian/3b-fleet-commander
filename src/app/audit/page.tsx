'use client'
import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { SAMPLE_LOADS } from '@/lib/store'
import type { SettlementAudit } from '@/types'
const fmtM=(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmt=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
export default function Audit() {
  const [entries,setEntries]=useState<SettlementAudit[]>([])
  const [form,setForm]=useState({weekEnding:'',loadNumber:'',trailer:'',actualMiles:'',paidMiles:'',cpm:'0.55',expectedPay:'',settlementPay:'',disputeNotes:''})
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))
  function handleSave(e:React.FormEvent){
    e.preventDefault()
    const actual=Number(form.actualMiles)||0,paid=Number(form.paidMiles)||0
    const cpm=Number(form.cpm)||0.55,expected=Number(form.expectedPay)||(paid*cpm),settlement=Number(form.settlementPay)||0
    const entry:SettlementAudit={id:Math.random().toString(36).slice(2),weekEnding:form.weekEnding,loadNumber:form.loadNumber,trailer:form.trailer||undefined,actualMiles:actual,paidMiles:paid,missingMiles:Math.max(actual-paid,0),cpm,expectedPay:expected,settlementPay:settlement,payGap:Math.max(expected-settlement,0),verified:false,disputeNotes:form.disputeNotes||undefined,createdAt:new Date().toISOString()}
    setEntries(e=>[entry,...e])
    setForm(f=>({...f,loadNumber:'',actualMiles:'',paidMiles:'',expectedPay:'',settlementPay:'',disputeNotes:''}))
  }
  const totalGap=entries.reduce((a,e)=>a+e.payGap,0),totalMissing=entries.reduce((a,e)=>a+e.missingMiles,0)
  return (
    <>
      <TopBar title="Settlement Audit" module="mis" subtitle="Verify every check — miles in, miles paid, money owed"/>
      <main style={{padding:'1.4rem',display:'grid',gap:'1.4rem'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(210px,100%),1fr))',gap:'1rem'}}>
          <KpiCard label="Audit entries" value={entries.length.toString()}/>
          <KpiCard label="Missing miles" value={fmt(totalMissing)} color={totalMissing>0?'error':undefined} note="Actual − paid"/>
          <KpiCard label="Total pay gap" value={fmtM(totalGap)} color={totalGap>0?'error':undefined} note="Expected − settlement"/>
          <KpiCard label="Disputed loads" value={entries.filter(e=>e.payGap>0).length.toString()} color={entries.filter(e=>e.payGap>0).length>0?'warn':undefined}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:'1.4rem',alignItems:'start'}}>
          <div>
            {entries.length===0?(
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,padding:'2.5rem',color:'var(--muted)',fontSize:'var(--text-sm)'}}>
                <p style={{marginBottom:'1.2rem'}}>No entries yet. Log settlement data when your check lands.</p>
                <div style={{padding:'1rem',borderRadius:14,background:'rgba(85,145,199,.08)',border:'1px solid rgba(85,145,199,.15)',color:'var(--blue)',fontSize:'var(--text-xs)'}}>
                  <strong>Pre-loaded loads for reference:</strong>
                  {SAMPLE_LOADS.map(l=>(
                    <div key={l.id} style={{marginTop:'.75rem',paddingTop:'.75rem',borderTop:'1px solid var(--border)'}}>
                      <strong>{l.loadNumber}</strong> · {l.moveType} · {l.dispatchMiles} dispatch mi · est. {fmtM(l.dispatchMiles*l.cpmRate)}
                    </div>
                  ))}
                </div>
              </div>
            ):(
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:18,overflow:'auto'}}>
                <table>
                  <thead><tr>{['Week ending','Load #','Actual mi','Paid mi','Missing','CPM','Expected','Settlement','Gap','Verified'].map(h=>(
                    <th key={h} style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap',borderBottom:'1px solid var(--border)',textAlign:'left'}}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{entries.map(e=>(
                    <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'.85rem 1rem',fontSize:'var(--text-xs)',color:'var(--muted)'}}>{e.weekEnding}</td>
                      <td style={{padding:'.85rem 1rem',fontWeight:700,fontSize:'var(--text-sm)'}}>{e.loadNumber}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>{fmt(e.actualMiles)}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>{fmt(e.paidMiles)}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)',color:e.missingMiles>0?'var(--error)':'var(--success)'}}>{e.missingMiles>0?fmt(e.missingMiles):'✓'}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>${e.cpm}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)'}}>{fmtM(e.expectedPay)}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontSize:'var(--text-sm)'}}>{e.settlementPay>0?fmtM(e.settlementPay):'—'}</td>
                      <td style={{padding:'.85rem 1rem',fontVariantNumeric:'tabular-nums',fontWeight:700,fontSize:'var(--text-sm)',color:e.payGap>0?'var(--error)':'var(--success)'}}>{e.payGap>0?fmtM(e.payGap):'✓'}</td>
                      <td style={{padding:'.85rem 1rem'}}><LoadBadge label={e.verified?'Yes':'No'} color={e.verified?'success':'muted'}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <form onSubmit={handleSave} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'1.5rem',display:'grid',gap:'1rem'}}>
            <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Log settlement</h2>
            {([['weekEnding','Week ending','date'],['loadNumber','Load #','text'],['trailer','Trailer #','text'],['actualMiles','Actual (ELD) miles','number'],['paidMiles','Paid miles','number'],['cpm','CPM rate','number'],['expectedPay','Expected pay $','number'],['settlementPay','Settlement pay $','number']] as [string,string,string][]).map(([k,label,type])=>(
              <div key={k}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>{label}</label>
              <input value={form[k as keyof typeof form]} onChange={e=>set(k,e.target.value)} type={type} step={type==='number'?'any':undefined} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}/></div>
            ))}
            <div><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Dispute notes</label>
              <textarea value={form.disputeNotes} onChange={e=>set('disputeNotes',e.target.value)} rows={3} style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)',resize:'vertical'}}/></div>
            <button type="submit" style={{padding:'.9rem',borderRadius:12,background:'var(--primary)',color:'white',fontWeight:700,fontSize:'var(--text-sm)'}}>Save audit entry</button>
          </form>
        </div>
      </main>
    </>
  )
}
