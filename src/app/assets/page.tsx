'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Asset = {
  id: string
  unit_number: string
  equipment_type: string
  make: string | null
  model: string | null
  year: number | null
  status: string
  vin: string | null
  license_plate: string | null
  ops_profile?: string | null
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/fleet/equipment', { cache: 'no-store' })
      .then(async res => {
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload.error || 'Could not load assets')
        setAssets(payload.equipment ?? [])
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load assets'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '1.7rem clamp(1rem,3vw,2rem)', display: 'grid', gap: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrow}>Fleet</div>
          <h1 style={{ margin: '.25rem 0 .3rem', fontSize: 'clamp(1.9rem,4vw,2.7rem)', letterSpacing: '-.035em' }}>Assets</h1>
          <p style={subtitle}>Company equipment, readiness and operating classification.</p>
        </div>
        <Link href="/admin/equipment" style={manageLink}>Manage assets</Link>
      </header>

      {loading && <div style={muted}>Loading assets…</div>}
      {error && <div style={{ color: 'var(--error)' }}>{error}</div>}

      {!loading && !error && (
        <section style={{ borderTop: '1px solid var(--border)' }}>
          {assets.map(asset => {
            const description = [asset.year, asset.make, asset.model].filter(Boolean).join(' ') || asset.equipment_type.replaceAll('_', ' ')
            return (
              <article key={asset.id} style={row}>
                <div style={{ minWidth: 110 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 950 }}>Unit {asset.unit_number}</div>
                  <div style={{ ...muted, marginTop: 3, textTransform: 'capitalize' }}>{description}</div>
                </div>

                <div style={metaGroup}>
                  <Meta label="Mode" value={asset.ops_profile?.replaceAll('_', ' ') || 'Not classified'} />
                  <Meta label="Plate" value={asset.license_plate || '—'} />
                  <Meta label="VIN" value={asset.vin || '—'} />
                </div>

                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <span style={{ ...statusPill, color: asset.status === 'active' ? 'var(--primary)' : 'var(--warn)' }}>{asset.status}</span>
                </div>
              </article>
            )
          })}

          {assets.length === 0 && (
            <div style={{ padding: '2.5rem 0', color: 'var(--muted)' }}>No company assets are on file yet.</div>
          )}
        </section>
      )}
    </main>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><div style={metaLabel}>{label}</div><div style={{ marginTop: 3, fontSize: '.74rem', fontWeight: 750, textTransform: label === 'Mode' ? 'capitalize' : undefined }}>{value}</div></div>
}

const eyebrow: React.CSSProperties = { color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }
const subtitle: React.CSSProperties = { color: 'var(--muted)', margin: 0, fontSize: '.8rem' }
const muted: React.CSSProperties = { color: 'var(--muted)', fontSize: '.72rem' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 24, padding: '1.05rem 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }
const metaGroup: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(100px,1fr))', gap: 22, flex: '1 1 430px' }
const metaLabel: React.CSSProperties = { color: 'var(--faint)', fontSize: '.55rem', fontWeight: 850, letterSpacing: '.08em', textTransform: 'uppercase' }
const statusPill: React.CSSProperties = { fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }
const manageLink: React.CSSProperties = { color: 'var(--primary)', textDecoration: 'none', fontSize: '.72rem', fontWeight: 850, padding: '.55rem .75rem', borderRadius: 10, background: 'rgba(0,232,176,.07)' }
