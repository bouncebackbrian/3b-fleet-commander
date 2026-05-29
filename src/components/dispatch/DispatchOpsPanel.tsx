'use client'
/**
 * DispatchOpsPanel — DispatchOps AI v2
 *
 * Control-tower intelligence overlay for the /dispatch page.
 * Mounts above the existing DispatchFeed + message templates.
 *
 * Sections:
 *   1. Fleet Health Summary bar (totals + avg score)
 *   2. Active Load Health Cards (stall monitor, scores, recovery windows)
 *   3. Fleet Exception Timeline (cross-load)
 *
 * Data flow:
 *   - Reads active-trip from localStorage (3b-active-trip)
 *   - Reads HOS data (3b-hos-data)
 *   - Reads weather state from WeatherState prop (passed from parent)
 *   - Calls deriveLoadHealth() → updates every 60 s via card-level timers
 */
import { useState, useEffect } from 'react'
import LoadHealthCard   from '@/components/dispatch/LoadHealthCard'
import ExceptionTimeline from '@/components/dispatch/ExceptionTimeline'
import {
  deriveLoadHealth,
  buildFleetHealthSummary,
  HEALTH_STATUS_META,
  type LoadHealthScore,
  type FleetHealthSummary,
  type RecoveryWindow,
  type DeriveHealthOpts,
  logException,
} from '@/lib/loadHealthEngine'
import { logHumanAction } from '@/lib/dispatchEngine'

// ── Fleet health bar ──────────────────────────────────────────────────────────

