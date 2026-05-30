'use client'
/**
 * /loads — Standalone Load Board
 *
 * Full-screen multi-board load search with:
 *   - Persistent filters (saved to localStorage)
 *   - Sortable results table ($/mi, rate, miles, DH, date)
 *   - Board filter chips (toggle boards on/off per search)
 *   - Market rate widget (lane intelligence from DAT)
 *   - Post Truck panel (post to all connected boards at once)
 *   - Book flow → creates fleet_loads + rate confirmation + platform fee
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import {
  BOARD_META,
  type LoadBoardId,
  type NormalizedLoad,
  type EquipmentType,
  type LoadBoardSearchResult,
  type MarketRate,
  type TruckPosting,
} from '@/lib/loadBoards/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_FILTERS  = '3b-load-board-filters'
const ALL_BOARDS: LoadBoardId[] = ['dat', 'truckstop', '123loadboard', 'loadsmart', 'uber_freight']

const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: 'V',    label: 'Dry Van'    },
  { value: 'R',    label: 'Reefer'     },
  { value: 'F',    label: 'Flatbed'    },
  { value: 'SD',   label: 'Step Deck'  },
  { value: 'PO',   label: 'Power Only' },
  { value: 'HS',   label: 'Hot Shot'   },
  { value: 'RGN',  label: 'RGN'        },
  { value: 'TANK', label: 'Tanker'     },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpmVal(load: NormalizedLoad): number {
  if (load.ratePerMile) return load.ratePerMile
  if (load.rate && load.tripMiles && load.tripMiles > 0) return load.rate / load.tripMiles
  return 0
}
function rpmColor(r: number) {
  if (r >= 3.0) return 'var(--primary)'
  if (r >= 2.0) return 'var(--warn)'
  if (r > 0)    return 'var(--error)'
  return 'var(--muted)'
}
function fmtRate(l: NormalizedLoad) {
  if (l.rate) return `$${l.rate.toLocaleString()}`
  if (l.ratePerMile) return `$${l.ratePerMile.toFixed(2)}/mi`
  return 'Call'
}
function fmtRpm(l: NormalizedLoad) {
  const r = rpmVal(l); return r > 0 ? `$${r.toFixed(2)}/mi` : '—'
}
function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
function fmtMi(n?: number) { return n ? `${n.toLocaleString()} mi` : '—' }

function getBusinessId(): string {
  if (typeof window === 'undefined') return ''
  try { return JSON.parse(localStorage.getItem('3b-active-trip') ?? '{}')?.businessId ?? '' }
  catch { return '' }
}

// ── Persisted filter state ────────────────────────────────────────────────────

interface Filters {
  originCity:   string
  originState:  string
  destState:    string
  equipment:    EquipmentType
  pickupDate:   string
  maxDH:        string
  activeBoards: LoadBoardId[]
}

const DEFAULT_FILTERS: Filters = {
  originCity: '', originState: '', destState: '',
  equipment: 'V', pickupDate: '', maxDH: '150',
  activeBoards: ALL_BOARDS,
}

function readFilters(): Filters {
  try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(LS_FILTERS) ?? '{}') } }
  catch { return DEFAULT_FILTERS }
}

// ── Market rate widget ────────────────────────────────────────────────────────

function MarketRateWidget({ origin, dest, equipment, businessId }: {
  origin: string; dest: string; equipment: EquipmentType; businessId: string
}) {
  const [rate, setRate]       = useState<MarketRate | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!origin || !dest || !businessId) return
    setLoading(true)
    fetch(`/api/load-boards/rates?businessId=${businessId}&board=dat&origin=${origin}&dest=${dest}&equipment=${equipment}`)
      .then(r => r.ok ? r.json() : null).then(setRate).catch(() => {}).finally(() => setLoading(false))
  }, [origin, dest, equipment, businessId])

  if (!origin || !dest) return null

  return (
    <div style={{ padding: '.5rem .85rem', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '.57rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        📊 Market · {origin}→{dest}
      </span>
      {loading && <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Loading…</span>}
      {rate && !loading && <>
        <span style={{ fontSize: '.72rem', fontWeight: 900, color: rpmColor(rate.avgRatePerMile) }}>${rate.avgRatePerMile.toFixed(2)}/mi avg</span>
        <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>${rate.lowRatePerMile.toFixed(2)} – ${rate.highRatePerMile.toFixed(2)}</span>
        {rate.trend && <span style={{ fontSize: '.6rem', fontWeight: 700, color: rate.trend === 'up' ? 'var(--primary)' : rate.trend === 'down' ? 'var(--error)' : 'var(--muted)' }}>
          {rate.trend === 'up' ? '▲' : rate.trend === 'down' ? '▼' : '→'} {rate.trendPct ? `${Math.abs(rate.trendPct).toFixed(1)}%` : ''}
        </span>}
        {rate.dataPoints && <span style={{ fontSize: '.55rem', color: 'var(--muted)' }}>{rate.dataPoints.toLocaleString()} loads</span>}
      </>}
      {!rate && !loading && <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Connect DAT to see rate intelligence</span>}
    </div>
  )
}

// ── Post truck panel ──────────────────────────────────────────────────────────

function PostTruckPanel({ businessId, filters }: { businessId: string; filters: Filters }) {
  const [boards,   setBoards]   = useState<LoadBoardId[]>(['dat', 'truckstop'])
  const [comments, setComments] = useState('')
  const [posting,  setPosting]  = useState(false)
  const [result,   setResult]   = useState<string | null>(null)

  async function post() {
    if (!businessId) { setResult('⚠️ No business account — connect one in Account settings'); return }
    setPosting(true); setResult(null)
    try {
      const truck: TruckPosting = {
        equipment:     filters.equipment,
        availableDate: filters.pickupDate || new Date().toISOString().split('T')[0],
        originCity:    filters.originCity,
        originState:   filters.originState,
        destStates:    filters.destState ? [filters.destState] : undefined,
        comments,
      }
      const res  = await fetch('/api/load-boards/post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, boards, truck }),
      })
      const data = await res.json()
      const ok   = Object.values(data.results ?? {}).filter((v: unknown) => (v as { success: boolean }).success).length
      setResult(`✅ Posted to ${ok}/${boards.length} board${boards.length !== 1 ? 's' : ''}`)
    } catch { setResult('❌ Network error') }
    finally   { setPosting(false) }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem 1rem', display: 'grid', gap: '.55rem' }}>
      <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
        🚛 Post Truck to Boards
      </div>
      <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>
        Uses your current origin, equipment, and date from the filter. Select which boards to post to:
      </div>
      <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
        {ALL_BOARDS.map(b => {
          const on = boards.includes(b)
          return (
            <button key={b} onClick={() => setBoards(p => on ? p.filter(x => x !== b) : [...p, b])} style={{
              fontSize: '.58rem', fontWeight: 800, padding: '.25rem .5rem', borderRadius: 6, cursor: 'pointer',
              background: on ? BOARD_META[b].color + '18' : 'var(--surface-2)',
              border: `1px solid ${on ? BOARD_META[b].color + '50' : 'var(--border)'}`,
              color: on ? BOARD_META[b].color : 'var(--muted)',
            }}>
              {BOARD_META[b].logoEmoji} {BOARD_META[b].label}
            </button>
          )
        })}
      </div>
      <input value={comments} onChange={e => setComments(e.target.value)} placeholder="Comments (optional)" style={{ fontSize: '.65rem', padding: '.35rem .55rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }} />
      {result && <div style={{ fontSize: '.62rem', fontWeight: 700, color: result.startsWith('✅') ? 'var(--primary)' : 'var(--warn)' }}>{result}</div>}
      <button onClick={post} disabled={posting || boards.length === 0} style={{ padding: '.42rem', borderRadius: 8, fontSize: '.67rem', fontWeight: 800, background: 'var(--primary)', color: 'var(--surface)', border: 'none', cursor: posting ? 'wait' : 'pointer', opacity: boards.length === 0 ? 0.5 : 1 }}>
        {posting ? 'Posting…' : `Post to ${boards.length} board${boards.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

// ── Load table row ────────────────────────────────────────────────────────────

function LoadRow({ load, onBook, booking, booked }: { load: NormalizedLoad; onBook: (l: NormalizedLoad) => void; booking: boolean; booked: boolean }) {
  const bd = BOARD_META[load.board]
  const r  = rpmVal(load)
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', opacity: booked ? 0.55 : 1 }}>
      <td style={{ padding: '.42rem .6rem', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '.57rem', fontWeight: 800, color: bd.color, padding: '.1rem .35rem', borderRadius: 5, background: bd.color + '18', border: '1px solid ' + bd.color + '40' }}>{bd.logoEmoji} {bd.label}</span>
      </td>
      <td style={{ padding: '.42rem .6rem' }}>
        <div style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
          {load.origin.city}, {load.origin.state} → {load.destination.city}, {load.destination.state}
        </div>
        <div style={{ fontSize: '.55rem', color: 'var(--muted)' }}>
          {fmtDate(load.origin.earlyDate)}{load.deadheadMiles ? ` · ${load.deadheadMiles}mi DH` : ''}
        </div>
      </td>
      <td style={{ padding: '.42rem .6rem', textAlign: 'center' }}>
        <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{load.equipmentType}</span>
      </td>
      <td style={{ padding: '.42rem .6rem', textAlign: 'right' }}>
        <span style={{ fontSize: '.63rem', color: 'var(--fg)' }}>{fmtMi(load.tripMiles)}</span>
      </td>
      <td style={{ padding: '.42rem .6rem', textAlign: 'right' }}>
        <div style={{ fontSize: '.68rem', fontWeight: 900, color: 'var(--fg)', whiteSpace: 'nowrap' }}>{fmtRate(load)}</div>
      </td>
      <td style={{ padding: '.42rem .6rem', textAlign: 'right' }}>
        <span style={{ fontSize: '.66rem', fontWeight: 800, color: rpmColor(r) }}>{fmtRpm(load)}</span>
      </td>
      <td style={{ padding: '.42rem .6rem' }}>
        <div style={{ fontSize: '.6rem', color: 'var(--muted)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{load.brokerName ?? '—'}</div>
      </td>
      <td style={{ padding: '.42rem .6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          {load.brokerPhone && <a href={`tel:${load.brokerPhone}`} style={{ fontSize: '.6rem', padding: '.22rem .4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', textDecoration: 'none' }}>📞</a>}
          {load.externalUrl  && <a href={load.externalUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.6rem', padding: '.22rem .4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', textDecoration: 'none' }}>🔗</a>}
          <button onClick={() => onBook(load)} disabled={booking || booked} style={{ fontSize: '.6rem', fontWeight: 800, padding: '.22rem .5rem', borderRadius: 6, cursor: booking ? 'wait' : 'pointer', background: booked ? 'rgba(0,232,176,.1)' : 'var(--primary)', color: booked ? 'var(--primary)' : 'var(--surface)', border: booked ? '1px solid rgba(0,232,176,.3)' : 'none' }}>
            {booked ? '✅' : booking ? '…' : 'Book'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = 'rpm' | 'rate' | 'miles' | 'dh' | 'posted'

export default function LoadsPage() {
  const [filters,    setFilters]    = useState<Filters>(DEFAULT_FILTERS)
  const [results,    setResults]    = useState<LoadBoardSearchResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [searchErr,  setSearchErr]  = useState<string | null>(null)
  const [sortKey,    setSortKey]    = useState<SortKey>('rpm')
  const [sortAsc,    setSortAsc]    = useState(false)
  const [bookingId,  setBookingId]  = useState<string | null>(null)
  const [bookedIds,  setBookedIds]  = useState<Set<string>>(new Set())
  const [businessId, setBusinessId] = useState('')
  const [activeTab,  setActiveTab]  = useState<'search' | 'post'>('search')
  const init = useRef(false)

  useEffect(() => {
    if (init.current) return; init.current = true
    setFilters(readFilters())
    setBusinessId(getBusinessId())
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_FILTERS, JSON.stringify(filters)) } catch { /* ignore */ }
  }, [filters])

  function set<K extends keyof Filters>(k: K, v: Filters[K]) { setFilters(p => ({ ...p, [k]: v })) }

  function toggleBoard(b: LoadBoardId) {
    setFilters(p => ({ ...p, activeBoards: p.activeBoards.includes(b) ? p.activeBoards.filter(x => x !== b) : [...p.activeBoards, b] }))
  }

  const search = useCallback(async () => {
    if (!filters.originState) { setSearchErr('Origin state required'); return }
    setSearching(true); setSearchErr(null); setResults([])
    try {
      const res  = await fetch('/api/load-boards/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          boards: filters.activeBoards,
          params: {
            originCity:       filters.originCity  || undefined,
            originState:      filters.originState,
            destState:        filters.destState   || undefined,
            equipment:        [filters.equipment],
            pickupDateStart:  filters.pickupDate  || undefined,
            maxDeadheadMiles: filters.maxDH ? parseInt(filters.maxDH) : undefined,
            limit: 100,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSearchErr(data.error ?? 'Search failed'); return }
      setResults(data.results ?? [])
    } catch { setSearchErr('Network error') }
    finally   { setSearching(false) }
  }, [filters, businessId])

  const book = useCallback(async (load: NormalizedLoad) => {
    const key = `${load.board}-${load.boardLoadId}`
    setBookingId(key)
    try {
      const res = await fetch('/api/load-boards/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, board: load.board, boardLoadId: load.boardLoadId, load }),
      })
      if (res.ok) setBookedIds(p => new Set([...p, key]))
      else { const d = await res.json(); alert(`Booking failed: ${d.error}`) }
    } catch { alert('Network error') }
    finally   { setBookingId(null) }
  }, [businessId])

  // Sort + flatten
  const allLoads = results.flatMap(r => r.loads).sort((a, b) => {
    let d = 0
    if (sortKey === 'rpm')    d = rpmVal(b) - rpmVal(a)
    if (sortKey === 'rate')   d = (b.rate ?? 0) - (a.rate ?? 0)
    if (sortKey === 'miles')  d = (b.tripMiles ?? 0) - (a.tripMiles ?? 0)
    if (sortKey === 'dh')     d = (a.deadheadMiles ?? 999) - (b.deadheadMiles ?? 999)
    if (sortKey === 'posted') d = new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime()
    return sortAsc ? -d : d
  })

  function setSort(k: SortKey) { if (sortKey === k) setSortAsc(a => !a); else { setSortKey(k); setSortAsc(false) } }
  function arrow(k: SortKey)   { return sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '' }

  const boardCounts = results.map(r => ({ board: r.board, count: r.loads.length, err: r.error }))

  const inp: React.CSSProperties = { fontSize: '.67rem', padding: '.37rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', width: '100%', boxSizing: 'border-box' }
  const th:  React.CSSProperties = { padding: '.38rem .6rem', fontSize: '.57rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', textAlign: 'left' }

  return (
    <>
      <TopBar title="Load Board" module="ops" subtitle="Find loads · book · post truck · market rates" />

      <div style={{ padding: '1rem 1.2rem', display: 'grid', gap: '.75rem' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '.3rem' }}>
          {([['search','🔍 Find Loads'], ['post','🚛 Post Truck']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              fontSize: '.63rem', fontWeight: 800, padding: '.35rem .7rem', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${activeTab === t ? 'rgba(0,232,176,.35)' : 'var(--border)'}`,
              background: activeTab === t ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
              color: activeTab === t ? 'var(--primary)' : 'var(--muted)',
            }}>{label}</button>
          ))}
          {allLoads.length > 0 && <span style={{ marginLeft: 'auto', fontSize: '.62rem', color: 'var(--muted)', alignSelf: 'center' }}>{allLoads.length} loads across {results.filter(r => r.loads.length > 0).length} boards</span>}
        </div>

        {/* Post truck */}
        {activeTab === 'post' && <PostTruckPanel businessId={businessId} filters={filters} />}

        {activeTab === 'search' && (
          <>
            {/* Filter card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '.8rem 1rem', display: 'grid', gap: '.6rem' }}>

              {/* Board toggles + counts */}
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginRight: 2 }}>Boards:</span>
                {ALL_BOARDS.map(b => {
                  const on  = filters.activeBoards.includes(b)
                  const cnt = boardCounts.find(r => r.board === b)
                  return (
                    <button key={b} onClick={() => toggleBoard(b)} style={{
                      fontSize: '.58rem', fontWeight: 800, padding: '.22rem .5rem', borderRadius: 6, cursor: 'pointer',
                      background: on ? BOARD_META[b].color + '18' : 'var(--surface-2)',
                      border:     `1px solid ${on ? BOARD_META[b].color + '50' : 'var(--border)'}`,
                      color:      on ? BOARD_META[b].color : 'var(--muted)',
                    }}>
                      {BOARD_META[b].logoEmoji} {BOARD_META[b].label}
                      {cnt && <span style={{ marginLeft: 4, opacity: .7 }}>({cnt.err ? '!' : cnt.count})</span>}
                    </button>
                  )
                })}
              </div>

              {/* Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '.45rem' }}>
                {[
                  { label: 'Origin City', val: filters.originCity,  key: 'originCity'  as const, ph: 'Dallas'   },
                  { label: 'State *',     val: filters.originState, key: 'originState' as const, ph: 'TX', max: 2 },
                  { label: 'Dest State',  val: filters.destState,   key: 'destState'   as const, ph: 'Any', max: 2 },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: '.52rem', color: 'var(--muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase' }}>{f.label}</div>
                    <input style={inp} value={f.val} placeholder={f.ph} maxLength={f.max}
                      onChange={e => set(f.key, f.max ? e.target.value.toUpperCase().slice(0, f.max) : e.target.value)} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: '.52rem', color: 'var(--muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase' }}>Equipment</div>
                  <select style={inp} value={filters.equipment} onChange={e => set('equipment', e.target.value as EquipmentType)}>
                    {EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '.52rem', color: 'var(--muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase' }}>Pickup Date</div>
                  <input type="date" style={inp} value={filters.pickupDate} onChange={e => set('pickupDate', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: '.52rem', color: 'var(--muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase' }}>Max DH mi</div>
                  <input type="number" style={inp} value={filters.maxDH} placeholder="150" onChange={e => set('maxDH', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <button onClick={search} disabled={searching || !filters.originState} style={{ padding: '.42rem 1.1rem', borderRadius: 8, fontSize: '.68rem', fontWeight: 800, background: searching ? 'var(--surface-2)' : 'var(--primary)', color: searching ? 'var(--muted)' : 'var(--surface)', border: 'none', cursor: searching ? 'wait' : 'pointer', opacity: !filters.originState ? 0.5 : 1 }}>
                  {searching ? '🔍 Searching…' : '🔍 Search All Boards'}
                </button>
                {searchErr && <span style={{ fontSize: '.62rem', color: 'var(--error)' }}>{searchErr}</span>}
              </div>
            </div>

            {/* Market rate intelligence */}
            {filters.originState && filters.destState && (
              <MarketRateWidget origin={filters.originState} dest={filters.destState} equipment={filters.equipment} businessId={businessId} />
            )}

            {/* Empty state */}
            {!searching && allLoads.length === 0 && (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📡</div>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--fg)', marginBottom: 4 }}>
                  {results.length > 0 ? 'No loads matched your filters' : 'Connect your load boards to start searching'}
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: 14 }}>
                  {results.length > 0 ? 'Try widening your search radius or removing the date filter.' : 'Go to Account → Load Boards to connect DAT, Truckstop, and more.'}
                </div>
                {results.length === 0 && (
                  <a href="/account" style={{ fontSize: '.65rem', fontWeight: 800, padding: '.4rem .85rem', borderRadius: 8, background: 'var(--primary)', color: 'var(--surface)', textDecoration: 'none' }}>
                    Connect Boards →
                  </a>
                )}
              </div>
            )}

            {/* Results table */}
            {allLoads.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <th style={th}>Board</th>
                        <th style={th}>Lane</th>
                        <th style={{ ...th, textAlign: 'center' }}>Equip</th>
                        <th style={{ ...th, textAlign: 'right' }} onClick={() => setSort('miles')}>Miles{arrow('miles')}</th>
                        <th style={{ ...th, textAlign: 'right' }} onClick={() => setSort('rate')}>Rate{arrow('rate')}</th>
                        <th style={{ ...th, textAlign: 'right' }} onClick={() => setSort('rpm')}>$/mi{arrow('rpm')}</th>
                        <th style={th}>Broker</th>
                        <th style={{ ...th, textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allLoads.map(load => {
                        const key = `${load.board}-${load.boardLoadId}`
                        return <LoadRow key={key} load={load} onBook={book} booking={bookingId === key} booked={bookedIds.has(key)} />
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
