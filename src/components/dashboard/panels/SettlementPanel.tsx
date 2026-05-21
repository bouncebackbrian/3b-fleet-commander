'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getFleetIdentity } from '@/lib/identity'

// ── Types ─────────────────────────────────────────────────────────────────────
export type SettlementLoad = {
  loadNumber:   string | null
  origin:       string
  destination:  string
  loadedMiles:  number | null
  emptyMiles:   number | null
  grossPay:     number | null
  pickupDate:   string | null
  deliveryDate: string | null
  loadType:     'loaded' | 'empty' | 'other'
}

export type SettlementData = {
  // Identity
  driver:       string | null
  carrier:      string | null
  periodEnding: string | null
  periodStart:  string | null
  checkNumber:  string | null
  importedAt:   string
  // Financial
  grossPay:     number | null
  taxableWages: number | null
  perDiem:      number | null
  deductions:   number | null
  netPay:       number | null
  // Miles
  loadedMiles:  number | null
  emptyMiles:   number | null
  totalMiles:   number | null
  dispatches:   number | null
  baseCpm:      number | null
  // Detail
  loads:              SettlementLoad[]
  deductionItems:     { description: string; amount: number }[]
  notes:              string | null
}

type StoredSettlement = SettlementData & { id: string }

const STORAGE_KEY = '3b-settlements'
const MAX_STORED  = 12

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits })

const fmtM = (n: number | null | undefined) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtR = (n: number | null | undefined) =>
  n == null ? '—' : '$' + (n).toFixed(3)

