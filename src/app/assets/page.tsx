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

const card: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '1rem' }

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

  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: '1.4rem', display: 'grid', gap: 16 }}>
    <header>
      <div style={{ color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Company Assets</div>
      <h1 style={{ margin: '.35rem 0 .4rem' }}>Assets</h1>
      <p style={{ color: 'var(--muted)', margin: 0, maxWidth: 760, lineHeight: 1.55 }}>Every truck or vehicle owns its operating classification. Dispatch sees readiness and assignment context; Admin manages the official equipment record.</p>
    </header>

    {loading && <div style={{ color: 'var(--muted)' }}>Loading assets…</div>}
    {error && <div style={{ color: 'var(--error)' }}>{error}</div>}

    {!loading && !error && <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
      {assets.map(asset => <div key={asset.id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 950 }}>Unit {asset.unit_number}</div>
            <div style={{ color: 'var(--muted)', fontSize: '.7rem', marginTop: 4 }}>{[asset.year, asset.make, asset.model].filter(Boolean).join(' ') || asset.equipment_type.replaceAll('_', ' ')}</div>
          </div>
          <span style={{ color: asset.status === 'active' ? 'var(--primary)' : 'var(--warn)', fontSize: '.6rem', fontWeight: 900, textTransform: 'uppercase' }}>{asset.status}</span>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 4, color: 'var(--muted)', fontSize: '.66rem' }}>
          <div>Mode: <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{asset.ops_profile?.replaceAll('_', ' ') || 'Not classified'}</strong></div>
          {asset.license_plate && <div>Plate: {asset.license_plate}</div>}
          {asset.vin && <div>VIN: {asset.vin}</div>}
        </div>
      </div>)}
      {assets.length === 0 && <div style={card}>No company assets are on file.</div>}
    </section>}

    <div style={{ color: 'var(--muted)', fontSize: '.7rem' }}>Admin users can manage full equipment records from <Link href="/admin/equipment" style={{ color: 'var(--primary)' }}>Asset Administration</Link>.</div>
  </main>
}
