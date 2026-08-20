'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { WeatherData, WeatherInfo } from '@/lib/dashboard/types'
import type { FlowStateId } from '@/lib/dumpTruck/stateMachine'
import { travelStatusFor, TRAVEL_STATUS_LABEL, TRAVEL_STATUS_ICON } from '@/lib/dumpTruck/travelStatus'
import { getCurrentUser } from '@/lib/auth-adapter'
import type { UserMode } from '@/lib/userMode'
import UserModeSelectorSheet from '@/components/layout/UserModeSelectorSheet'

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
  /** Spec §5.3 — explicit INBOUND/OUTBOUND/JOB SITE context, derived
   *  read-only from the flow state (see travelStatus.ts), no new events. */
  flowState?: FlowStateId | null
  /** Spec §6 EN/ES foundation — storage + toggle only, no translation pipeline yet. */
  preferredLanguage?: 'en' | 'es'
  onLanguageChange?: (language: 'en' | 'es') => void
  /** Small, secondary safety affordance — see SafetySheet. Omit to hide the icon entirely. */
  onSafety?: () => void
}

export default function TopStatusBar({
  isOnline, pendingCount, failedCount, gpsPermission, wx, weather, weatherLoading, businessName, driverName, flowState,
  preferredLanguage, onLanguageChange, onSafety,
}: Props) {
  const travelStatus = flowState ? travelStatusFor(flowState) : null

  // This cockpit has no Sidebar/BottomNav (deliberately full-screen, see
  // layout.tsx) — a member who holds only the driver portal never needs a
  // way out. Someone who *also* holds dispatch/admin/broker does (e.g. they
  // landed here because their last-picked focus was "driver"), so give them
  // a small, portal-gated way back rather than trapping them with no nav at
  // all. Never shown to a single-portal driver.
  const router = useRouter()
  const [canSwitchFocus, setCanSwitchFocus] = useState(false)
  const [showModeSheet, setShowModeSheet] = useState(false)
  useEffect(() => {
    let cancelled = false
    getCurrentUser().then(user => {
      if (cancelled) return
      const portalCount = Object.keys(user?.portals ?? {}).length
      setCanSwitchFocus(portalCount > 1)
    })
    return () => { cancelled = true }
  }, [])

  // This page has no nav to click after switching — take them somewhere
  // useful for the newly-picked focus instead of leaving them stranded here.
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<UserMode>).detail
      if (!mode || mode === 'driver') return
      router.push(mode === 'broker' ? '/broker' : '/admin/dump-truck')
    }
    window.addEventListener('3b-mode-changed', handler)
    return () => window.removeEventListener('3b-mode-changed', handler)
  }, [router])

  return (
    <div style={{
      minHeight: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '.5rem', padding: '.5rem 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
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
        {travelStatus && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '.4rem .85rem', borderRadius: 999,
            background: 'var(--primary)', color: 'var(--dt-on-primary, #04140f)', fontWeight: 900, fontSize: '.85rem', letterSpacing: '.02em',
          }}>
            <span>{TRAVEL_STATUS_ICON[travelStatus]}</span>
            {TRAVEL_STATUS_LABEL[travelStatus].toUpperCase()}
          </span>
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
        {preferredLanguage && onLanguageChange && (
          <button
            onClick={() => onLanguageChange(preferredLanguage === 'en' ? 'es' : 'en')}
            title="Switch language / Cambiar idioma"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 700,
              padding: '.35rem .6rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}
          >
            🌐 {preferredLanguage === 'en' ? 'EN' : 'ES'}
          </button>
        )}
        <Link
          href="/driver/tax-info"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)',
            padding: '.35rem .6rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}
        >
          🧾 Tax Info
        </Link>
        {onSafety && (
          <button
            onClick={onSafety}
            title="Safety / Emergency"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error)',
              padding: '.35rem .6rem', borderRadius: 8, background: 'rgba(220,38,38,.08)', border: '1px solid var(--error)',
            }}
          >
            🆘
          </button>
        )}
        {canSwitchFocus && (
          <button
            onClick={() => setShowModeSheet(true)}
            title="Switch to Dispatch/Admin focus"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)',
              padding: '.35rem .6rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}
          >
            🔀 Switch Focus
          </button>
        )}
      </div>

      {showModeSheet && (
        <UserModeSelectorSheet open={showModeSheet} onClose={() => setShowModeSheet(false)} />
      )}
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
