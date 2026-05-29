'use client'
/**
 * LoadBoardPanel — Multi-board load search & booking UI
 *
 * Lets dispatchers search DAT, Truckstop, and other connected boards
 * from a single panel inside Fleet Commander.
 *
 * Flow:
 *   1. Dispatcher fills search form (origin, dest, equipment, date)
 *   2. Panel calls /api/load-boards/search (server-side, credential-safe)
 *   3. Results displayed as cards sorted by rate/mile
 *   4. "Book This Load" → calls /api/load-boards/book
 *      → creates fleet_loads record + saves rate confirmation
 *      → platform fee auto-calculated if brokered through FC
 *   5. Booked load appears in the dispatch feed immediately
 *
 * Props:
 *   businessId   — current user's business (from auth-adapter)
 *   onLoadBooked — callback when a load is successfully booked
 */

import { useState, useCallback } from 'react'
import { BOARD_META, type LoadBoardId, type NormalizedLoad, type EquipmentType, type LoadBoardSearchResult } from '@/lib/loadBoards/types'

// ── Equipment options ─────────────────────────────────────────────────────────

const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: 'V',   label: 'Dry Van' },
  { value: 'R',   label: 'Reefer' },
  { value: 'F',   label: 'Flatbed' },
  { value: 'SD',  label: 'Step Deck' },
  { value: 'PO',  label: 'Power Only' },
  { value: 'HS',  label: 'Hot Shot' },
  { value: 'RGN', label: 'RGN' },
  { value: 'TANK',label: 'Tanker' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpmColor(rpm?: number): string {
  if (!rpm) return 'var(--muted)'
  if (rpm >= 3.0) return 'var(--primary)'
  if (rpm >= 2.0) return 'var(--warn)'
  return 'var(--error)'
}

function formatRate(load: NormalizedLoad): string {
  if (load.rate)        return `$${load.rate.toLocaleString()}`
  if (load.ratePerMile) return `$${load.ratePerMile.toFixed(2)}/mi`
  return 'Call'
}

function formatRpm(load: NormalizedLoad): string {
  if (load.ratePerMile) return `$${load.ratePerMile.toFixed(2)}/mi`
  if (load.rate && load.tripMiles) return `$${(load.rate / load.tripMiles).toFixed(2)}/mi`
  return ''
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Load card ─────────────────────────────────────────────────────────────────

function LoadCard({
  load,
  onBook,
  booking,
}: {
  load:    NormalizedLoad
  onBook:  (load: NormalizedLoad) => void
  booking: boolean
}) {
  const board = BOARD_META[load.board]
  const rpm   = load.ratePerMile ?? (load.rate && load.tripMiles ? load.rate / load.tripMiles : undefined)

  return (
    <div style={{
      padding: '.65rem .8rem', borderRadius: 10,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'grid', gap: '.45rem',
    }}>
      {/* Header: board badge + rate */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '.65rem' }}>{board.logoEmoji}</span>
          <span style={{
            fontSize: '.52rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em',
            color: board.color, padding: '.1rem .35rem', borderRadius: 5,
            background: `${board.color}18`, border: `1px solid ${board.color}40`,
          }}>
            {board.label}
          </span>
          <span style={{
            fontSize: '.52rem', fontWeight: 700, color: 'var(--muted)',
            padding: '.1rem .35rem', borderRadius: 5,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            {load.equipmentType} · {load.fullOrPartial}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '.8rem', fontWeight: 900, color: 'var(--fg)', lineHeight: 1 }}>
            {formatRate(load)}
          </div>
          {rpm && (
            <div style={{ fontSize: '.58rem', fontWeight: 700, color: rpmColor(rpm) }}>
              {formatRpm(load)}
            </div>
          )}
        </div>
      </div>

      {/* Lane */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--fg)' }}>
            {load.origin.city}, {load.origin.state}
          </div>
          <div style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
            {formatDate(load.origin.earlyDate)}
            {load.deadheadMiles ? ` · ${load.deadheadMiles}mi DH` : ''}
          </div>
        </div>
        <div style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '0 4px' }}>→</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--fg)' }}>
            {load.destination.city}, {load.destination.state}
          </div>
          <div style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
            {load.tripMiles ? `${load.tripMiles.toLocaleString()}mi loaded` : 'Miles TBD'}
          </div>
        </div>
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {load.weight && (
          <span style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
            ⚖️ {load.weight.toLocaleString()} lbs
          </span>
        )}
        {load.commodity && (
          <span style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
            📦 {load.commodity}
          </span>
        )}
        {load.brokerName && (
          <span style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
            🏢 {load.brokerName}
          </span>
        )}
        {load.vsDayAvg !== undefined && (
          <span style={{
            fontSize: '.57rem', fontWeight: 700,
            color: load.vsDayAvg >= 0 ? 'var(--primary)' : 'var(--error)',
          }}>
            {load.vsDayAvg >= 0 ? '▲' : '▼'} {Math.abs(load.vsDayAvg).toFixed(1)}% vs avg
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
        {load.brokerPhone && (
          <a
            href={`tel:${load.brokerPhone}`}
            style={{
              fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)',
              padding: '.3rem .55rem', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              textDecoration: 'none',
            }}
          >
            📞 Call
          </a>
        )}
        {load.externalUrl && (
          <a
            href={load.externalUrl}
            target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)',
              padding: '.3rem .55rem', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              textDecoration: 'none',
            }}
          >
            🔗 View
          </a>
        )}
        <button
          onClick={() => onBook(load)}
          disabled={booking || load.savedToFleet}
          style={{
            fontSize: '.62rem', fontWeight: 800,
            color: load.savedToFleet ? 'var(--primary)' : 'var(--surface)',
            background: load.savedToFleet ? 'rgba(0,232,176,.12)' : 'var(--primary)',
            border: `1px solid ${load.savedToFleet ? 'rgba(0,232,176,.35)' : 'transparent'}`,
            padding: '.3rem .65rem', borderRadius: 7, cursor: booking ? 'wait' : 'pointer',
            opacity: booking ? 0.7 : 1,
          }}
        >
          {load.savedToFleet ? '✅ Booked' : booking ? 'Booking…' : 'Book This Load'}
        </button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  businessId:    string
  onLoadBooked?: (fleetLoadId: string, load: NormalizedLoad) => void
}

