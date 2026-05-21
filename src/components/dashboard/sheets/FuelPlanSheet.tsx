'use client'
import Link from 'next/link'
import type { FuelIntelResult } from '@/lib/scoreLoad'
import type { LoadMission, RoutePreference } from '@/lib/dashboard/types'
import { computeRouteRisk, ROUTE_PREF_META, ROUTE_RISK_META } from '@/lib/dashboard/routePreference'

interface Props {
  open:               boolean
  onClose:            () => void
  missionFuel:        FuelIntelResult | null
  mission?:           LoadMission | null
  onChangePreference?: (pref: RoutePreference) => void
}

const PREFS: RoutePreference[] = ['main_corridors', 'fastest', 'fuel_saver', 'avoid_cities', 'manual_review']

export default function FuelPlanSheet({ open, onClose, missionFuel, mission, onChangePreference }: Props) {
  if (!open) return null

  const currentPref = mission?.routePreference ?? 'main_corridors'
  const routeRisk   = computeRouteRisk(mission?.routeNotes, currentPref)
  const riskMeta    = ROUTE_RISK_META[routeRisk.level]
  const prefMeta    = ROUTE_PREF_META[currentPref]

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.15)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '90dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>⛽ Fuel & Route Plan</div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>

          {/* ── ROUTE PREFERENCE SECTION ── */}
          {mission && (
            <div style={{ padding: '.85rem 1rem', borderRadius: 12, background: 'var(--surface-2)', border: `1px solid ${routeRisk.showWarning ? riskMeta.border : 'var(--border)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Route Preference</span>
                <span style={{ fontSize: '.62rem', fontWeight: 800, padding: '.15rem .5rem', borderRadius: 5, background: riskMeta.bg, color: riskMeta.color, border: `1px solid ${riskMeta.border}` }}>
                  {riskMeta.label}
                </span>
              </div>

              {/* Current preference pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>{prefMeta.emoji}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.9rem', color: 'var(--primary)' }}>{prefMeta.label}</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>{prefMeta.desc}</div>
                </div>
              </div>

              {/* Preference picker */}
              {onChangePreference && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {PREFS.map(p => {
                    const m = ROUTE_PREF_META[p]
                    const active = currentPref === p
                    return (
                      <button key={p} onClick={() => onChangePreference(p)} style={{
                        display: 'flex', alignItems: 'center', gap: 3, padding: '.3rem .55rem',
                        borderRadius: 7, border: active ? '1px solid rgba(0,232,176,.5)' : '1px solid var(--border)',
                        background: active ? 'rgba(0,232,176,.12)' : 'transparent',
                        color: active ? 'var(--primary)' : 'var(--muted)',
                        fontSize: '.65rem', fontWeight: 700, cursor: 'pointer',
                      }}>
                        {m.emoji} {m.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Route notes */}
              {mission.routeNotes && (
                <div style={{ marginTop: 8, padding: '.4rem .65rem', borderRadius: 7, background: 'var(--surface-off)', border: '1px solid var(--border)', fontSize: '.72rem', color: 'var(--muted)' }}>
                  📝 {mission.routeNotes}
                </div>
              )}

              {/* Warning / disclaimer */}
              {routeRisk.showWarning && routeRisk.disclaimer && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start', padding: '.5rem .75rem', borderRadius: 8, background: routeRisk.level === 'HIGH' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.08)', border: `1px solid ${riskMeta.border}` }}>
                  <span style={{ fontSize: '.85rem', flexShrink: 0 }}>{routeRisk.level === 'HIGH' ? '🔴' : '🟡'}</span>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: riskMeta.color, marginBottom: 2 }}>
                      {routeRisk.disclaimer}
                    </div>
                    {routeRisk.reasons.map((r, i) => (
                      <div key={i} style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>• {r}</div>
                    ))}
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                      Stay on main corridor unless dispatcher approves alternate.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FUEL STATS ── */}
          {missionFuel && missionFuel.totalMiles > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8 }}>
                {[
                  { label: 'Est. Cost',   val: `$${Math.round(missionFuel.fuelCostTotal)}`,                                                color: 'var(--warn)' },
                  { label: 'Gallons',     val: `~${missionFuel.gallonsNeeded} gal`,                                                         color: 'var(--text)' },
                  { label: 'Price/Gal',   val: `$${missionFuel.priceUsed.toFixed(2)}${missionFuel.priceIsDefault ? '*' : ''}`,              color: 'var(--text)' },
                  { label: 'Total Miles', val: `${missionFuel.totalMiles} mi`,                                                              color: 'var(--muted)' },
                ].map(f => (
                  <div key={f.label} style={{ textAlign: 'center', padding: '.6rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: f.color, fontVariantNumeric: 'tabular-nums' }}>{f.val}</div>
                  </div>
                ))}
              </div>

              {missionFuel.stops.length > 0 ? (
                <div>
                  <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Love&apos;s Corridor Stops</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {missionFuel.stops.map((stop, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.6rem .9rem', borderRadius: 10, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)' }}>
                        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⛽</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{stop.name}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>{stop.location} · {stop.corridor} · ~{stop.estGal} gal</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '.9rem', color: 'var(--warn)', fontVariantNumeric: 'tabular-nums' }}>${stop.estCost.toFixed(0)}</div>
                          <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>{stop.network}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.82rem', color: 'var(--muted)' }}>
                  No Love&apos;s corridor stops identified — plan fuel stops manually before departure.
                </div>
              )}

              {missionFuel.risks.length > 0 && (
                <div style={{ display: 'grid', gap: 5 }}>
                  {missionFuel.risks.map((r, i) => (
                    <div key={i} style={{
                      padding: '.4rem .75rem', borderRadius: 8, fontSize: '.75rem', fontWeight: 700,
                      background: r.level === 'HIGH' ? 'rgba(232,64,0,.08)' : r.level === 'MODERATE' ? 'rgba(245,194,0,.07)' : 'rgba(0,232,176,.05)',
                      color:      r.level === 'HIGH' ? 'var(--error)'       : r.level === 'MODERATE' ? 'var(--warn)'          : 'var(--muted)',
                      border:     `1px solid ${r.level === 'HIGH' ? 'rgba(232,64,0,.2)' : r.level === 'MODERATE' ? 'rgba(245,194,0,.18)' : 'rgba(0,232,176,.12)'}`,
                    }}>{r.level === 'HIGH' ? '🔴' : r.level === 'MODERATE' ? '🟡' : 'ℹ️'} {r.message}</div>
                  ))}
                </div>
              )}

              {missionFuel.priceIsDefault && (
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', fontStyle: 'italic' }}>* Diesel price is national avg estimate — verify at pump</div>
              )}
            </>
          ) : (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⛽</div>
              Add a load with origin, destination, and miles to see the fuel plan.
              <br />
              <Link href="/loads" style={{ display: 'inline-block', marginTop: '.75rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Add Load →</Link>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
