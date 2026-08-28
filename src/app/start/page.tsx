'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createAuthClient } from '@/lib/auth-client'
import { getBusinessRegistry, getThreeBProfile, type BusinessRegistryRow, type ThreeBProfile } from '@/lib/identity-registry'
import { FLEET_MODES } from '@/lib/fleet/modes'
import CompanyProfileStep from '@/components/setup/CompanyProfileStep'
import AssetsSetupStep from '@/components/setup/AssetsSetupStep'

const shell: React.CSSProperties = { minHeight: '100dvh', background: '#030c0a', color: '#eefcf8', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }
const card: React.CSSProperties = { border: '1px solid rgba(0,232,176,.12)', background: 'rgba(11,27,24,.72)', borderRadius: 16, padding: '1rem' }
const threeBoostUrl = process.env.NEXT_PUBLIC_3BOOST_URL || 'https://3boost.bouncebackbrian.com'

export default function StartPage() {
  const [profile, setProfile] = useState<ThreeBProfile | null>(null)
  const [businesses, setBusinesses] = useState<BusinessRegistryRow[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [fleetReadyBusinessId, setFleetReadyBusinessId] = useState('')
  const [selectedMode, setSelectedMode] = useState('dump-truck')
  const [loading, setLoading] = useState(true)
  const [provisioning, setProvisioning] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')

  async function provisionFleetBusiness(businessId: string) {
    const response = await fetch('/api/fleet/provision-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not provision Fleet Commander access for this Core business.')
  }

  async function refresh() {
    setLoading(true)
    setError('')
    const p = await getThreeBProfile()
    if (!p) { window.location.replace('/login'); return }

    const rows = await getBusinessRegistry()
    setProfile(p)
    setBusinesses(rows)

    const initialBusinessId = rows[0]?.business.id ?? ''
    setSelectedBusinessId(initialBusinessId)
    setFleetReadyBusinessId('')

    if (initialBusinessId) {
      setProvisioning(true)
      try {
        await provisionFleetBusiness(initialBusinessId)
        setFleetReadyBusinessId(initialBusinessId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not activate Fleet Commander for this business.')
      } finally {
        setProvisioning(false)
      }
    }

    setLoading(false)
  }

  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRow = useMemo(() => businesses.find(r => r.business.id === selectedBusinessId) ?? null, [businesses, selectedBusinessId])
  const selectedBusiness = selectedRow?.business ?? null
  const mode = FLEET_MODES.find(m => m.id === selectedMode) ?? FLEET_MODES[0]
  const fleetReady = !!selectedBusiness && fleetReadyBusinessId === selectedBusiness.id

  async function chooseBusiness(businessId: string) {
    setSelectedBusinessId(businessId)
    setFleetReadyBusinessId('')
    setError('')
    setProvisioning(true)
    try {
      await provisionFleetBusiness(businessId)
      setFleetReadyBusinessId(businessId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not provision Fleet Commander access.')
    } finally {
      setProvisioning(false)
    }
  }

  async function signOut() {
    setLoggingOut(true)
    try { await createAuthClient().auth.signOut() }
    finally { window.location.replace('/login') }
  }

  if (loading) return <main style={shell}><div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.25rem', color: '#78a79a' }}>Loading and connecting your 3Boost business…</div></main>

  return (
    <main style={shell}>
      <header style={{ borderBottom: '1px solid rgba(0,232,176,.08)', padding: '1rem 1.25rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <Link href="/" style={{ color: '#f5c200', fontWeight: 950, textDecoration: 'none' }}>3B FLEET COMMANDER</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href={`${threeBoostUrl}/dashboard`} style={{ color: '#00e8b0', fontSize: '.68rem', fontWeight: 900, textDecoration: 'none' }}>3Boost Dashboard</a>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#eefcf8', fontSize: '.72rem', fontWeight: 850 }}>{[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email}</div>
              <div style={{ color: '#00e8b0', fontSize: '.62rem', fontWeight: 850 }}>{profile?.three_b_id || '3B ID'}</div>
            </div>
            <button onClick={signOut} disabled={loggingOut} style={{ border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: '#eefcf8', borderRadius: 9, padding: '.5rem .7rem', fontSize: '.68rem', fontWeight: 850 }}>
              {loggingOut ? 'Logging out…' : 'Log Out'}
            </button>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '2.25rem 1.25rem 4rem', display: 'grid', gap: 22 }}>
        <div>
          <div style={{ color: '#00e8b0', fontSize: '.65rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Fleet Commander Activation</div>
          <h1 style={{ margin: '.45rem 0 .5rem', fontSize: 'clamp(1.8rem,5vw,2.8rem)' }}>Connect a 3Boost company</h1>
          <p style={{ color: '#739d92', lineHeight: 1.6, margin: 0 }}>3Boost owns the business identity. Fleet Commander activates fleet access and keeps every operational record scoped to the selected 3B Business ID.</p>
        </div>

        <Step n="1" title="Choose 3Boost business">
          <div style={{ display: 'grid', gap: 10 }}>
            {businesses.length === 0 ? (
              <div style={{ ...card, display: 'grid', gap: 10 }}>
                <strong>No Core 3Boost businesses found.</strong>
                <div style={{ color: '#789f95', fontSize: '.75rem', lineHeight: 1.5 }}>Create the company from the 3Boost Dashboard first. Once Core assigns its permanent 3B Business ID, Fleet Commander can activate that same business.</div>
                <a href={`${threeBoostUrl}/dashboard`} style={{ padding: '.75rem', borderRadius: 10, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none', textAlign: 'center' }}>Open 3Boost Dashboard →</a>
              </div>
            ) : businesses.map(row => {
              const selected = selectedBusinessId === row.business.id
              const ready = fleetReadyBusinessId === row.business.id
              return (
                <button key={row.business.id} onClick={() => void chooseBusiness(row.business.id)} disabled={provisioning && selected} style={{ ...card, color: '#eefcf8', textAlign: 'left', cursor: 'pointer', borderColor: selected ? 'rgba(0,232,176,.55)' : 'rgba(0,232,176,.12)', opacity: provisioning && selected ? .75 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 950 }}>{row.business.company_name}</div>
                      <div style={{ color: '#709c90', marginTop: 3, fontSize: '.7rem' }}>{row.business.three_b_biz_id} · {row.business.business_type.replace('_', ' ')}</div>
                    </div>
                    {selected && <span style={{ color: ready ? '#00e8b0' : '#f5c200', fontSize: '.68rem', fontWeight: 900 }}>{provisioning ? 'CONNECTING…' : ready ? 'FLEET READY ✓' : 'NOT CONNECTED'}</span>}
                  </div>
                </button>
              )
            })}
            {error && <div style={{ color: '#ff806f', fontSize: '.72rem', lineHeight: 1.5 }}>{error}</div>}
          </div>
        </Step>

        <Step n="2" title="Company profile">
          {selectedBusiness ? <CompanyProfileStep businessId={selectedBusiness.id} /> : <SetupHint text="Choose a 3Boost business first." />}
        </Step>

        <Step n="3" title="Company assets">
          {selectedBusiness ? <AssetsSetupStep businessId={selectedBusiness.id} /> : <SetupHint text="Choose a 3Boost business first." />}
        </Step>

        <Step n="4" title="Choose operating mode">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 9 }}>
            {FLEET_MODES.map(m => (
              <button key={m.id} onClick={() => m.status === 'live' && setSelectedMode(m.id)} style={{ ...card, textAlign: 'left', color: '#eefcf8', cursor: m.status === 'live' ? 'pointer' : 'default', opacity: m.status === 'live' ? 1 : .6, borderColor: selectedMode === m.id ? 'rgba(0,232,176,.55)' : 'rgba(0,232,176,.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: '1.35rem' }}>{m.icon}</span><span style={{ color: m.status === 'live' ? '#00e8b0' : '#f5c200', fontSize: '.55rem', fontWeight: 900, textTransform: 'uppercase' }}>{m.status === 'live' ? 'Available' : 'Coming Soon'}</span></div>
                <div style={{ marginTop: 7, fontWeight: 950 }}>{m.name}</div>
                <div style={{ color: '#729b90', marginTop: 5, fontSize: '.7rem', lineHeight: 1.45 }}>{m.summary}</div>
              </button>
            ))}
          </div>
        </Step>

        <Step n="5" title="Open Fleet Commander">
          <div style={{ ...card, display: 'grid', gap: 12 }}>
            <div><div style={{ color: '#719b90', fontSize: '.62rem', textTransform: 'uppercase', fontWeight: 850 }}>Core business</div><div style={{ marginTop: 4, fontWeight: 950 }}>{selectedBusiness?.company_name ?? 'Choose a business above'}</div>{selectedBusiness && <div style={{ color: '#709c90', fontSize: '.68rem', marginTop: 3 }}>{selectedBusiness.three_b_biz_id}</div>}</div>
            <div><div style={{ color: '#719b90', fontSize: '.62rem', textTransform: 'uppercase', fontWeight: 850 }}>Fleet mode</div><div style={{ marginTop: 4, fontWeight: 950 }}>{mode.name}</div></div>
            {fleetReady && mode.status === 'live' ? <Link href="/admin/dump-truck/dashboard" style={{ padding: '.78rem 1rem', borderRadius: 10, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none', textAlign: 'center' }}>Open Company Fleet Dashboard →</Link> : <SetupHint text={provisioning ? 'Connecting this business to Fleet Commander…' : 'Fleet activation must complete before opening the company dashboard.'} />}
          </div>
        </Step>
      </section>
    </main>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return <section><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(0,232,176,.1)', color: '#00e8b0', fontSize: '.65rem', fontWeight: 950 }}>{n}</span><h2 style={{ margin: 0, fontSize: '1rem' }}>{title}</h2></div>{children}</section>
}

function SetupHint({ text }: { text: string }) {
  return <div style={{ padding: '.7rem', borderRadius: 10, border: '1px solid rgba(245,194,0,.18)', background: 'rgba(245,194,0,.05)', color: '#f5c200', fontSize: '.72rem', fontWeight: 850, textAlign: 'center' }}>{text}</div>
}
