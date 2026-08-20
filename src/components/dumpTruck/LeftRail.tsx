'use client'
import type { FlowStateId } from '@/lib/dumpTruck/stateMachine'
import { isCustodyOpen } from '@/lib/dumpTruck/stateMachine'
import type { DumpTruckJob, DumpTruckSite } from '@/lib/dumpTruck/types'

interface Props {
  flowState: FlowStateId
  truckUnit: string | null
  trailerUnit: string | null
  jobs: DumpTruckJob[]
  activeJobId: string | null
  onChangeJob: (id: string) => void
  sites: DumpTruckSite[]
  onNavigate: (site: DumpTruckSite) => void
  onPinLocation: (site: DumpTruckSite) => void
  onEditJob: () => void
  onViewTicket: () => void
}

export default function LeftRail({
  flowState, truckUnit, trailerUnit, jobs, activeJobId, onChangeJob, sites, onNavigate, onPinLocation, onEditJob, onViewTicket,
}: Props) {
  const activeJob = jobs.find(j => j.id === activeJobId) ?? null
  const pickupSite = sites.find(s => s.id === activeJob?.pickupSiteId)
  const dumpSite = sites.find(s => s.id === activeJob?.dumpSiteId)

  // Only today's dated jobs are real candidates for the picker — older
  // undated jobs that never got closed out (see the "multiple PO dropdown"
  // bug history) shouldn't resurface here just because they're still
  // technically active/scheduled. Falls back to all jobs only when nothing
  // is dated for today, so a genuinely undated standing job still shows.
  const todayIso = new Date().toISOString().slice(0, 10)
  const pickableJobs = jobs.some(j => j.deliveryDate === todayIso)
    ? jobs.filter(j => j.deliveryDate === todayIso)
    : jobs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <Field label="Truck / Unit" value={truckUnit ?? '—'} />
      {trailerUnit && <Field label="Trailer" value={trailerUnit} />}
      <Field label="Custody" value={isCustodyOpen(flowState) ? 'With Driver' : 'Not in Custody'} />

      {pickableJobs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={fieldLabelStyle}>Job</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onViewTicket}
                style={{
                  fontSize: '.68rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 6,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)',
                }}
              >
                🎫 Ticket
              </button>
              <button
                onClick={onEditJob}
                style={{
                  fontSize: '.68rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 6,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)',
                }}
              >
                ✏️ Edit
              </button>
            </div>
          </div>
          {pickableJobs.length === 1 ? (
            <div style={fieldValueStyle}>{pickableJobs[0].jobNumber}</div>
          ) : (
            <select
              value={activeJobId ?? ''}
              onChange={e => onChangeJob(e.target.value)}
              style={{
                width: '100%', padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text)',
              }}
            >
              {pickableJobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}
            </select>
          )}
        </div>
      )}

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={fieldValueStyle}>{value}</div>
    </div>
  )
}
