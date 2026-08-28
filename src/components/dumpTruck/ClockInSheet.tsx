'use client'
import { useEffect, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import type { DumpTruckSite } from '@/lib/dumpTruck/types'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'

interface Props {
  sites: DumpTruckSite[]
  onClose: () => void
  onConfirm: (input: {
    truckId: string; trailerId: string | null; startYardSiteId: string | null
    manualStartTravelMinutes: number | null
  }) => Promise<boolean>
}

export default function ClockInSheet({ sites, onClose, onConfirm }: Props) {
  const [equipment, setEquipment] = useState<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] } | null>(null)
  const [truckId, setTruckId] = useState('')
  const [trailerId, setTrailerId] = useState('')
  const [yardSiteId, setYardSiteId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/fleet/dump-truck/equipment').then(r => r.json()).then(setEquipment).catch(() => setEquipment({ trucks: [], trailers: [] }))
  }, [])

  const yards = sites.filter(s => s.siteType === 'yard')

  return (
    <Sheet title="Clock In" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.45 }}>
          Clock in first. Pre-trip and travel are recorded from the actual job workflow after you are on the clock.
        </div>

        <Field label="Truck / Unit">
          <select style={inputStyle} value={truckId} onChange={e => setTruckId(e.target.value)}>
            <option value="">Select truck…</option>
            {(equipment?.trucks ?? []).map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
          </select>
        </Field>

        {(equipment?.trailers.length ?? 0) > 0 && (
          <Field label="Trailer (optional)">
            <select style={inputStyle} value={trailerId} onChange={e => setTrailerId(e.target.value)}>
              <option value="">None</option>
              {(equipment?.trailers ?? []).map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
            </select>
          </Field>
        )}

        {yards.length > 0 && (
          <Field label="Yard">
            <select style={inputStyle} value={yardSiteId} onChange={e => setYardSiteId(e.target.value)}>
              <option value="">Select yard…</option>
              {yards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}

        <button
          style={{ ...primaryBtnStyle, opacity: truckId && !busy ? 1 : .5 }}
          disabled={!truckId || busy}
          onClick={async () => {
            setBusy(true)
            const ok = await onConfirm({
              truckId,
              trailerId: trailerId || null,
              startYardSiteId: yardSiteId || null,
              manualStartTravelMinutes: null,
            })
            setBusy(false)
            if (ok) onClose()
          }}
        >
          {busy ? 'Clocking in…' : 'Clock In'}
        </button>
      </div>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}
