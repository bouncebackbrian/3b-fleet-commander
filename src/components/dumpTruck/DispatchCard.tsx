'use client'
/**
 * DispatchCard — driver-facing Today/Tomorrow/Upcoming dispatch assignments
 * (spec: "Driver Ahead-of-Time View" + "Driver Dispatch Card"). Self-
 * contained: fetches its own data from /api/fleet/dump-truck/dispatch/driver
 * so it can be dropped into the driver page without touching
 * useDumpTruckDriver's existing state.
 *
 * Only status='published' dispatches are ever returned by that route (RLS +
 * service-layer filter) — nothing here shows a draft to a driver.
 */
import { useEffect, useState, useCallback } from 'react'
import { toast } from '@/hooks/useToast'
import { buildCoordNavLaunchOptions } from '@/lib/dumpTruck/navigation'

interface DispatchStopDTO {
  id: string
  stopType: 'yard' | 'pickup' | 'delivery' | 'return' | 'other'
  rawLocationText: string | null
  siteName: string | null
  siteLat: number | null
  siteLng: number | null
  siteAddress: string | null
  material: string | null
}

interface DispatchDTO {
  id: string
  status: 'draft' | 'published' | 'cancelled'
  dispatchDate: string | null
  customerName: string | null
  material: string | null
  numLoadsEstimate: number | null
  requiredArrivalAt: string | null
  recommendedYardArrivalAt: string | null
  recommendedLeaveYardAt: string | null
  targetSiteArrivalAt: string | null
  calculatedDriveMinutes: number | null
  specialInstructions: string | null
  gateInstructions: string | null
  contactOnArrivalInstructions: string | null
  safetyInstructions: string | null
  ticketRequirements: string | null
  scaleRequired: boolean | null
  jobId: string | null
  currentVersion: number
  stops: DispatchStopDTO[]
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(dateStr: string | null): 'Today' | 'Tomorrow' | string {
  if (!dateStr) return 'Unscheduled'
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function DispatchCard({ truckUnitNumber, onStartDispatch }: {
  truckUnitNumber: string | null
  onStartDispatch: (jobId: string) => void
}) {
  const [dispatches, setDispatches] = useState<DispatchDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [ackVersions, setAckVersions] = useState<Record<string, number | null>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/fleet/dump-truck/dispatch/driver')
      .then(r => r.json())
      .then(b => {
        const list: DispatchDTO[] = b.dispatches ?? []
        setDispatches(list)
        // Mark each as viewed once (cheap — server no-ops if already viewed).
        list.forEach(d => { fetch(`/api/fleet/dump-truck/dispatch/${d.id}/view`, { method: 'POST' }).catch(() => {}) })
      })
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const acknowledge = async (d: DispatchDTO) => {
    setBusy(d.id)
    try {
      const res = await fetch(`/api/fleet/dump-truck/dispatch/${d.id}/acknowledge`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not acknowledge')
      setAckVersions(v => ({ ...v, [d.id]: d.currentVersion }))
      toast.success('Dispatch acknowledged')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not acknowledge')
    } finally {
      setBusy(null)
    }
  }

  if (loading || dispatches.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)
  const todaysDispatch = dispatches.find(d => d.dispatchDate === today)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: '.75rem' }}>
      {dispatches.map(d => {
        const isOpen = expanded === d.id || (expanded === null && d.dispatchDate === today)
        const firstStop = d.stops.find(s => s.stopType === 'pickup') ?? d.stops[0]
        const acknowledged = ackVersions[d.id] === d.currentVersion
        return (
          <div key={d.id} style={{
            background: 'var(--surface)', border: `1px solid ${d.dispatchDate === today ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12, padding: '.9rem 1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : d.id)}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '.95rem' }}>
                  {dayLabel(d.dispatchDate).toUpperCase()} — TRUCK {truckUnitNumber ?? '—'}
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{d.customerName ?? 'Customer TBD'}{firstStop ? ` · ${firstStop.siteName ?? firstStop.rawLocationText}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!acknowledged && <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--warn, #d99a2b)', border: '1px solid var(--warn, #d99a2b)', borderRadius: 999, padding: '.15rem .5rem' }}>NEEDS ACK</span>}
                <span style={{ color: 'var(--muted)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: '.85rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
                  <Stat label="Yard Arrival" value={fmtTime(d.recommendedYardArrivalAt)} />
                  <Stat label="Leave Yard By" value={fmtTime(d.recommendedLeaveYardAt)} />
                  <Stat label="Target Arrival" value={fmtTime(d.targetSiteArrivalAt)} />
                  <Stat label="Required Arrival" value={fmtTime(d.requiredArrivalAt)} highlight />
                  <Stat label="Est. Drive" value={d.calculatedDriveMinutes != null ? `${Math.round(d.calculatedDriveMinutes)} min` : '—'} />
                </div>

                {d.stops.map(s => (
                  <div key={s.id} style={{ fontSize: '.82rem' }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{s.stopType}: </span>
                    {s.siteName ?? s.rawLocationText ?? '—'}{s.material ? ` — ${s.material}` : ''}
                  </div>
                ))}
                {d.numLoadsEstimate != null && <div style={{ fontSize: '.82rem' }}>Estimated loads: {d.numLoadsEstimate}</div>}

                {(d.specialInstructions || d.gateInstructions || d.contactOnArrivalInstructions || d.safetyInstructions || d.ticketRequirements || d.scaleRequired) && (
                  <div style={{ fontSize: '.8rem', background: 'var(--surface-2)', borderRadius: 8, padding: '.6rem .75rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Instructions</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {d.scaleRequired && <li>Scale every load</li>}
                      {d.ticketRequirements && <li>{d.ticketRequirements}</li>}
                      {d.contactOnArrivalInstructions && <li>{d.contactOnArrivalInstructions}</li>}
                      {d.gateInstructions && <li>{d.gateInstructions}</li>}
                      {d.safetyInstructions && <li>{d.safetyInstructions}</li>}
                      {d.specialInstructions && <li>{d.specialInstructions}</li>}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!acknowledged && (
                    <button
                      onClick={() => acknowledge(d)}
                      disabled={busy === d.id}
                      style={{ padding: '.6rem 1rem', borderRadius: 9, background: 'var(--primary)', color: '#04140f', fontWeight: 800, opacity: busy === d.id ? .5 : 1 }}
                    >
                      {busy === d.id ? 'Saving…' : '✓ ACKNOWLEDGE DISPATCH'}
                    </button>
                  )}
                  {firstStop?.siteLat != null && firstStop.siteLng != null && (
                    <a
                      href={buildCoordNavLaunchOptions(firstStop.siteLat, firstStop.siteLng, firstStop.siteName ?? 'First stop').find(o => o.provider === 'google_maps')?.url ?? '#'}
                      target="_blank" rel="noreferrer"
                      style={{ padding: '.6rem 1rem', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '.85rem' }}
                    >
                      🧭 OPEN DIRECTIONS
                    </a>
                  )}
                  {d.dispatchDate === today && d.jobId && d === todaysDispatch && (
                    <button
                      onClick={() => onStartDispatch(d.jobId!)}
                      style={{ padding: '.6rem 1rem', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--primary)', color: 'var(--primary)', fontWeight: 800, fontSize: '.85rem' }}
                    >
                      ▶ START TODAY&apos;S DISPATCH
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '.4rem .5rem', borderRadius: 6, background: 'var(--surface-2)', border: highlight ? '1px solid var(--primary)' : '1px solid var(--border)' }}>
      <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '.85rem', fontWeight: 800 }}>{value}</div>
    </div>
  )
}
