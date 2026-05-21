'use client'
import type { LaneMetrics } from '@/hooks/useLaneIntelligence'

interface Props {
  open:        boolean
  onClose:     () => void
  metrics:     LaneMetrics | null
  loading?:    boolean
  driverMode?: boolean
}

// ── Style atoms ───────────────────────────────────────────────────────────────
const SECTION: React.CSSProperties = {
  fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '.1em', color: 'var(--muted)', marginBottom: '.6rem',
}

const RISK_META = {
  LOW:      { bg: 'rgba(40,192,72,.1)',  border: 'rgba(40,192,72,.25)',  color: 'var(--success)', label: 'LOW RISK',      emoji: '🟢', subtext: 'This lane runs clean based on your history.' },
  MODERATE: { bg: 'rgba(245,194,0,.1)', border: 'rgba(245,194,0,.25)',  color: 'var(--warn)',    label: 'MODERATE RISK', emoji: '🟡', subtext: 'Some issues logged — plan ahead.' },
  HIGH:     { bg: 'rgba(232,64,0,.1)',  border: 'rgba(232,64,0,.25)',   color: 'var(--error)',   label: 'HIGH RISK',     emoji: '🔴', subtext: 'Recurring problems on this lane. Review before dispatch.' },
} as const

const CONF_META = {
  low:    { label: 'Low confidence',    sub: 'Fewer than 3 runs — treat as preliminary' },
  medium: { label: 'Medium confidence', sub: '3–7 runs logged'                          },
  high:   { label: 'High confidence',   sub: '8+ runs — reliable pattern'               },
}

