'use client'
import Link from 'next/link'
import type { WeatherData, WeatherInfo } from '@/lib/dashboard/types'

interface Props {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  gpsPermission: 'granted' | 'denied' | 'unavailable' | 'not_requested' | 'timeout' | null
  wx?: WeatherInfo | null
  weather?: WeatherData | null
  weatherLoading?: boolean
  businessName?: string | null
  driverName?: string | null
}

export default function TopStatusBar({
  isOnline, pendingCount, failedCount, gpsPermission, wx, weather, weatherLoading, businessName, driverName,
}: Props) {
  return (
    <div style={{
      height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🚛</span> Dump Truck Mode
        </div>
        {(businessName || driverName) && (
          <div style={{
            fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, marginLeft: 26,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {[businessName, driverName].filter(Boolean).join(' · ')}
          </div>
        )}
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
        {wx && weather && (
          <StatusChip
            label={`${weather.temp}°F · ${weather.windSpeed}mph`}
            color={wx.severe ? 'var(--warn)' : 'var(--muted)'}
            icon={weatherLoading ? '⏳' : wx.emoji}
          />
        )}
        <Link
          href="/driver/hours"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)',
            padding: '.35rem .6rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}
        >
          📊 Hours
        </Link>
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
