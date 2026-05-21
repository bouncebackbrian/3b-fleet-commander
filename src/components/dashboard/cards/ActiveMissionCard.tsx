'use client'
import Link from 'next/link'
import type { LoadMission, SyncState, RouteRisk, MissionStop } from '@/lib/dashboard/types'
import type { ScoreResult, FuelIntelResult, ScoreVerdict, MarginFlag } from '@/lib/scoreLoad'
import type { LaneMetrics } from '@/hooks/useLaneIntelligence'
import { ROUTE_RISK_META, ROUTE_PREF_META } from '@/lib/dashboard/routePreference'
import StopTimeline from './StopTimeline'
import LaneSummaryCard      from './LaneSummaryCard'
import QuickStopTimer       from './QuickStopTimer'
import DeliveryCountdown    from '@/components/dashboard/clocks/DeliveryCountdown'

interface Props {
  mission:        LoadMission | null
  missionScore:   ScoreResult | null
  missionFuel:    FuelIntelResult | null
  insights?:      string[]
  syncState?:     SyncState
  routeRisk?:     RouteRisk | null
  driverMode?:    boolean
  laneSummary?:   LaneMetrics | null
  laneLoading?:   boolean
  onLogEvent?:    () => void
  onShowHistory?: () => void
  onCompleteStop?:  (stopId: string) => void
  onUndoStop?:      (stopId: string) => void
  onAddStop?:       () => void
  onTapStop?:       (stop: MissionStop) => void
  onTapLane?:         () => void
  onQuickArrive?:     () => Promise<void>
  onQuickLeave?:      (forceArriveNow: boolean) => Promise<void>
  quickSubmitting?:   boolean
  onCompleteTrip?:    () => void
  onShowCompleted?:   () => void
}

