'use client'
/**
 * LoadKpiCard — Per-load financial targets vs actuals + MPG
 *
 * Set at plan time:
 *   • Planned miles, CPM/gross pay
 *   • Fuel target, tolls target, shop/misc target
 *   • Expected MPG (auto-estimates gallons needed)
 *
 * Live actuals pulled from 3b-expenses filtered by load number.
 * Compare column shows delta + % (green/red).
 * MPG computed from expense gallons entries vs planned miles.
 *
 * Saved to 3b-load-targets (localStorage).
 */
import { useState, useEffect, useCallback } from 'react'
import {
  readLoadTarget,
  saveLoadTarget,
  newLoadTarget,
  estimateTargets,
  getLoadActuals,
  computeVariances,
  computeMpg,
  type LoadTarget,
  type Variance,
} from '@/lib/loadKpi'

// ── Helpers ───────────────────────────────────────────────────────────────────

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

function VarianceRow({ v }: { v: Variance }) {
  const overBudget = v.status === 'over'
  const onBudget   = v.status === 'on'
  const color = overBudget ? 'var(--error)' : onBudget ? 'var(--muted)' : 'var(--success)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.45rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, fontSize: '.8rem', fontWeight: 700, color: 'var(--text)' }}>{v.field}</div>
      <div style={{ width: 72, textAlign: 'right', fontSize: '.78rem', color: 'var(--muted)' }}>{money(v.target)}</div>
      <div style={{ width: 72, textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: v.actual > 0 ? 'var(--text)' : 'var(--faint)' }}>
        {v.actual > 0 ? money(v.actual) : '—'}
      </div>
      <div style={{ width: 70, textAlign: 'right', fontSize: '.72rem', fontWeight: 800, color }}>
        {v.actual > 0 ? (
          <>
            {v.delta >= 0 ? '+' : ''}{money(v.delta)}<br />
            <span style={{ fontSize: '.6rem' }}>{pct(v.pct)}</span>
          </>
        ) : '—'}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  loadNumber?:   string
  plannedMiles?: number
  cpm?:          number
  fuelPrice?:    number    // $/gal from truck settings
  mpgEstimate?:  number    // MPG from truck settings
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoadKpiCard({ loadNumber, plannedMiles, cpm, fuelPrice = 3.85, mpgEstimate = 6.5 }: Props) {
  const [target,    setTarget]    = useState<LoadTarget | null>(null)
  const [editing,   setEditing]   = useState(false)
  const [open,      setOpen]      = useState(true)

  // Form state
  const [fMiles,    setFMiles]    = useState('')
  const [fCpm,      setFCpm]      = useState('')
  const [fGross,    setFGross]    = useState('')
  const [fFuel,     setFFuel]     = useState('')
  const [fTolls,    setFTolls]    = useState('')
  const [fShop,     setFShop]     = useState('')
  const [fMpg,      setFMpg]      = useState('')

  const load = useCallback(() => {
    if (!loadNumber) return
    const t = readLoadTarget(loadNumber)
    setTarget(t)
    if (t) {
      setFMiles(t.plannedMiles > 0 ? String(t.plannedMiles) : '')
      setFCpm(t.ratePerMile   ? String(t.ratePerMile)   : '')
      setFGross(t.grossPay    ? String(t.grossPay)       : '')
      setFFuel(t.fuelTarget   > 0 ? String(t.fuelTarget) : '')
      setFTolls(t.tollsTarget > 0 ? String(t.tollsTarget): '')
      setFShop(t.shopTarget   > 0 ? String(t.shopTarget) : '')
      setFMpg(t.mpgTarget     ? String(t.mpgTarget)      : '')
    }
  }, [loadNumber])

  useEffect(() => { load() }, [load])

  // Seed from props when no target saved yet
  useEffect(() => {
    if (target) return
    if (plannedMiles && plannedMiles > 0) {
      const est = estimateTargets(plannedMiles, mpgEstimate, fuelPrice, cpm)
      setFMiles(String(plannedMiles))
      setFCpm(cpm ? String(cpm) : '')
      setFFuel(String(est.fuelTarget ?? ''))
      setFTolls(String(est.tollsTarget ?? ''))
      setFShop(String(est.shopTarget ?? ''))
      setFMpg(String(mpgEstimate))
    }
  }, [plannedMiles, cpm, fuelPrice, mpgEstimate, target])

  function autoEstimate() {
    const mi  = parseFloat(fMiles)
    const mpg = parseFloat(fMpg) || mpgEstimate
    if (!mi || mi <= 0) return
    const est = estimateTargets(mi, mpg, fuelPrice, parseFloat(fCpm) || cpm)
    setFFuel(String(est.fuelTarget ?? ''))
    setFTolls(String(est.tollsTarget ?? ''))
    setFShop(String(est.shopTarget ?? ''))
    if (est.grossPay) setFGross(String(est.grossPay))
  }

  function handleSave() {
    if (!loadNumber) return
    const mi     = parseFloat(fMiles)  || 0
    const record = target ?? newLoadTarget({ loadNumber })
    const updated: LoadTarget = {
      ...record,
      loadNumber,
      plannedMiles: mi,
      ratePerMile:  parseFloat(fCpm)   || undefined,
      grossPay:     parseFloat(fGross) || undefined,
      fuelTarget:   parseFloat(fFuel)  || 0,
      tollsTarget:  parseFloat(fTolls) || 0,
      shopTarget:   parseFloat(fShop)  || 0,
      mpgTarget:    parseFloat(fMpg)   || mpgEstimate,
      gallonsTarget: mi > 0 ? Math.round(mi / (parseFloat(fMpg) || mpgEstimate) * 10) / 10 : undefined,
    }
    saveLoadTarget(updated)
    setTarget(updated)
    setEditing(false)
  }

  // Live actuals
  const actuals   = loadNumber ? getLoadActuals(loadNumber) : null
  const variances = target && actuals ? computeVariances(target, actuals) : []
  const mpgStats  = target && loadNumber ? computeMpg(loadNumber, target.plannedMiles) : null

  const totalTarget = target ? target.fuelTarget + target.tollsTarget + target.shopTarget : 0
  const totalActual = actuals?.total ?? 0
  const totalDelta  = totalActual - totalTarget
  const netActual   = (target?.grossPay ?? 0) - totalActual
  const netTarget   = (target?.grossPay ?? 0) - totalTarget

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: '100%', textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>💰</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '.9rem' }}>Load KPIs</div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
              {target ? `Target ${money(totalTarget)} · Actual ${totalActual > 0 ? money(totalActual) : '—'}` : 'Tap to set targets'}
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--muted)' }}>▼</span>
      </button>
    )
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '.85rem 1rem .6rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.15rem' }}>💰</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: '.95rem' }}>Load KPIs</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
              {loadNumber ? `Load #${loadNumber}` : 'Set load number first'}
              {target?.plannedMiles ? ` · ${target.plannedMiles.toLocaleString()} mi` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setEditing(e => !e)} style={{
            padding: '.3rem .65rem', borderRadius: 8, fontSize: '.72rem', fontWeight: 700,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--muted)', cursor: 'pointer',
          }}>
            {editing ? 'Cancel' : target ? '✏️ Edit' : '+ Set Targets'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>▲</button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ padding: '.85rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={secLabel}>Load Info</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Planned Miles</div>
              <input type="number" placeholder="e.g. 650" value={fMiles} onChange={e => setFMiles(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>CPM ($)</div>
              <input type="number" placeholder="e.g. 2.40" step="0.01" value={fCpm} onChange={e => setFCpm(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Gross Pay ($)</div>
              <input type="number" placeholder="e.g. 1560" value={fGross} onChange={e => setFGross(e.target.value)} style={inp} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Expected MPG</div>
              <input type="number" placeholder={String(mpgEstimate)} step="0.1" value={fMpg} onChange={e => setFMpg(e.target.value)} style={inp} />
            </div>
            <button onClick={autoEstimate} style={{
              padding: '.52rem .85rem', borderRadius: 8, border: '1px solid var(--primary)',
              background: 'rgba(0,232,176,.08)', color: 'var(--primary)', fontWeight: 800, fontSize: '.75rem', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              ⚡ Auto-estimate
            </button>
          </div>

          <div style={secLabel}>Cost Targets ($)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>⛽ Fuel</div>
              <input type="number" placeholder="0.00" value={fFuel} onChange={e => setFFuel(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>🛣️ Tolls</div>
              <input type="number" placeholder="0.00" value={fTolls} onChange={e => setFTolls(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>🔧 Shop/Misc</div>
              <input type="number" placeholder="0.00" value={fShop} onChange={e => setFShop(e.target.value)} style={inp} />
            </div>
          </div>

          <button onClick={handleSave} style={{
            width: '100%', padding: '.75rem', borderRadius: 12, border: 'none',
            background: 'var(--primary)', color: '#000', fontWeight: 900, fontSize: '.9rem', cursor: 'pointer',
          }}>
            💾 Save Load Targets
          </button>
        </div>
      )}

      {/* KPI view */}
      {!editing && target && (
        <div style={{ padding: '.85rem 1rem' }}>

          {/* Column headers */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <div style={{ flex: 1 }} />
            <div style={{ width: 72, textAlign: 'right', fontSize: '.6rem', fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Target</div>
            <div style={{ width: 72, textAlign: 'right', fontSize: '.6rem', fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Actual</div>
            <div style={{ width: 70, textAlign: 'right', fontSize: '.6rem', fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Δ Variance</div>
          </div>

          {variances.map(v => <VarianceRow key={v.field} v={v} />)}

          {/* Total row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem 0', marginTop: 4 }}>
            <div style={{ flex: 1, fontSize: '.82rem', fontWeight: 900, color: 'var(--text)' }}>Total Costs</div>
            <div style={{ width: 72, textAlign: 'right', fontSize: '.82rem', fontWeight: 900, color: 'var(--muted)' }}>{money(totalTarget)}</div>
            <div style={{ width: 72, textAlign: 'right', fontSize: '.82rem', fontWeight: 900, color: totalActual > 0 ? 'var(--text)' : 'var(--faint)' }}>
              {totalActual > 0 ? money(totalActual) : '—'}
            </div>
            <div style={{ width: 70, textAlign: 'right', fontSize: '.72rem', fontWeight: 800, color: totalDelta > 0 ? 'var(--error)' : 'var(--success)' }}>
              {totalActual > 0 ? `${totalDelta >= 0 ? '+' : ''}${money(totalDelta)}` : '—'}
            </div>
          </div>

          {/* Net row (if gross pay set) */}
          {target.grossPay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem 0', borderTop: '2px solid var(--border)', marginTop: 4 }}>
              <div style={{ flex: 1, fontSize: '.82rem', fontWeight: 900, color: 'var(--text)' }}>Net Pay</div>
              <div style={{ width: 72, textAlign: 'right', fontSize: '.82rem', fontWeight: 900, color: 'var(--success)' }}>{money(netTarget)}</div>
              <div style={{ width: 72, textAlign: 'right', fontSize: '.82rem', fontWeight: 900, color: netActual > 0 ? 'var(--success)' : 'var(--error)' }}>
                {totalActual > 0 ? money(netActual) : '—'}
              </div>
              <div style={{ width: 70 }} />
            </div>
          )}

          {/* MPG KPI */}
          {mpgStats && (
            <div style={{ marginTop: 12, background: 'var(--surface-2)', borderRadius: 12, padding: '.75rem .9rem' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>⛽ Fuel & MPG</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <KpiChip
                  label="Load MPG"
                  value={mpgStats.loadMpg !== null ? `${mpgStats.loadMpg} mpg` : '—'}
                  sub={target.mpgTarget ? `target ${target.mpgTarget} mpg` : undefined}
                  color={mpgStats.loadMpg !== null && target.mpgTarget
                    ? mpgStats.loadMpg >= target.mpgTarget ? 'var(--success)' : 'var(--warn)'
                    : 'var(--muted)'}
                />
                <KpiChip label="Rolling MPG" value={mpgStats.rollingMpg !== null ? `${mpgStats.rollingMpg} mpg` : '—'} color="var(--primary)" />
                <KpiChip label="Gallons Used" value={mpgStats.totalGallons > 0 ? `${mpgStats.totalGallons.toFixed(1)} gal` : '—'} sub={target.gallonsTarget ? `target ${target.gallonsTarget} gal` : undefined} color="var(--muted)" />
                <KpiChip label="Fuel ¢/mi" value={mpgStats.costPerMile !== null ? `$${mpgStats.costPerMile.toFixed(3)}` : '—'} color="var(--muted)" />
                <KpiChip label="Fill-ups" value={String(mpgStats.fillupCount)} color="var(--muted)" />
              </div>
              {mpgStats.fillupCount === 0 && (
                <div style={{ fontSize: '.68rem', color: 'var(--faint)', marginTop: 6 }}>
                  Log fuel receipts with gallons to track MPG
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No target yet */}
      {!editing && !target && (
        <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--faint)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>💰</div>
          <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: 3 }}>No targets set for this load</div>
          <div style={{ fontSize: '.72rem' }}>
            {loadNumber ? 'Tap "Set Targets" to enter fuel, tolls, and shop budgets' : 'Enter a load number first'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiChip({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '.45rem .65rem', minWidth: 80 }}>
      <div style={{ fontSize: '.78rem', fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: '.58rem', color: 'var(--faint)', marginTop: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: '.55rem', color: 'var(--faint)', fontStyle: 'italic' }}>{sub}</div>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const secLabel: React.CSSProperties = {
  fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.07em',
}
const fieldLabel: React.CSSProperties = {
  fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '.5rem .65rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box',
}
