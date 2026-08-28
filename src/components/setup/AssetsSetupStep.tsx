'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

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
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fleet_equipment')
        .select('id,unit_number,equipment_type,make,model,year,status,vin,license_plate')
        .eq('business_id', businessId)
        .order('unit_number', { ascending: true })
      if (!active) return
      if (error) setError(error.message)
      else setAssets((data ?? []) as Asset[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [businessId])

  if (loading) return <div style={{ color: '#789f95', fontSize: '.72rem' }}>Loading company assets…</div>

  return <div style={{ display: 'grid', gap: 10 }}>
    <div style={{ color: '#789f95', fontSize: '.72rem', lineHeight: 1.5 }}>Assets shown here belong only to the selected 3B Business ID. They are the company equipment Fleet Commander will use for assignments, inspections, maintenance, fuel, and reports.</div>
    {error && <div style={{ color: '#ff806f', fontSize: '.72rem' }}>{error}</div>}
    {!error && assets.length === 0 && <div style={{ ...card, color: '#8cad9f', fontSize: '.75rem' }}>No company assets are on file yet. Add equipment from Admin → Assets after setup.</div>}
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
    <div style={{ color: '#6f978c', fontSize: '.68rem', lineHeight: 1.45 }}>Missing VIN, plate, ownership, rental, trailer, and maintenance details stay blank until confirmed. Fleet Commander should never invent asset data.</div>
  </div>
}