function FleetHealthBar({ summary }: { summary: FleetHealthSummary }) {
  const scoreColor = summary.avgScore >= 80 ? 'var(--primary)' : summary.avgScore >= 60 ? 'var(--warn)' : 'var(--error)'

  if (summary.totalLoads === 0) {
    return (
      <div style={{
        padding: '.7rem 1rem', borderRadius: 12,
        background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)',
        fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: '1rem' }}>🚛</span>
        No active loads tracked — build a trip to enable DispatchOps AI monitoring
      </div>
    )
  }

  const statusTiles = [
    { label: 'On Track', count: summary.healthy,  color: 'var(--primary)', bg: 'rgba(0,232,176,.07)',  border: 'rgba(0,232,176,.2)' },
    { label: 'Monitor',  count: summary.monitor,  color: 'var(--warn)',    bg: 'rgba(245,194,0,.07)', border: 'rgba(245,194,0,.2)' },
    { label: 'At Risk',  count: summary.atRisk,   color: '#f97316',        bg: 'rgba(249,115,22,.07)',border: 'rgba(249,115,22,.2)' },
    { label: 'Critical', count: summary.critical, color: 'var(--error)',   bg: 'rgba(232,64,0,.08)',  border: 'rgba(232,64,0,.25)' },
  ]

  return (
    <div style={{
      padding: '.75rem 1rem', borderRadius: 12,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'grid', gap: '.6rem',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
          🛰 Fleet Health Overview
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {summary.activeStalls > 0 && (
            <div style={{
              fontSize: '.62rem', fontWeight: 800, color: 'var(--error)',
              padding: '.2rem .6rem', borderRadius: 10,
              background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.3)',
            }}>
              🔴 {summary.activeStalls} stall{summary.activeStalls > 1 ? 's' : ''} detected
            </div>
          )}
          <div style={{ fontSize: '.8rem', fontWeight: 900, color: scoreColor }}>
            Avg {summary.avgScore}
          </div>
        </div>
      </div>

      {/* Status tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
        {statusTiles.map(t => (
          <div key={t.label} style={{
            padding: '.45rem .5rem', borderRadius: 8, textAlign: 'center',
            background: t.bg, border: `1px solid ${t.border}`,
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: t.color, lineHeight: 1 }}>{t.count}</div>
            <div style={{ fontSize: '.55rem', color: t.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Top flag */}
      {summary.topFlag && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '.4rem .7rem', borderRadius: 8,
          background: summary.topFlag.severity === 'critical' ? 'rgba(232,64,0,.07)' : 'rgba(245,194,0,.07)',
          border: `1px solid ${summary.topFlag.severity === 'critical' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}`,
        }}>
          <span style={{ fontSize: '.7rem' }}>{summary.topFlag.severity === 'critical' ? '🚨' : '⚠️'}</span>
          <span style={{ fontSize: '.62rem', fontWeight: 800, color: summary.topFlag.severity === 'critical' ? 'var(--error)' : 'var(--warn)' }}>
            Top concern: {summary.topFlag.label}
            {summary.topFlag.value && ` · ${summary.topFlag.value}`}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ActiveTripData {
  loadNumber?:  string | null
  totalMiles?:  number
  estArrival?:  string
}

interface WeatherFactors {
  severe?: boolean
  windMph?: number
}

interface Props {
  dispatcherName?: string
  weather?:        WeatherFactors
}

export default function DispatchOpsPanel({ dispatcherName = 'Dispatcher', weather = {} }: Props) {
  const [loads,   setLoads]   = useState<Array<{ loadNumber: string; driverName: string; opts: DeriveHealthOpts }>>([])
  const [scores,  setScores]  = useState<LoadHealthScore[]>([])
  const [summary, setSummary] = useState<FleetHealthSummary>({ totalLoads: 0, healthy: 0, monitor: 0, atRisk: 0, critical: 0, activeStalls: 0, avgScore: 0, topFlag: null })
  const [tab,     setTab]     = useState<'loads' | 'exceptions'>('loads')
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  useEffect(() => {
    try {
      const hosRaw  = localStorage.getItem('3b-hos-data')
      const hosData = hosRaw ? JSON.parse(hosRaw) : {}
      const tripRaw = localStorage.getItem('3b-active-trip')
      const trip: ActiveTripData = tripRaw ? JSON.parse(tripRaw) : {}

      if (!trip.loadNumber) { setLoads([]); setScores([]); setSummary({ totalLoads: 0, healthy: 0, monitor: 0, atRisk: 0, critical: 0, activeStalls: 0, avgScore: 0, topFlag: null }); return }

      const driverName = hosData?.driverName ?? 'Driver'

      const loadList = [{
        loadNumber: trip.loadNumber,
        driverName,
        opts: {
          driveRemHrs:    hosData?.driveRemainingHrs,
          milesRemaining: trip.totalMiles,
          estArrival:     trip.estArrival,
          weatherSevere:  weather.severe,
          windMph:        weather.windMph,
        } as DeriveHealthOpts,
      }]

      setLoads(loadList)

      const derivedScores = loadList.map(l => deriveLoadHealth(l.loadNumber, l.opts))
      setScores(derivedScores)
      setSummary(buildFleetHealthSummary(derivedScores))
    } catch { /* ignore */ }
  }, [weather.severe, weather.windMph])

  const handleActionLog = (w: RecoveryWindow, loadNumber: string) => {
    // Log as human action in dispatch engine
    logHumanAction({
      escalationId: '',
      loadNumber,
      actor:   dispatcherName,
      action:  'note_added',
      note:    `DispatchOps AI recovery action: ${w.title} — ${w.description}`,
    })
    // Also log as exception resolution note
    logException({
      loadNumber,
      type:          'no_updates',
      title:         `Recovery Action: ${w.title}`,
      body:          w.description,
      escalated:     false,
      autoGenerated: false,
    })
    setActionFeedback(`✅ ${w.title} — logged to dispatch record`)
    setTimeout(() => setActionFeedback(null), 5000)
  }

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>

      {/* Fleet health summary */}
      <FleetHealthBar summary={summary} />

      {/* Action feedback */}
      {actionFeedback && (
        <div style={{
          padding: '.55rem .9rem', borderRadius: 10,
          background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.25)',
          fontSize: '.72rem', fontWeight: 800, color: 'var(--primary)',
        }}>
          {actionFeedback}
        </div>
      )}

      {/* Tab bar */}
      {loads.length > 0 && (
        <div style={{ display: 'flex', gap: '.35rem' }}>
          {(['loads', 'exceptions'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '.35rem .75rem', borderRadius: 8, fontSize: '.65rem', fontWeight: 800,
                border: `1px solid ${tab === t ? 'rgba(0,232,176,.35)' : 'var(--border)'}`,
                background: tab === t ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
                color: tab === t ? 'var(--primary)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {t === 'loads' ? '🚛 Load Health' : '📋 Exceptions'}
              {t === 'exceptions' && summary.critical + summary.atRisk > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: '.55rem', fontWeight: 900,
                  padding: '.1rem .35rem', borderRadius: 8,
                  background: 'rgba(232,64,0,.15)', color: 'var(--error)',
                }}>
                  {summary.critical + summary.atRisk}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Load health cards */}
      {tab === 'loads' && loads.map(l => (
        <LoadHealthCard
          key={l.loadNumber}
          loadNumber={l.loadNumber}
          driverName={l.driverName}
          opts={l.opts}
          onActionLog={handleActionLog}
        />
      ))}

      {/* Exception timeline */}
      {tab === 'exceptions' && (
        <ExceptionTimeline maxItems={25} />
      )}
    </div>
  )
}