export default function LoadBoardPanel({ businessId, onLoadBooked }: Props) {
  // Search form
  const [originCity,  setOriginCity]  = useState('')
  const [originState, setOriginState] = useState('')
  const [destState,   setDestState]   = useState('')
  const [equipment,   setEquipment]   = useState<EquipmentType>('V')
  const [pickupDate,  setPickupDate]  = useState('')
  const [maxDH,       setMaxDH]       = useState('100')

  // Results
  const [results,    setResults]    = useState<LoadBoardSearchResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [searchErr,  setSearchErr]  = useState<string | null>(null)
  const [sortBy,     setSortBy]     = useState<'rpm' | 'rate' | 'miles' | 'posted'>('rpm')
  const [bookingId,  setBookingId]  = useState<string | null>(null)
  const [bookedIds,  setBookedIds]  = useState<Set<string>>(new Set())

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!originState || !equipment) { setSearchErr('Origin state and equipment required'); return }
    setSearching(true)
    setSearchErr(null)
    setResults([])

    try {
      const res = await fetch('/api/load-boards/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          businessId,
          params: {
            originCity:       originCity || undefined,
            originState,
            destState:        destState || undefined,
            equipment:        [equipment],
            pickupDateStart:  pickupDate || undefined,
            maxDeadheadMiles: maxDH ? parseInt(maxDH) : undefined,
            limit:            50,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSearchErr(data.error ?? 'Search failed'); return }
      setResults(data.results ?? [])
    } catch {
      setSearchErr('Network error — check your connection')
    } finally {
      setSearching(false)
    }
  }, [businessId, originCity, originState, destState, equipment, pickupDate, maxDH])

  // ── Book ────────────────────────────────────────────────────────────────────

  const handleBook = useCallback(async (load: NormalizedLoad) => {
    const key = `${load.board}-${load.boardLoadId}`
    setBookingId(key)

    try {
      const res = await fetch('/api/load-boards/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ businessId, board: load.board, boardLoadId: load.boardLoadId, load }),
      })
      const data = await res.json()
      if (!res.ok) { alert(`Booking failed: ${data.error}`); return }

      setBookedIds(prev => new Set([...prev, key]))
      onLoadBooked?.(data.fleetLoadId, load)
    } catch {
      alert('Network error — booking failed')
    } finally {
      setBookingId(null)
    }
  }, [businessId, onLoadBooked])

  // ── Sort & flatten results ──────────────────────────────────────────────────

  const allLoads: NormalizedLoad[] = results
    .flatMap(r => r.loads)
    .map(l => ({
      ...l,
      savedToFleet: bookedIds.has(`${l.board}-${l.boardLoadId}`),
    }))
    .sort((a, b) => {
      if (sortBy === 'rpm') {
        const aRpm = a.ratePerMile ?? (a.rate && a.tripMiles ? a.rate / a.tripMiles : 0)
        const bRpm = b.ratePerMile ?? (b.rate && b.tripMiles ? b.rate / b.tripMiles : 0)
        return bRpm - aRpm
      }
      if (sortBy === 'rate') return (b.rate ?? 0) - (a.rate ?? 0)
      if (sortBy === 'miles') return (b.tripMiles ?? 0) - (a.tripMiles ?? 0)
      return new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime()
    })

  const totalByBoard = results.map(r => ({ board: r.board, count: r.loads.length, error: r.error }))
  const hasErrors    = results.some(r => r.error)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>

      {/* Header */}
      <div style={{
        padding: '.65rem 1rem', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
          📦 Load Board Search
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {totalByBoard.map(b => (
            <span key={b.board} style={{
              fontSize: '.57rem', fontWeight: 700, padding: '.15rem .4rem', borderRadius: 6,
              color:   b.error ? 'var(--error)'  : BOARD_META[b.board].color,
              background: b.error ? 'rgba(232,64,0,.08)' : `${BOARD_META[b.board].color}18`,
              border: `1px solid ${b.error ? 'rgba(232,64,0,.25)' : BOARD_META[b.board].color}40`,
            }}>
              {BOARD_META[b.board].logoEmoji} {b.error ? 'Error' : b.count}
            </span>
          ))}
        </div>
      </div>

      {/* Search form */}
      <div style={{
        padding: '.75rem', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'grid', gap: '.55rem',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.5rem' }}>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Origin City
            </div>
            <input
              value={originCity} onChange={e => setOriginCity(e.target.value)}
              placeholder="Dallas"
              style={{ width: '100%', fontSize: '.7rem', padding: '.35rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Origin State *
            </div>
            <input
              value={originState} onChange={e => setOriginState(e.target.value.toUpperCase().slice(0,2))}
              placeholder="TX" maxLength={2}
              style={{ width: '100%', fontSize: '.7rem', padding: '.35rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Dest State
            </div>
            <input
              value={destState} onChange={e => setDestState(e.target.value.toUpperCase().slice(0,2))}
              placeholder="CA (any)"  maxLength={2}
              style={{ width: '100%', fontSize: '.7rem', padding: '.35rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '.5rem' }}>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Equipment *
            </div>
            <select
              value={equipment} onChange={e => setEquipment(e.target.value as EquipmentType)}
              style={{ width: '100%', fontSize: '.7rem', padding: '.35rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            >
              {EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Pickup Date
            </div>
            <input
              type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)}
              style={{ width: '100%', fontSize: '.7rem', padding: '.35rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Max DH
            </div>
            <input
              type="number" value={maxDH} onChange={e => setMaxDH(e.target.value)}
              placeholder="100"
              style={{ width: '100%', fontSize: '.7rem', padding: '.35rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <button
          onClick={handleSearch} disabled={searching}
          style={{
            padding: '.5rem', borderRadius: 8, fontSize: '.7rem', fontWeight: 800,
            background: searching ? 'var(--surface-2)' : 'var(--primary)',
            color: searching ? 'var(--muted)' : 'var(--surface)',
            border: 'none', cursor: searching ? 'wait' : 'pointer',
          }}
        >
          {searching ? '🔍 Searching all boards…' : '🔍 Search All Connected Boards'}
        </button>

        {searchErr && (
          <div style={{ fontSize: '.62rem', color: 'var(--error)', padding: '.35rem .55rem', borderRadius: 7, background: 'rgba(232,64,0,.07)', border: '1px solid rgba(232,64,0,.2)' }}>
            {searchErr}
          </div>
        )}
      </div>

      {/* Sort + results count */}
      {allLoads.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)' }}>
            {allLoads.length} load{allLoads.length !== 1 ? 's' : ''} found
          </span>
          <div style={{ display: 'flex', gap: '.3rem' }}>
            {(['rpm','rate','miles','posted'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} style={{
                fontSize: '.58rem', fontWeight: 800, padding: '.25rem .5rem', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${sortBy === s ? 'rgba(0,232,176,.35)' : 'var(--border)'}`,
                background: sortBy === s ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
                color: sortBy === s ? 'var(--primary)' : 'var(--muted)',
                textTransform: 'capitalize',
              }}>
                {s === 'rpm' ? '$/mi' : s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No boards connected */}
      {!searching && results.length === 0 && allLoads.length === 0 && (
        <div style={{
          padding: '1.5rem', borderRadius: 12, textAlign: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📡</div>
          <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--fg)', marginBottom: 4 }}>
            No load boards connected yet
          </div>
          <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>
            Connect DAT or Truckstop in Account → Load Boards to start searching.
          </div>
        </div>
      )}

      {/* Error notices */}
      {hasErrors && (
        <div style={{ fontSize: '.6rem', color: 'var(--warn)', padding: '.35rem .6rem', borderRadius: 7, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.2)' }}>
          ⚠️ Some boards returned errors — partial results shown. Check Account → Load Boards for connection status.
        </div>
      )}

      {/* Load cards */}
      {allLoads.length > 0 && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          {allLoads.map(load => (
            <LoadCard
              key={`${load.board}-${load.boardLoadId}`}
              load={load}
              onBook={handleBook}
              booking={bookingId === `${load.board}-${load.boardLoadId}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
