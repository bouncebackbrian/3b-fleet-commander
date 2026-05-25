'use client'
/**
 * ServiceHistoryPanel — PM completion history for a tractor.
 * Shows completed PMs with date, odometer, cost, tech/location.
 */
import { PM_CONFIG, type PMRecord, type TractorMaintenance } from '@/lib/maintenanceEngine'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  tractor:   TractorMaintenance
  limit?:    number
  showAll?:  boolean
}

export default function ServiceHistoryPanel({ tractor, limit = 5, showAll = false }: Props) {
  const history = [...tractor.pmHistory]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, showAll ? undefined : limit)

  if (history.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '.82rem',
        background: 'var(--surface-2)', borderRadius: 12,
      }}>
        🔧 No service history yet.<br />
        <span style={{ fontSize: '.72rem' }}>Complete a PM to build your maintenance record.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {history.map((record: PMRecord) => {
        const cfg = PM_CONFIG[record.pmType]
        return (
          <div key={record.id} style={{
            background: 'var(--surface-2)', borderRadius: 12, padding: '.7rem .9rem',
            borderLeft: '3px solid var(--success)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem' }}>{cfg?.emoji ?? '🔧'}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.85rem' }}>
                    {cfg?.label ?? record.pmType}
                  </div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                    {fmtDate(record.completedAt)}
                    {record.odometerAt > 0 && <span> · {record.odometerAt.toLocaleString()} mi</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {record.cost !== undefined && (
                  <div style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--text)' }}>
                    ${record.cost.toFixed(2)}
                  </div>
                )}
                <span style={{
                  fontSize: '.6rem', fontWeight: 800, color: 'var(--success)',
                  background: 'rgba(0,232,176,.1)', padding: '1px 8px', borderRadius: 20,
                }}>
                  ✅ Completed
                </span>
              </div>
            </div>
            {(record.serviceLocation || record.techName) && (
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 4 }}>
                {record.serviceLocation && <span>📍 {record.serviceLocation}</span>}
                {record.techName && <span style={{ marginLeft: 8 }}>👤 {record.techName}</span>}
              </div>
            )}
            {record.notes && (
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: 3 }}>
                {record.notes}
              </div>
            )}
            {record.receiptDocId && (
              <div style={{ marginTop: 5 }}>
                <span style={{ fontSize: '.62rem', fontWeight: 700, color: '#60c8ff' }}>
                  📎 Receipt attached
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