// ── Issue bar ─────────────────────────────────────────────────────────────────
function IssuePill({
  emoji, label, pct, color,
}: {
  emoji: string; label: string; pct: number; color: string
}) {
  if (pct < 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '.8rem', flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 3,
        }}>
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text)' }}>{label}</span>
          <span style={{ fontSize: '.65rem', fontWeight: 800, color }}>{Math.round(pct)}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, width: `${Math.min(100, pct)}%`,
            background: pct >= 50 ? 'var(--error)' : pct >= 30 ? 'var(--warn)' : color,
            transition: 'width .4s',
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Stat block ────────────────────────────────────────────────────────────────
function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '.65rem .5rem', borderRadius: 10,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      textAlign: 'center', flex: 1,
    }}>
      <div style={{ fontWeight: 900, fontSize: '1.3rem', lineHeight: 1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function LaneIntelligencePanel({ open, onClose, metrics, loading, driverMode = false }: Props) {
  if (!open) return null

  const rm = metrics ? RISK_META[metrics.riskLevel] : null
  const cm = metrics ? CONF_META[metrics.confidence] : null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 400 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        boxShadow: '0 -6px 32px rgba(0,0,0,.4)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.2rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🛣 Lane Intelligence</div>
            {metrics && (
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3, fontWeight: 600 }}>
                {metrics.origin.split(',')[0]} → {metrics.destination.split(',')[0]}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', padding: '.2rem .4rem', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)', fontSize: '.85rem', fontWeight: 600 }}>
            <span style={{ fontSize: '1.5rem', display: 'inline-block', marginBottom: '.5rem', animation: 'spin 1s linear infinite' }}>⟳</span>
            <span style={{ display: 'block', marginTop: '.5rem' }}>Loading lane history…</span>
          </div>
        )}

        {/* No data */}
        {!loading && (!metrics || metrics.totalRuns === 0) && (
          <div style={{
            textAlign: 'center', padding: '2.5rem 1rem',
            color: 'var(--muted)', fontSize: '.85rem', lineHeight: 1.6,
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>📭</div>
            <strong>No history on this lane yet.</strong>
            <br />
            Complete a trip with a review to start building intelligence.
          </div>
        )}

        {/* Main content */}
        {!loading && metrics && metrics.totalRuns > 0 && rm && cm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

            {/* ── Risk banner ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '.85rem 1rem', borderRadius: 12,
              background: rm.bg, border: `1px solid ${rm.border}`,
            }}>
              <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{rm.emoji}</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '.95rem', color: rm.color }}>{rm.label}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                  {rm.subtext}
                </div>
                {metrics.riskReasons.length > 0 && (
                  <div style={{ marginTop: '.4rem', display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                    {metrics.riskReasons.map((r, i) => (
                      <span key={i} style={{
                        fontSize: '.62rem', fontWeight: 700, padding: '.15rem .45rem',
                        borderRadius: 5, background: `${rm.bg}`, border: `1px solid ${rm.border}`,
                        color: rm.color,
                      }}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Summary stats ── */}
            <div>
              <div style={SECTION}>Run Summary</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <StatBlock
                  label="Total Runs"
                  value={String(metrics.totalRuns)}
                  sub={metrics.lastRun ? `Last: ${metrics.lastRun}` : undefined}
                />
                {metrics.avgRating != null && (
                  <StatBlock
                    label="Avg Rating"
                    value={`${metrics.avgRating.toFixed(1)}★`}
                    sub="1–5 scale"
                  />
                )}
                {metrics.wouldRunAgainPct != null && (
                  <StatBlock
                    label="Run Again"
                    value={`${Math.round(metrics.wouldRunAgainPct)}%`}
                    sub="drivers said yes"
                  />
                )}
              </div>
            </div>

            {/* ── Issue frequencies ── */}
            <div>
              <div style={SECTION}>Issue Frequency</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
                <IssuePill emoji="⏱"  label="Detention"      pct={metrics.detentionFreq}     color="var(--warn)" />
                <IssuePill emoji="📦" label="Receiver Delay" pct={metrics.receiverDelayFreq} color="var(--warn)" />
                <IssuePill emoji="🅿️" label="Parking Issues" pct={metrics.parkingIssueFreq}  color="var(--warn)" />
                <IssuePill emoji="🗺"  label="Route Problems" pct={metrics.routeIssueFreq}    color="var(--warn)" />
                <IssuePill emoji="🌧️" label="Weather Delays" pct={metrics.weatherDelayFreq}  color="#6c9bd2" />
                <IssuePill emoji="⛽" label="Fuel Issues"     pct={metrics.fuelIssueFreq}     color="var(--warn)" />
              </div>
              {metrics.reviewedRuns < metrics.totalRuns && (
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: '.6rem', fontStyle: 'italic' }}>
                  Based on {metrics.reviewedRuns} of {metrics.totalRuns} reviewed runs
                </div>
              )}
            </div>

            {/* ── Detention detail — hidden in driver mode ── */}
            {!driverMode && metrics.detentionFreq > 0 && metrics.avgDetentionMinutes > 0 && (
              <div style={{
                padding: '.7rem .9rem', borderRadius: 10,
                background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.2)',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--warn)', marginBottom: '.3rem' }}>
                  ⏱ Detention Pattern
                </div>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text)' }}>
                  Avg <strong>{metrics.avgDetentionMinutes} min</strong> detention when it occurs
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>
                  Document arrival times — evidence required for broker claims
                </div>
              </div>
            )}

            {/* ── Known risky stops ── */}
            {metrics.knownRiskyStops.length > 0 && (
              <div>
                <div style={SECTION}>Known Detention Stops</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                  {metrics.knownRiskyStops.map((stop, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '.55rem .8rem', borderRadius: 9,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.8rem', color: 'var(--text)' }}>{stop.name}</div>
                        {(stop.city || stop.state) && (
                          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>
                            {[stop.city, stop.state].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--warn)' }}>
                          {stop.detentionCount}× detained
                        </div>
                        <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>
                          avg {stop.avgDetentionMinutes} min
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Confidence footer ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '.5rem .75rem', borderRadius: 9,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '.75rem' }}>
                {metrics.confidence === 'high' ? '✅' : metrics.confidence === 'medium' ? '⚠️' : '⚠️'}
              </span>
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text)' }}>{cm.label}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>{cm.sub}</div>
              </div>
            </div>

          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
