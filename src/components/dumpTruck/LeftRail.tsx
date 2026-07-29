'use client'
import { useEffect, useState } from 'react'
import type { FlowStateId } from '@/lib/dumpTruck/stateMachine'
import { isCustodyOpen } from '@/lib/dumpTruck/stateMachine'
import type { DumpTruckJob, DumpTruckSite } from '@/lib/dumpTruck/types'

interface Props {
  flowState: FlowStateId
  clockInAt: string | null
  truckUnit: string | null
  trailerUnit: string | null
  jobs: DumpTruckJob[]
  activeJobId: string | null
  onChangeJob: (id: string) => void
  sites: DumpTruckSite[]
  loadCount: number
  onNavigate: (site: DumpTruckSite) => void
  onPinLocation: (site: DumpTruckSite) => void
}

export default function LeftRail({
  flowState, clockInAt, truckUnit, trailerUnit, jobs, activeJobId, onChangeJob, sites, loadCount, onNavigate, onPinLocation,
}: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null
  const pickupSite = sites.find(s => s.id === activeJob?.pickupSiteId)
  const dumpSite = sites.find(s => s.id === activeJob?.dumpSiteId)

  const elapsed = clockInAt ? formatDuration(now - new Date(clockInAt).getTime()) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <Field label="Shift Elapsed" value={elapsed} big />
      <Field label="Truck / Unit" value={truckUnit ?? '—'} />
      {trailerUnit && <Field label="Trailer" value={trailerUnit} />}
      <Field label="Custody" value={isCustodyOpen(flowState) ? 'With Driver' : 'Not in Custody'} />
      <Field label="Loads Completed" value={String(loadCount)} big />

      {jobs.length > 0 && (
        <div>
          <div style={fieldLabelStyle}>Job</div>
          {jobs.length === 1 ? (
            <div style={fieldValueStyle}>{jobs[0].jobNumber}</div>
          ) : (
            <select
              value={activeJobId ?? ''}
              onChange={e => onChangeJob(e.target.value)}
              style={{
                width: '100%', padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text)',
              }}
            >
              {jobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}
            </select>
          )}
        </div>
      )}

      {activeJob?.customerName && <Field label="Customer" value={activeJob.customerName} />}
      {activeJob?.brokerName && <Field label="Broker" value={activeJob.brokerName} />}
      {activeJob?.material && <Field label="Material" value={activeJob.material} />}
      {pickupSite && <SiteField label="Pickup Site" site={pickupSite} onNavigate={onNavigate} onPinLocation={onPinLocation} />}
      {dumpSite && <SiteField label="Dump Site" site={dumpSite} onNavigate={onNavigate} onPinLocation={onPinLocation} />}
    </div>
  )
}

function SiteField({ label, site, onNavigate, onPinLocation }: {
  label: string; site: DumpTruckSite; onNavigate: (s: DumpTruckSite) => void; onPinLocation: (s: DumpTruckSite) => void
}) {
  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={fieldValueStyle}>{site.name}</div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onPinLocation(site)}
            title={site.lat != null ? 'Update this site’s GPS pin to your current location' : 'No GPS coordinates on file yet — tap to pin your current location'}
            style={{
              fontSize: '.72rem', fontWeight: 700, padding: '.3rem .55rem', borderRadius: 6,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: site.lat != null ? 'var(--muted)' : 'var(--warn)',
            }}
          >
            📍 {site.lat != null ? 'Update Pin' : 'Pin Location'}
          </button>
          <button
            onClick={() => onNavigate(site)}
            style={{
              fontSize: '.72rem', fontWeight: 700, padding: '.3rem .55rem', borderRadius: 6,
              background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)',
            }}
          >
            🧭 Navigate
          </button>
        </div>
      </div>
    </div>
  )
}

const fieldLabelStyle: React.CSSProperties = { fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }
const fieldValueStyle: React.CSSProperties = { fontSize: '.95rem', fontWeight: 700 }

function Field({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{ ...fieldValueStyle, fontSize: big ? '1.4rem' : '.95rem', fontWeight: big ? 900 : 700 }}>{value}</div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}