function SyncBadge({ state }: { state: SyncState }) {
  if (state === 'idle') return null
  const map: Record<SyncState, { label: string; bg: string; color: string; border: string }> = {
    idle:       { label: '',           bg: 'transparent',            color: 'transparent',       border: 'transparent'           },
    saving:     { label: '⟳ saving',   bg: 'rgba(245,194,0,.12)',    color: 'var(--warn)',        border: 'rgba(245,194,0,.25)'   },
    saved:      { label: '✓ synced',   bg: 'rgba(40,192,72,.12)',    color: 'var(--success)',     border: 'rgba(40,192,72,.25)'   },
    failed:     { label: '⚠ failed',   bg: 'rgba(232,64,0,.12)',     color: 'var(--error)',       border: 'rgba(232,64,0,.25)'    },
    local_only: { label: '📴 local',   bg: 'rgba(100,100,100,.1)',   color: 'var(--muted)',       border: 'rgba(100,100,100,.2)'  },
  }
  const s = map[state]
  return (
    <span style={{
      fontSize: '.62rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 5,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export default function ActiveMissionCard({ mission, missionScore, missionFuel, insights = [], syncState = 'idle', routeRisk, driverMode = false, laneSummary, laneLoading, onLogEvent, onShowHistory, onCompleteStop, onUndoStop, onAddStop, onTapStop, onTapLane, onQuickArrive, onQuickLeave, quickSubmitting, onCompleteTrip, onShowCompleted }: Props) {
  const stops = mission?.stops ?? []
  const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence)
  const currentStop = sortedStops.find(s => !s.completed) ?? null
  const doneCount   = sortedStops.filter(s => s.completed).length
  const hasStops    = sortedStops.length > 0
  return (
    <div className="cc-card" style={{ border: `1px solid ${mission ? 'rgba(0,232,176,.25)' : 'var(--border)'}`, boxShadow: mission ? '0 2px 20px rgba(0,232,176,.06)' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {mission && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)', animation: 'pulse 2s infinite', flexShrink: 0 }} />}
          <span style={{ fontWeight: 900, fontSize: 'var(--cc-card-title)' }}>{mission ? 'Active Load' : 'No Active Load'}</span>
          {mission?.loadNumber && <span style={{ fontWeight: 900, fontSize: 'var(--cc-card-title)', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{mission.loadNumber}</span>}
          {mission && <SyncBadge state={syncState} />}
          {mission?.date && <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600 }}>{mission.date}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mission ? (
            <>
              {onLogEvent && (
                <button onClick={onLogEvent} style={{ padding: '.5rem .9rem', borderRadius: 10, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.07)', fontSize: '.82rem', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center', gap: 5 }}>
                  📋 Log
                </button>
              )}
              {onShowHistory && (
                <button onClick={onShowHistory} style={{ padding: '.5rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', fontSize: '.82rem', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center', gap: 5 }}>
                  📊 History
                </button>
              )}
              <Link href="/loads" style={{ padding: '.5rem .9rem', borderRadius: 10, border: '1px solid rgba(0,232,176,.3)', fontSize: '.82rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none', minHeight: 40, display: 'flex', alignItems: 'center' }}>Open →</Link>
              <Link href="/dispatch" style={{ padding: '.5rem .9rem', borderRadius: 10, border: '1px solid var(--border)', fontSize: '.82rem', color: 'var(--text)', fontWeight: 700, textDecoration: 'none', minHeight: 40, display: 'flex', alignItems: 'center' }}>Dispatch</Link>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/loads" style={{ padding: '.55rem 1.2rem', borderRadius: 10, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.07)', fontSize: '.9rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', minHeight: 44 }}>⚡ New Load</Link>
              {onShowCompleted && (
                <button onClick={onShowCompleted} style={{ padding: '.55rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', fontSize: '.82rem', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', gap: 5 }}>
                  ✅ Completed
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {mission ? (
        <div style={{ display: 'grid', gap: '.8rem' }}>
          {/* ROUTE — large, glanceable */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, fontSize: 'clamp(1.25rem,3vw,1.75rem)', color: 'var(--text)', lineHeight: 1.15 }}>{mission.origin.split(',')[0]}</span>
            <span style={{ color: 'var(--primary)', fontWeight: 900, fontSize: '1.5rem' }}>→</span>
            {/* Multi-stop indicator */}
            {hasStops && (
              <span style={{ fontWeight: 700, fontSize: '.75rem', color: 'var(--primary)', padding: '.2rem .55rem', background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.25)', borderRadius: 6, flexShrink: 0 }}>
                {doneCount}/{sortedStops.length} stops
              </span>
            )}
            <span style={{ fontWeight: 900, fontSize: 'clamp(1.25rem,3vw,1.75rem)', color: 'var(--text)', lineHeight: 1.15 }}>{mission.destination.split(',')[0]}</span>
            {mission.broker && <span style={{ fontSize: '.72rem', color: 'var(--muted)', padding: '.2rem .55rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, flexShrink: 0 }}>{mission.broker}</span>}
            {/* Route risk badge */}
            {routeRisk && routeRisk.level !== 'LOW' && (() => {
              const rm = ROUTE_RISK_META[routeRisk.level]
              return (
                <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '.15rem .5rem', borderRadius: 5, background: rm.bg, color: rm.color, border: `1px solid ${rm.border}`, flexShrink: 0 }}>
                  {routeRisk.level === 'HIGH' ? '🔴' : '🟡'} {rm.label}
                </span>
              )
            })()}
            {/* Route preference badge — always shown when mission active */}
            {mission.routePreference && mission.routePreference !== 'main_corridors' && (() => {
              const pm = ROUTE_PREF_META[mission.routePreference]
              return (
                <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 5, background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', flexShrink: 0 }}>
                  {pm.emoji} {pm.label}
                </span>
              )
            })()}
          </div>
          {/* Route disclaimer if risk warning active */}
          {routeRisk?.showWarning && routeRisk.disclaimer && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '.35rem .7rem', borderRadius: 7, background: routeRisk.level === 'HIGH' ? 'rgba(232,64,0,.07)' : 'rgba(245,194,0,.07)', border: `1px solid ${ROUTE_RISK_META[routeRisk.level].border}` }}>
              <span style={{ fontSize: '.78rem', flexShrink: 0 }}>{routeRisk.level === 'HIGH' ? '🔴' : '🟡'}</span>
              <span style={{ fontSize: '.7rem', fontWeight: 700, color: ROUTE_RISK_META[routeRisk.level].color, lineHeight: 1.35 }}>
                {routeRisk.disclaimer}
              </span>
            </div>
          )}

          {/* ── Quick Arrive / Leave timer ── */}
          {onQuickArrive && onQuickLeave && currentStop && (
            <QuickStopTimer
              currentStop={currentStop}
              totalStops={sortedStops.length}
              driverMode={driverMode}
              submitting={quickSubmitting}
              onArrive={onQuickArrive}
              onLeave={onQuickLeave}
            />
          )}

          {/* ── Lane Intelligence summary strip ── */}
          {(laneSummary !== undefined || laneLoading) && (
            <LaneSummaryCard
              metrics={laneSummary ?? null}
              loading={laneLoading}
              onTap={onTapLane}
            />
          )}

          {/* ── Delivery countdown banner ── */}
          {hasStops && <DeliveryCountdown stops={sortedStops} />}

          {/* ── Stop Timeline (multi-stop loads) ── */}
          {hasStops && (
            <div style={{ padding: '.75rem .9rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <StopTimeline
                stops={sortedStops}
                onTapStop={onTapStop}
                onComplete={onCompleteStop}
                onUndo={onUndoStop}
                onAddStop={onAddStop}
              />
            </div>
          )}

          {/* Operational insight pills */}
          {insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {insights.slice(0, 2).map((ins, i) => (
                <div key={i} style={{ fontSize: '.75rem', fontWeight: 600, padding: '.3rem .65rem', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', lineHeight: 1.4 }}>
                  {ins}
                </div>
              ))}
              {insights.length > 2 && onShowHistory && (
                <button onClick={onShowHistory} style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', padding: '.1rem 0', cursor: 'pointer', textAlign: 'left' }}>
                  +{insights.length - 2} more insights →
                </button>
              )}
            </div>
          )}

          {/* Load meta */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: 'var(--cc-label)', color: 'var(--muted)', fontWeight: 600 }}>
            {mission.pickup    && <span>📅 Pickup: <strong style={{ color: 'var(--text)' }}>{mission.pickup}</strong></span>}
            {mission.delivery  && <span>📦 Delivery: <strong style={{ color: 'var(--text)' }}>{mission.delivery}</strong></span>}
            {mission.commodity && <span>🔧 {mission.commodity}</span>}
            <span>📍 {mission.dispatchMiles} mi{mission.deadheadMiles > 0 ? ` + ${mission.deadheadMiles} DH` : ''}</span>
          </div>

          {/* Score / financials — owner-operator only */}
          {!driverMode && (missionScore ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '.7rem .9rem', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ fontWeight: 900, fontSize: '2rem', lineHeight: 1, color: missionScore.verdictColor, fontVariantNumeric: 'tabular-nums' }}>
                  {missionScore.score}<span style={{ fontSize: '.9rem', color: 'var(--muted)', fontWeight: 600 }}>/12</span>
                </div>
                <span style={{
                  display: 'inline-flex', padding: '.15rem .5rem', borderRadius: 5, fontWeight: 800, fontSize: '.62rem', letterSpacing: '.06em', marginTop: 3,
                  background: (missionScore.verdict as ScoreVerdict) === 'TAKE' ? 'rgba(40,192,72,.12)' : (missionScore.verdict as ScoreVerdict) === 'AVOID' ? 'rgba(232,64,0,.12)' : 'rgba(245,194,0,.12)',
                  color:      (missionScore.verdict as ScoreVerdict) === 'TAKE' ? 'var(--success)'      : (missionScore.verdict as ScoreVerdict) === 'AVOID' ? 'var(--error)'       : 'var(--warn)',
                  border: `1px solid ${(missionScore.verdict as ScoreVerdict) === 'TAKE' ? 'rgba(40,192,72,.2)' : (missionScore.verdict as ScoreVerdict) === 'AVOID' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}`,
                }}>{missionScore.verdict}</span>
              </div>
              <div style={{ width: 1, height: 48, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                {([
                  { label: 'Gross',    val: mission.grossRate > 0 ? `$${mission.grossRate.toLocaleString()}` : '—', color: 'var(--text)' },
                  { label: 'Net RPM',  val: `$${missionScore.netRpm.toFixed(2)}`,            color: missionScore.marginColor },
                  { label: 'Fuel Est', val: `$${missionScore.fuelCost.toFixed(0)}`,           color: 'var(--warn)' },
                  { label: 'Net Est',  val: `$${missionScore.netMargin.toFixed(0)}`,          color: missionScore.netMargin >= 0 ? 'var(--success)' : 'var(--error)' },
                ]).map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{f.label}</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: f.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{f.val}</div>
                  </div>
                ))}
              </div>
              <span style={{
                display: 'inline-flex', padding: '.4rem .85rem', borderRadius: 8, fontWeight: 900, fontSize: '.78rem', letterSpacing: '.06em', flexShrink: 0,
                background: (missionScore.marginFlag as MarginFlag) === 'STRONG' ? 'rgba(40,192,72,.12)' : (missionScore.marginFlag as MarginFlag) === 'OK' ? 'rgba(0,232,176,.1)' : (missionScore.marginFlag as MarginFlag) === 'MARGINAL' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)',
                color: missionScore.marginColor,
                border: `1px solid ${missionScore.marginColor}30`,
              }}>{missionScore.marginFlag}</span>
            </div>
          ) : (
            <Link href="/loads" style={{ fontSize: '.85rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Add rate + miles to score →</Link>
          ))}

          {/* Fuel strip — gallons + range shown to everyone; cost only to owner-operator */}
          {missionFuel && missionFuel.totalMiles > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '.5rem .75rem', background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 10, fontSize: '.8rem', color: 'var(--muted)' }}>
              <span style={{ fontWeight: 800, color: 'var(--primary)', flexShrink: 0 }}>⛽ Fuel</span>
              <span>~{missionFuel.gallonsNeeded} gal</span>
              {!driverMode && <><span>·</span><span>${Math.round(missionFuel.fuelCostTotal)} est.</span></>}
              {!driverMode && <><span>·</span><span>${missionFuel.priceUsed.toFixed(2)}/gal{missionFuel.priceIsDefault && <span style={{ color: 'var(--warn)' }}> (est.)</span>}</span></>}
              {missionFuel.stops.length > 0 && missionFuel.stops[0].corridor !== 'N/A' && (
                <><span>·</span><span style={{ color: 'var(--primary)', fontWeight: 700 }}>{missionFuel.stops[0].name}</span></>
              )}
              {missionFuel.risks.some(r => r.level === 'HIGH') && (
                <span style={{ color: 'var(--error)', fontWeight: 700 }}>🔴 {missionFuel.risks.find(r => r.level === 'HIGH')?.message}</span>
              )}
            </div>
          )}

          {/* Risk flags — financial, owner-operator only */}
          {!driverMode && missionScore && (missionScore.highDeadhead || missionScore.counterOffer) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {missionScore.highDeadhead && (
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--warn)', padding: '.25rem .65rem', borderRadius: 6, background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.2)' }}>
                  ⚠️ High DH {missionScore.deadheadRatio.toFixed(0)}%
                </div>
              )}
              {missionScore.counterOffer && (
                <div style={{
                  fontSize: '.72rem', fontWeight: 700, padding: '.25rem .65rem', borderRadius: 6,
                  color:       (missionScore.marginFlag as MarginFlag) === 'REJECT' ? 'var(--error)' : 'var(--warn)',
                  background:  (missionScore.marginFlag as MarginFlag) === 'REJECT' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.08)',
                  border: `1px solid ${(missionScore.marginFlag as MarginFlag) === 'REJECT' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}`,
                }}>💬 {missionScore.counterOffer.slice(0, 55)}{missionScore.counterOffer.length > 55 ? '…' : ''}</div>
              )}
            </div>
          )}

          {/* ── Complete Trip CTA — bottom of grid, intentional placement ── */}
          {onCompleteTrip && (
            <div style={{ paddingTop: '.25rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={onCompleteTrip}
                style={{
                  width: '100%', padding: '.65rem', borderRadius: 10, fontWeight: 800, fontSize: '.82rem',
                  border: '1px solid rgba(40,192,72,.3)', background: 'rgba(40,192,72,.06)',
                  color: 'var(--success)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                🏁 Complete Trip &amp; Review
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>Your latest load appears here with live score, net RPM, margin flag, and risk alerts.</p>
          {onShowCompleted && (
            <button
              onClick={onShowCompleted}
              style={{ alignSelf: 'flex-start', padding: '.45rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer' }}
            >
              ✅ View Completed Trips
            </button>
          )}
        </div>
      )}
    </div>
  )
}
