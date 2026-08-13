'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { groupRecurringIssues, type RecurringIssueDefect, type RecurringIssueGroup } from '@/lib/dumpTruck/recurringIssues'
import type { DefectSeverity } from '@/lib/dumpTruck/types'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }

const SEVERITY_COLOR: Record<DefectSeverity, string> = {
  monitor: 'var(--muted)', non_safety: 'var(--muted)', safety_critical: 'var(--warn)', out_of_service: 'var(--error)',
}
const SEVERITY_LABEL: Record<DefectSeverity, string> = {
  monitor: 'Monitor', non_safety: 'Non-Safety', safety_critical: 'Safety-Critical', out_of_service: 'Out of Service',
}

interface DefectDTO {
  id: string
  truckId: string
  description: string
  severity: DefectSeverity
  status: string
  createdAt: string
  reportedBy: string | null
}

function toCategoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/**
 * KPI/Pareto view of what keeps breaking, grouped from the same raw
 * fleet_dt_defects rows the driver-facing Hector report reads — a physical
 * issue re-logged 8 times across repeated pretrips shows here as one row
 * with a count of 8, not 8 separate open-defect entries.
 */
export default function RecurringIssuesPage() {
  const [defects, setDefects] = useState<DefectDTO[]>([])
  const [equipment, setEquipment] = useState<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }>({ trucks: [], trailers: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/fleet/dump-truck/defects').then(r => r.json()).then(b => b.defects ?? []),
      fetch('/api/fleet/dump-truck/equipment').then(r => r.json()),
    ]).then(([defects, equipment]) => {
      setDefects(defects)
      setEquipment(equipment)
    }).finally(() => setLoading(false))
  }, [])

  const unitFor = (id: string) =>
    equipment.trucks.find(t => t.id === id)?.unitNumber ?? equipment.trailers.find(t => t.id === id)?.unitNumber ?? '—'

  const input: RecurringIssueDefect[] = defects.map(d => ({
    id: d.id, truckId: d.truckId, description: d.description, severity: d.severity, status: d.status, createdAt: d.createdAt,
    reportedBy: d.reportedBy,
  }))
  const groups: RecurringIssueGroup[] = groupRecurringIssues(input)
  const recurring = groups.filter(g => g.totalCount > 1)
  const oneOff = groups.filter(g => g.totalCount === 1)

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Recurring Issues</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          How often each physical issue has been logged, grouped from the last 100 defect reports across the fleet —
          same data as the driver-facing override report, rolled up for corrective-action tracking instead of
          per-shift dispatch. See per-truck and per-driver breakdowns on the{' '}
          <Link href="/admin/dump-truck/kpis" style={{ color: 'var(--primary)', fontWeight: 700 }}>Fleet KPIs</Link> page.{' '}
          <Link href="/admin/dump-truck" style={{ color: 'var(--primary)', fontWeight: 700 }}>← Back to Dump Truck Setup</Link>
        </p>
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>}

      {!loading && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>
            Recurring ({recurring.length})
          </h2>
          {recurring.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No issue has been logged more than once yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {recurring.map(g => (
              <div key={g.category} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '.95rem' }}>{toCategoryLabel(g.category)}</span>
                    <span style={{ fontWeight: 800, color: SEVERITY_COLOR[g.highestSeverity], fontSize: '.78rem', marginLeft: 8 }}>
                      {SEVERITY_LABEL[g.highestSeverity]}
                    </span>
                  </div>
                  <div style={{ fontSize: '.85rem', fontWeight: 800 }}>
                    ×{g.totalCount}{g.openCount > 0 && <span style={{ color: 'var(--error)', marginLeft: 6 }}>({g.openCount} open)</span>}
                  </div>
                </div>
                <div style={{ margin: '.4rem 0', fontSize: '.85rem', color: 'var(--muted)' }}>{g.sampleDescription}</div>
                <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)' }}>
                  <span>Trucks: <strong style={{ color: 'var(--text)' }}>{g.truckIds.map(unitFor).join(', ')}</strong></span>
                  <span>First seen: <strong style={{ color: 'var(--text)' }}>{new Date(g.firstSeenAt).toLocaleDateString()}</strong></span>
                  <span>Last seen: <strong style={{ color: 'var(--text)' }}>{new Date(g.lastSeenAt).toLocaleDateString()}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && oneOff.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>
            Logged Once ({oneOff.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {oneOff.map(g => (
              <div key={g.category} style={{ fontSize: '.82rem', display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--border)', paddingTop: '.4rem' }}>
                <span>{g.sampleDescription}</span>
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{unitFor(g.truckIds[0])} · {new Date(g.lastSeenAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
