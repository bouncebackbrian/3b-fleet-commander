'use client'

interface Props {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  gpsPermission: 'granted' | 'denied' | 'unavailable' | 'not_requested' | 'timeout' | null
}

export default function TopStatusBar({ isOnline, pendingCount, failedCount, gpsPermission }: Props) {
  return (
    <div style={{
      height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ fontWeight: 900, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🚛</span> Dump Truck Mode
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '.8rem', fontWeight: 700 }}>
        <StatusChip
          label={isOnline ? 'Online' : 'Offline'}
          color={isOnline ? 'var(--success)' : 'var(--error)'}
          icon={isOnline ? '🟢' : '📴'}
        />
        {(pendingCount > 0 || failedCount > 0) && (
          <StatusChip
            label={failedCount > 0 ? `${failedCount} retry` : `${pendingCount} syncing`}
            color={failedCount > 0 ? 'var(--error)' : 'var(--warn)'}
            icon="☁️"
          />
        )}
        {pendingCount === 0 && failedCount === 0 && (
          <StatusChip label="Synced" color="var(--success)" icon="☁️" />
        )}
        <StatusChip
          label={gpsLabel(gpsPermission)}
          color={gpsPermission === 'granted' ? 'var(--success)' : 'var(--muted)'}
          icon="📍"
        />
      </div>
    </div>
  )
}

function gpsLabel(p: Props['gpsPermission']): string {
  if (p === 'granted') return 'GPS'
  if (p === 'denied') return 'GPS off'
  if (p === 'timeout') return 'GPS slow'
  return 'GPS —'
}

function StatusChip({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color }}>
      <span style={{ fontSize: '.7rem' }}>{icon}</span> {label}
    </span>
  )
}
