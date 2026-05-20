'use client'
import Link from 'next/link'
import type { FuelIntelResult } from '@/lib/scoreLoad'

interface Props {
  open:       boolean
  onClose:    () => void
  missionFuel: FuelIntelResult | null
}

export default function FuelPlanSheet({ open, onClose, missionFuel }: Props) {
  if (!open) return null
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.15)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '85dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>⛽ Fuel Plan</div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>
        {missionFuel && missionFuel.totalMiles > 0 ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8 }}>
              {[
                { label: 'Est. Cost',   val: `$${Math.round(missionFuel.fuelCostTotal)}`,                                                               color: 'var(--warn)' },
                { label: 'Gallons',     val: `~${missionFuel.gallonsNeeded} gal`,                                                                        color: 'var(--text)' },
                { label: 'Price/Gal',   val: `$${missionFuel.priceUsed.toFixed(2)}${missionFuel.priceIsDefault ? '*' : ''}`,                             color: 'var(--text)' },
                { label: 'Total Miles', val: `${missionFuel.totalMiles} mi`,                                                                             color: 'var(--muted)' },
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
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', fontStyle: 'italic' }}>* Fuel price is national avg estimate — verify at pump</div>
            )}
          </div>
        ) : (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⛽</div>
            Add a load with origin, destination, and miles to see the fuel plan.
            <br />
            <Link href="/loads" style={{ display: 'inline-block', marginTop: '.75rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Add Load →</Link>
          </div>
        )}
      </div>
    </>
  )
}
