'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBusiness, getBusinessRegistry, getThreeBProfile, type BusinessRegistryRow, type BusinessType, type ThreeBProfile } from '@/lib/identity-registry'
import { FLEET_MODES } from '@/lib/fleet/modes'
import AuthorizedBusinessMembersSetup from '@/components/setup/AuthorizedBusinessMembersSetup'

const shell: React.CSSProperties = { minHeight: '100dvh', background: '#030c0a', color: '#eefcf8', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }
const card: React.CSSProperties = { border: '1px solid rgba(0,232,176,.12)', background: 'rgba(11,27,24,.72)', borderRadius: 16, padding: '1rem' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.7rem .75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#07120f', color: '#eefcf8' }

export default function StartPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ThreeBProfile | null>(null)
  const [businesses, setBusinesses] = useState<BusinessRegistryRow[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [selectedMode, setSelectedMode] = useState('dump-truck')
  const [companyName, setCompanyName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('owner_op')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    const p = await getThreeBProfile()
    if (!p) { router.replace('/login'); return }
    const rows = await getBusinessRegistry()
    setProfile(p)
    setBusinesses(rows)
    setSelectedBusinessId(prev => prev || (p.default_business_id && rows.some(r => r.business.id === p.default_business_id) ? p.default_business_id : rows[0]?.business.id ?? ''))
    setLoading(false)
  }

  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRow = useMemo(() => businesses.find(r => r.business.id === selectedBusinessId) ?? null, [businesses, selectedBusinessId])
  const selectedBusiness = selectedRow?.business ?? null
  const mode = FLEET_MODES.find(m => m.id === selectedMode) ?? FLEET_MODES[0]

  async function createNewBusiness() {
    if (!companyName.trim()) return
    setCreating(true); setError('')
    const biz = await createBusiness({ company_name: companyName.trim(), business_type: businessType })
    if (!biz) { setError('Could not create the business. Please try again.'); setCreating(false); return }
    await refresh()
    setSelectedBusinessId(biz.id)
    setCompanyName('')
    setCreating(false)
  }

  if (loading) return <main style={shell}><div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.25rem', color: '#78a79a' }}>Loading your 3B ID and businesses…</div></main>

  return (
    <main style={shell}>
      <header style={{ borderBottom: '1px solid rgba(0,232,176,.08)', padding: '1rem 1.25rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/" style={{ color: '#f5c200', fontWeight: 950, textDecoration: 'none' }}>3B FLEET COMMANDER</Link>
          <Link href="/account" style={{ color: '#79a99c', fontSize: '.76rem', fontWeight: 800, textDecoration: 'none' }}>Account & Team</Link>
        </div>
      </header>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.25rem 4rem', display: 'grid', gap: 18 }}>
        <div><div style={{ color: '#00e8b0', fontSize: '.65rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Fleet Commander Setup</div><h1 style={{ margin: '.45rem 0 .5rem', fontSize: 'clamp(1.8rem,5vw,2.8rem)' }}>3B ID → Business → Mode → Permissions</h1><p style={{ color: '#739d92', lineHeight: 1.6 }}>Start with the person, connect the correct company or owner-operator, then enable only the business relationships, driver flows and portal permissions each 3B ID needs.</p></div>

        <Step n="1" title="Confirm your 3B ID">
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><div style={{ fontWeight: 950 }}>{[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email}</div><div style={{ color: '#00e8b0', marginTop: 4, fontSize: '.78rem', fontWeight: 850 }}>{profile?.three_b_id ?? '3B ID pending'}</div></div><div style={{ color: profile?.verification_status === 'verified' ? '#00e8b0' : '#f5c200', fontSize: '.68rem', fontWeight: 900, textTransform: 'uppercase' }}>{profile?.verification_status ?? 'unverified'}</div></div>
        </Step>

        <Step n="2" title="Choose or add company / owner-operator">
          <div style={{ display: 'grid', gap: 8 }}>
            {businesses.map(row => <button key={row.business.id} onClick={() => setSelectedBusinessId(row.business.id)} style={{ ...card, color: '#eefcf8', textAlign: 'left', cursor: 'pointer', borderColor: selectedBusinessId === row.business.id ? 'rgba(0,232,176,.5)' : 'rgba(0,232,176,.12)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><div style={{ fontWeight: 950 }}>{row.business.company_name}</div><div style={{ color: '#709c90', marginTop: 3, fontSize: '.7rem' }}>{row.business.three_b_biz_id} · {row.business.business_type.replace('_', ' ')}</div></div><div style={{ color: '#00e8b0', fontSize: '.62rem', fontWeight: 900, textTransform: 'uppercase' }}>{row.memberRole}</div></div></button>)}
            <div style={{ ...card, display: 'grid', gap: 9 }}><strong>{businesses.length ? 'Add another business' : 'Create your first business'}</strong><input style={input} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company or owner-operator name" /><select style={input} value={businessType} onChange={e => setBusinessType(e.target.value as BusinessType)}><option value="owner_op">Owner-Operator</option><option value="carrier">Carrier / Fleet</option><option value="brokerage">Brokerage</option><option value="fleet_management">Fleet Management</option><option value="service">Service Business</option><option value="other">Other</option></select>{error && <div style={{ color: '#ff806f', fontSize: '.72rem' }}>{error}</div>}<button onClick={createNewBusiness} disabled={creating || !companyName.trim()} style={{ padding: '.7rem', borderRadius: 10, border: 0, background: '#00e8b0', color: '#04110d', fontWeight: 950 }}>{creating ? 'Creating…' : 'Create Business'}</button></div>
          </div>
        </Step>

        <Step n="3" title="Choose the operating mode subscription">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 9 }}>{FLEET_MODES.map(m => <button key={m.id} onClick={() => m.status === 'live' && setSelectedMode(m.id)} style={{ ...card, textAlign: 'left', color: '#eefcf8', cursor: m.status === 'live' ? 'pointer' : 'default', opacity: m.status === 'live' ? 1 : .64, borderColor: selectedMode === m.id ? 'rgba(0,232,176,.5)' : 'rgba(0,232,176,.12)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: '1.35rem' }}>{m.icon}</span><span style={{ color: m.status === 'live' ? '#00e8b0' : '#f5c200', fontSize: '.55rem', fontWeight: 900, textTransform: 'uppercase' }}>{m.status === 'live' ? 'Available' : 'Coming Soon'}</span></div><div style={{ marginTop: 7, fontWeight: 950 }}>{m.name}</div><div style={{ color: '#729b90', marginTop: 5, fontSize: '.7rem', lineHeight: 1.45 }}>{m.summary}</div></button>)}</div>
        </Step>

        <Step n="4" title="Authorize 3B IDs and set permissions">
          <div style={card}>
            <AuthorizedBusinessMembersSetup businessId={selectedBusinessId || null} canManage={selectedRow?.memberRole === 'owner'} />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.08)', color: '#759f94', fontSize: '.73rem', lineHeight: 1.5 }}>You can keep managing members later from <Link href="/account" style={{ color: '#00e8b0', fontWeight: 850, textDecoration: 'none' }}>Account & Team</Link>. Business authorization and Fleet Commander operational permission remain separate.</div>
          </div>
        </Step>

        <Step n="5" title="Open Fleet Commander">
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><div><div style={{ color: '#719b90', fontSize: '.62rem', textTransform: 'uppercase', fontWeight: 850 }}>Selected setup</div><div style={{ marginTop: 5, fontWeight: 950 }}>{selectedBusiness?.company_name ?? 'Choose a business'} · {mode.name}</div></div>{selectedBusiness && mode.status === 'live' && mode.driverHref ? <Link href={mode.driverHref} style={{ padding: '.72rem 1rem', borderRadius: 10, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none' }}>Open {mode.name} →</Link> : <span style={{ color: '#f5c200', fontSize: '.72rem', fontWeight: 850 }}>Complete the selections above</span>}</div>
        </Step>
      </section>
    </main>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return <section><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><span style={{ width: 24, height: 24, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(0,232,176,.1)', color: '#00e8b0', fontSize: '.65rem', fontWeight: 950 }}>{n}</span><h2 style={{ margin: 0, fontSize: '1rem' }}>{title}</h2></div>{children}</section>
}