function fmtPeriod(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

// ── Computed metrics ──────────────────────────────────────────────────────────
type Metrics = {
  emptyPct:           number
  loadedPct:          number
  avgDispatchMiles:   number
  avgDispatchRevenue: number
  grossCpm:           number
  effectiveCpm:       number
  estHourlyRate:      number
  laneRows:           LaneRow[]
  flags:              Flag[]
}

type LaneRow = {
  origin:      string
  destination: string
  label:       string
  miles:       number
  pay:         number
  cpm:         number
  loadType:    string
}

type Flag = {
  level:   'warn' | 'info' | 'success'
  emoji:   string
  message: string
}

function computeMetrics(s: SettlementData): Metrics {
  const loadedMi  = s.loadedMiles  ?? 0
  const emptyMi   = s.emptyMiles   ?? 0
  const totalMi   = s.totalMiles   ?? (loadedMi + emptyMi)
  const grossPay  = s.grossPay     ?? 0
  const dispatches = s.dispatches  ?? (s.loads.filter(l => l.loadType === 'loaded').length || 1)

  const emptyPct           = totalMi > 0 ? (emptyMi / totalMi) * 100 : 0
  const loadedPct          = 100 - emptyPct
  const avgDispatchMiles   = dispatches > 0 ? loadedMi / dispatches : 0
  const avgDispatchRevenue = dispatches > 0 ? grossPay / dispatches : 0
  const grossCpm           = totalMi > 0 ? grossPay / totalMi : 0
  const effectiveCpm       = loadedMi > 0 ? grossPay / loadedMi : 0

  // Rough hourly estimate: assume 52 mph avg + 10% idle time
  const estDriveHrs = totalMi / 52
  const estHours    = estDriveHrs * 1.1
  const estHourlyRate = estHours > 0 ? grossPay / estHours : 0

  // Lane rows from individual loads
  const laneRows: LaneRow[] = (s.loads ?? [])
    .filter(l => l.origin && l.destination)
    .map(l => ({
      origin:      l.origin,
      destination: l.destination,
      label:       `${l.origin.split(',')[0]} → ${l.destination.split(',')[0]}`,
      miles:       l.loadedMiles ?? 0,
      pay:         l.grossPay    ?? 0,
      cpm:         (l.loadedMiles && l.grossPay && l.loadedMiles > 0)
                     ? l.grossPay / l.loadedMiles : 0,
      loadType:    l.loadType,
    }))
    .sort((a, b) => b.cpm - a.cpm)

  // Intelligence flags
  const flags: Flag[] = []

  if (emptyPct > 20)
    flags.push({ level: 'warn',    emoji: '⚠️', message: `High deadhead: ${emptyPct.toFixed(0)}% empty miles — ${fmt(emptyMi)} mi unpaid` })
  else if (emptyPct > 10)
    flags.push({ level: 'info',    emoji: '📊', message: `Deadhead at ${emptyPct.toFixed(0)}% — monitor for upward trend` })
  else if (emptyPct <= 5 && emptyMi > 0)
    flags.push({ level: 'success', emoji: '✅', message: `Excellent positioning: only ${emptyPct.toFixed(0)}% deadhead` })

  // Micro-moves: loaded runs under 100 miles
  const microMoves = (s.loads ?? []).filter(l => l.loadType === 'loaded' && (l.loadedMiles ?? 0) < 100 && (l.loadedMiles ?? 0) > 0)
  if (microMoves.length > 0)
    flags.push({ level: 'warn', emoji: '🔬', message: `${microMoves.length} micro-dispatch${microMoves.length > 1 ? 'es' : ''} under 100 mi — check if worth taking at this CPM` })

  // Nevada reposition loop detection
  const stateFreq: Record<string, number> = {}
  for (const l of s.loads ?? []) {
    const st = l.origin?.split(',')?.[1]?.trim()
    if (st) stateFreq[st] = (stateFreq[st] ?? 0) + 1
  }
  const topEntry = Object.entries(stateFreq).sort((a, b) => b[1] - a[1])[0]
  if (topEntry && topEntry[1] >= 3)
    flags.push({ level: 'warn', emoji: '🔄', message: `${topEntry[0]} reposition loop: ${topEntry[1]} origins from ${topEntry[0]} — possible staging inefficiency` })

  // Low effective CPM
  if (effectiveCpm > 0 && effectiveCpm < 0.45)
    flags.push({ level: 'warn', emoji: '💸', message: `Low effective CPM at ${fmtR(effectiveCpm)}/mi — target ≥ $0.50 for solo semi` })
  else if (effectiveCpm >= 0.55)
    flags.push({ level: 'success', emoji: '💚', message: `Strong CPM at ${fmtR(effectiveCpm)}/mi — above target` })

  // Per diem impact
  if (s.perDiem && s.perDiem > 0)
    flags.push({ level: 'info', emoji: '🛏', message: `Per diem ${fmtM(s.perDiem)} shifts ${fmtM((s.grossPay ?? 0) - (s.perDiem ?? 0))} to taxable wages — check IRS $69/day limit` })

  return { emptyPct, loadedPct, avgDispatchMiles, avgDispatchRevenue, grossCpm, effectiveCpm, estHourlyRate, laneRows, flags }
}

// ── Metric tile ───────────────────────────────────────────────────────────────
function MetricTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '.65rem .75rem', textAlign: 'center' }}>
      <div style={{ fontSize: '.57rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: '.92rem', color: color ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  open:       boolean
  onClose:    () => void
  driverMode?: boolean
}

type PanelState = 'upload' | 'processing' | 'results' | 'history'

export default function SettlementPanel({ open, onClose, driverMode }: Props) {
  const [panelState,   setPanelState]   = useState<PanelState>('upload')
  const [processing,   setProcessing]   = useState<string>('')   // status message
  const [result,       setResult]       = useState<SettlementData | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [history,      setHistory]      = useState<StoredSettlement[]>([])
  const [importing,    setImporting]    = useState(false)
  const [importedMsg,  setImportedMsg]  = useState<string | null>(null)
  const [activeLoad,   setActiveLoad]   = useState<number | null>(null) // expanded load index

  const fileRef = useRef<HTMLInputElement>(null)

  // Load history on open
  useEffect(() => {
    if (!open) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setHistory(JSON.parse(raw) as StoredSettlement[])
    } catch { /* ignore */ }
  }, [open])

  if (!open) return null

  // ── File upload handler ──────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setError(null)
    setResult(null)
    setImportedMsg(null)
    setPanelState('processing')
    setProcessing('Reading document…')

    try {
      const fd = new FormData()
      fd.append('file', file)
      setProcessing('Extracting settlement data with AI…')
      const res  = await fetch('/api/settlement-import', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error ?? 'Import failed — try again or use a clearer scan')
        setPanelState('upload')
        return
      }

      setResult(data as SettlementData)
      setPanelState('results')

      // Save to history
      try {
        const raw   = localStorage.getItem(STORAGE_KEY)
        const hist: StoredSettlement[] = raw ? JSON.parse(raw) : []
        const stored: StoredSettlement = { id: crypto.randomUUID(), ...data }
        hist.unshift(stored)
        const trimmed = hist.slice(0, MAX_STORED)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
        setHistory(trimmed)
      } catch { /* ignore */ }

    } catch {
      setError('Network error — check your connection')
      setPanelState('upload')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Import loads into fleet history ─────────────────────────────────────
  const handleImportLoads = async () => {
    if (!result) return
    setImporting(true)
    const loads = result.loads.filter(l => l.origin && l.destination && l.loadType === 'loaded')
    if (loads.length === 0) { setImporting(false); setImportedMsg('No loaded dispatches to import'); return }

    // Push to localStorage 3b-completed-missions
    try {
      const raw     = localStorage.getItem('3b-completed-missions')
      const archive: unknown[] = raw ? JSON.parse(raw) : []
      const newEntries = loads.map(l => ({
        id:          crypto.randomUUID(),
        loadNumber:  l.loadNumber ?? '',
        origin:      l.origin,
        destination: l.destination,
        date:        l.deliveryDate ?? result.periodEnding ?? new Date().toISOString().slice(0, 10),
        completedAt: l.deliveryDate ?? result.periodEnding,
        tripReview:  null,
        fromSettlement: true,
      }))
      newEntries.forEach(e => archive.unshift(e))
      localStorage.setItem('3b-completed-missions', JSON.stringify(archive.slice(0, 50)))
    } catch { /* ignore */ }

    // Optionally push to Supabase fleet_missions
    if (supabase) {
      try {
        const { userId, businessId } = await getFleetIdentity()
        const rows = loads.map(l => ({
          id:             crypto.randomUUID(),
          load_number:    l.loadNumber ?? '',
          origin:         l.origin,
          destination:    l.destination,
          date:           l.deliveryDate ?? result.periodEnding ?? new Date().toISOString().slice(0, 10),
          dispatch_miles: l.loadedMiles  ?? 0,
          deadhead_miles: l.emptyMiles   ?? 0,
          gross_rate:     l.grossPay     ?? 0,
          fuel_price:     3.85,
          rig_type:       'semi-solo',
          wait_hours:     0,
          reload_known:   false,
          reload_area_strength: 2,
          has_overnight_parking: false,
          load_type:      'FTL',
          mission_status: 'completed',
          user_id:        userId ?? null,
          ...(businessId ? { business_id: businessId } : {}),
          metadata: {
            fromSettlement: true,
            settlementPeriod: result.periodEnding,
            settlementCarrier: result.carrier,
          },
        }))
        await supabase.from('fleet_missions').upsert(rows, { onConflict: 'id' })
      } catch { /* non-fatal */ }
    }

    setImporting(false)
    setImportedMsg(`✅ ${loads.length} load${loads.length > 1 ? 's' : ''} imported into Fleet History & Lane Intelligence`)
  }

  const metrics = result ? computeMetrics(result) : null

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(3,13,11,.75)' }} onClick={onClose} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 351,
          background: 'var(--surface)',
          borderTop: '2px solid rgba(0,232,176,.2)',
          borderRadius: '20px 20px 0 0',
          padding: '1.25rem 1.25rem 2.5rem',
          maxHeight: '93dvh', overflowY: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>📋 Settlement Import</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
              {panelState === 'results' && result
                ? `${result.driver ?? 'Driver'} · ${result.carrier ?? 'Carrier'} · ${fmtPeriod(result.periodEnding)}`
                : 'Upload your weekly settlement — AI extracts every metric automatically'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {panelState === 'results' && (
              <button
                onClick={() => { setPanelState('upload'); setResult(null); setImportedMsg(null) }}
                style={{ padding: '.35rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
              >
                ← New
              </button>
            )}
            <button
              onClick={() => setPanelState(panelState === 'history' ? (result ? 'results' : 'upload') : 'history')}
              style={{ padding: '.35rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: panelState === 'history' ? 'rgba(0,232,176,.1)' : 'none', color: panelState === 'history' ? 'var(--primary)' : 'var(--muted)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
            >
              📚 History ({history.length})
            </button>
            <button onClick={onClose} style={{ padding: '.35rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* ══════════════════════════════════
            UPLOAD STATE
        ══════════════════════════════════ */}
        {panelState === 'upload' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {error && (
              <div style={{ padding: '.65rem .9rem', borderRadius: 10, background: 'rgba(232,64,0,.07)', border: '1px solid rgba(232,64,0,.2)', color: 'var(--error)', fontSize: '.78rem', fontWeight: 600 }}>
                ❌ {error}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: '100%', padding: '2.2rem 1rem', borderRadius: 16, border: '2px dashed rgba(0,232,176,.35)', background: 'rgba(0,232,176,.04)', color: 'var(--primary)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minHeight: 160 }}
            >
              <span style={{ fontSize: '2.8rem' }}>📄</span>
              Upload Settlement PDF or Photo
              <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>
                PDF · JPG · PNG · HEIC — carrier pay stub or settlement sheet
              </span>
            </button>
            {/* What gets extracted */}
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.55rem' }}>
                Auto-extracted from your settlement
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                {[
                  ['💰', 'Gross, taxable, net pay'],
                  ['🛣', 'Loaded & empty miles'],
                  ['📦', 'Every dispatch lane'],
                  ['📊', 'CPM & effective rate'],
                  ['🏁', 'Per diem & deductions'],
                  ['🚨', 'Operational patterns'],
                ].map(([emoji, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600 }}>
                    <span>{emoji}</span>{label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            PROCESSING STATE
        ══════════════════════════════════ */}
        {panelState === 'processing' && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', animation: 'spin 1.5s linear infinite' }}>⚙️</div>
            <div style={{ fontWeight: 800, fontSize: '.9rem', marginBottom: '.5rem' }}>Processing Settlement…</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{processing}</div>
            <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
          </div>
        )}

        {/* ══════════════════════════════════
            HISTORY STATE
        ══════════════════════════════════ */}
        {panelState === 'history' && (
          <div style={{ display: 'grid', gap: '.55rem' }}>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>📋</div>
                <div style={{ fontWeight: 800, marginBottom: '.35rem' }}>No settlements yet</div>
                <div style={{ fontSize: '.78rem' }}>Import your first settlement to start tracking weekly performance</div>
                <button onClick={() => setPanelState('upload')}
                  style={{ marginTop: '1rem', padding: '.6rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.8rem', border: 'none', cursor: 'pointer' }}>
                  📄 Upload Settlement
                </button>
              </div>
            ) : history.map(s => {
              const m = computeMetrics(s)
              return (
                <div
                  key={s.id}
                  onClick={() => { setResult(s); setPanelState('results') }}
                  style={{ padding: '.75rem .9rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '.82rem' }}>
                        {fmtPeriod(s.periodEnding)}
                        {s.carrier && <span style={{ fontWeight: 500, color: 'var(--muted)', marginLeft: 6, fontSize: '.72rem' }}>{s.carrier}</span>}
                      </div>
                      <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
                        {s.dispatches ?? s.loads?.length ?? '?'} dispatches · {fmt(s.totalMiles ?? (s.loadedMiles ?? 0) + (s.emptyMiles ?? 0))} mi
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: '.88rem', color: 'var(--success)' }}>{fmtM(s.grossPay)}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>{fmtR(m.effectiveCpm)}/mi</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════
            RESULTS STATE
        ══════════════════════════════════ */}
        {panelState === 'results' && result && metrics && (
          <div style={{ display: 'grid', gap: '1rem' }}>

            {/* ── Summary header ── */}
            <div style={{ background: 'linear-gradient(135deg, rgba(0,232,176,.06) 0%, rgba(0,232,176,.02) 100%)', border: '1px solid rgba(0,232,176,.2)', borderRadius: 14, padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '1rem' }}>{result.driver ?? 'Driver'}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                    {result.carrier ?? 'Carrier'} · Week ending {fmtPeriod(result.periodEnding)}
                  </div>
                  {result.checkNumber && (
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>Check #{result.checkNumber}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--success)', lineHeight: 1 }}>
                    {fmtM(result.grossPay)}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>gross pay</div>
                  {!driverMode && result.netPay && (
                    <div style={{ fontSize: '.72rem', color: 'var(--primary)', fontWeight: 700, marginTop: 3 }}>
                      {fmtM(result.netPay)} net
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Metrics grid ── */}
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>Weekly Metrics</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <MetricTile label="Loaded Mi" value={fmt(result.loadedMiles)} sub={`${metrics.loadedPct.toFixed(0)}% of total`} color="var(--primary)" />
                <MetricTile label="Empty Mi"  value={fmt(result.emptyMiles)}  sub={`${metrics.emptyPct.toFixed(0)}% deadhead`} color={metrics.emptyPct > 20 ? 'var(--error)' : metrics.emptyPct > 10 ? 'var(--warn)' : 'var(--muted)'} />
                <MetricTile label="Dispatches" value={fmt(result.dispatches ?? result.loads.length)} sub="loads this week" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
                {!driverMode && <MetricTile label="Gross CPM"    value={fmtR(metrics.grossCpm)}      sub="all miles" color="var(--text)" />}
                <MetricTile label="Eff. CPM"     value={fmtR(metrics.effectiveCpm)} sub="loaded miles" color={metrics.effectiveCpm >= 0.55 ? 'var(--success)' : metrics.effectiveCpm >= 0.45 ? 'var(--warn)' : 'var(--error)'} />
                <MetricTile label="Avg / Run"    value={fmtM(metrics.avgDispatchRevenue)} sub={`${fmt(metrics.avgDispatchMiles, 0)} mi avg`} />
                {!driverMode && <MetricTile label="Est. Hourly"  value={fmtM(metrics.estHourlyRate)} sub="incl. idle est." color={metrics.estHourlyRate >= 25 ? 'var(--success)' : metrics.estHourlyRate >= 18 ? 'var(--warn)' : 'var(--error)'} />}
              </div>
              {/* Financial breakdown — owner only */}
              {!driverMode && (result.perDiem || result.deductions || result.taxableWages) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
                  {result.taxableWages != null && <MetricTile label="Taxable Wages" value={fmtM(result.taxableWages)} />}
                  {result.perDiem     != null && result.perDiem > 0 && <MetricTile label="Per Diem" value={fmtM(result.perDiem)} color="var(--primary)" />}
                  {result.deductions  != null && result.deductions > 0 && <MetricTile label="Deductions" value={fmtM(result.deductions)} color="var(--warn)" />}
                </div>
              )}
            </div>

            {/* ── Intelligence flags ── */}
            {metrics.flags.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>🚨 Operational Intelligence</div>
                {metrics.flags.map((f, i) => (
                  <div key={i} style={{
                    padding: '.55rem .8rem', borderRadius: 9, fontSize: '.72rem', fontWeight: 600, lineHeight: 1.45,
                    background: f.level === 'warn' ? 'rgba(245,194,0,.07)' : f.level === 'success' ? 'rgba(40,192,72,.07)' : 'rgba(0,232,176,.05)',
                    border: `1px solid ${f.level === 'warn' ? 'rgba(245,194,0,.2)' : f.level === 'success' ? 'rgba(40,192,72,.2)' : 'rgba(0,232,176,.2)'}`,
                    color: f.level === 'warn' ? 'var(--warn)' : f.level === 'success' ? 'var(--success)' : 'var(--primary)',
                  }}>
                    {f.emoji} {f.message}
                  </div>
                ))}
              </div>
            )}

            {/* ── Lane breakdown ── */}
            {metrics.laneRows.length > 0 && (
              <div>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>
                  Dispatch Breakdown — {metrics.laneRows.length} run{metrics.laneRows.length > 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {metrics.laneRows.map((row, i) => {
                    const isExpanded = activeLoad === i
                    const isTop      = i === 0 && row.cpm > 0
                    const isBot      = i === metrics.laneRows.length - 1 && metrics.laneRows.length > 1 && row.cpm > 0
                    return (
                      <div
                        key={i}
                        onClick={() => setActiveLoad(isExpanded ? null : i)}
                        style={{
                          padding: '.6rem .8rem', borderRadius: 10,
                          background: isTop ? 'rgba(40,192,72,.07)' : isBot ? 'rgba(232,64,0,.05)' : 'var(--surface-2)',
                          border: `1px solid ${isTop ? 'rgba(40,192,72,.2)' : isBot ? 'rgba(232,64,0,.15)' : 'var(--border)'}`,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isTop && <span style={{ fontSize: '.6rem', color: 'var(--success)', marginRight: 4 }}>★</span>}
                              {isBot && <span style={{ fontSize: '.6rem', color: 'var(--error)',   marginRight: 4 }}>▼</span>}
                              {row.label}
                              {row.loadType === 'empty' && <span style={{ fontSize: '.58rem', color: 'var(--warn)', marginLeft: 4, fontWeight: 700 }}>EMPTY</span>}
                            </div>
                            <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>
                              {fmt(row.miles)} mi
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '.78rem', color: row.cpm >= 0.55 ? 'var(--success)' : row.cpm >= 0.45 ? 'var(--warn)' : row.cpm > 0 ? 'var(--error)' : 'var(--muted)' }}>
                              {row.cpm > 0 ? fmtR(row.cpm) + '/mi' : fmtM(row.pay)}
                            </div>
                            <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 1 }}>
                              {fmtM(row.pay)}
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: '.55rem', paddingTop: '.55rem', borderTop: '1px solid var(--border)', fontSize: '.68rem', color: 'var(--muted)', display: 'grid', gap: 3 }}>
                            <div>📍 {row.origin} → {row.destination}</div>
                            {row.loadType === 'empty' && <div style={{ color: 'var(--warn)' }}>⚠️ Positioning move — deadhead</div>}
                            {row.cpm > 0 && row.cpm < 0.45 && <div style={{ color: 'var(--error)' }}>💸 Below target CPM — consider declining similar short lanes</div>}
                            {row.cpm >= 0.60 && <div style={{ color: 'var(--success)' }}>✅ Strong lane — repeat if available</div>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Deductions (owner only) ── */}
            {!driverMode && result.deductionItems && result.deductionItems.length > 0 && (
              <div>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>Deductions</div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {result.deductionItems.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '.4rem .65rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.72rem' }}>
                      <span style={{ color: 'var(--muted)' }}>{d.description}</span>
                      <span style={{ fontWeight: 700, color: 'var(--warn)' }}>-{fmtM(d.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            {result.notes && (
              <div style={{ padding: '.6rem .8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.72rem', color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                📝 {result.notes}
              </div>
            )}

            {/* ── Import action ── */}
            <div style={{ display: 'grid', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              {importedMsg ? (
                <div style={{ padding: '.65rem .9rem', borderRadius: 10, background: 'rgba(40,192,72,.08)', border: '1px solid rgba(40,192,72,.2)', color: 'var(--success)', fontSize: '.78rem', fontWeight: 700, textAlign: 'center' }}>
                  {importedMsg}
                </div>
              ) : (
                <button
                  onClick={handleImportLoads}
                  disabled={importing}
                  style={{
                    padding: '.85rem', borderRadius: 12, border: 'none',
                    background: importing ? 'var(--surface-2)' : 'var(--primary)',
                    color: importing ? 'var(--muted)' : '#061210',
                    fontWeight: 900, fontSize: '.88rem', cursor: importing ? 'default' : 'pointer',
                    opacity: importing ? .7 : 1,
                  }}
                >
                  {importing ? '⏳ Importing…' : `🚛 Import ${result.loads.filter(l => l.loadType === 'loaded').length} Loads to Fleet History`}
                </button>
              )}
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Loads feed into Lane Intelligence · appears in Completed Trips
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
