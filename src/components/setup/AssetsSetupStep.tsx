'use client'

import { useEffect, useState } from 'react'

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
}

const card: React.CSSProperties = { border: '1px solid rgba(0,232,176,.12)', background: 'rgba(11,27,24,.72)', borderRadius: 12, padding: '.85rem' }

export default function AssetsSetupStep({ businessId }: { businessId: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      try {
        const response = await fetch(`/api/fleet/setup/assets?businessId=${encodeURIComponent(businessId)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Could not load company assets')
        if (active) setAssets((payload.assets ?? []) as Asset[])
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load company assets')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [businessId])

  if (loading) return <div style={{ color: '#789f95', fontSize: '.72rem' }}>Loading company assets…</div>

  return <div style={{ display: 'grid', gap: 10 }}>
    <div style={{ color: '#789f95', fontSize: '.72rem', lineHeight: 1.5 }}>Core 3Boost owns the company identity. These operational assets come from Fleet Commander and stay scoped to the same 3B Business ID.</div>
    {error && <div style={{ color: '#ff806f', fontSize: '.72rem' }}>{error}</div>}
    {!error && assets.length === 0 && <div style={{ ...card, color: '#8cad9f', fontSize: '.75rem' }}>No Fleet Commander assets are on file for this company yet. You can add equipment after setup.</div>}
    {assets.map(asset => (
      <div key={asset.id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 950 }}>Unit {asset.unit_number}</div>
            <div style={{ color: '#82a99e', marginTop: 3, fontSize: '.7rem' }}>
              {[asset.year, asset.make, asset.model].filter(Boolean).join(' ') || asset.equipment_type.replaceAll('_', ' ')}
            </div>
          </div>
          <span style={{ color: asset.status === 'active' ? '#00e8b0' : '#f5c200', fontSize: '.62rem', fontWeight: 900, textTransform: 'uppercase' }}>{asset.status}</span>
        </div>
        {(asset.vin || asset.license_plate) && <div style={{ marginTop: 7, color: '#688f84', fontSize: '.65rem' }}>
          {asset.vin ? `VIN ${asset.vin}` : ''}{asset.vin && asset.license_plate ? ' · ' : ''}{asset.license_plate ? `Plate ${asset.license_plate}` : ''}
        </div>}
      </div>
    ))}
    <div style={{ color: '#6f978c', fontSize: '.68rem', lineHeight: 1.45 }}>Missing VIN, plate, ownership, rental, trailer, and maintenance details stay blank until confirmed. Driver-submitted corrections will go through review instead of overwriting the official asset record.</div>
  </div>
}
