'use client'
/**
 * NavigationSnapshotCard
 *
 * Lightweight navigation progress layer. No live routing API yet —
 * manual entry + Truckers Path paste import. API-ready when routing connects.
 *
 * Storage: localStorage key '3b-nav-snapshot' (autosaves on change)
 * Future: Syncs to fleet_navigation_snapshots table when user is authenticated.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { LoadMission, NavSnapshot, RouteSourceType } from '@/lib/dashboard/types'

const LS_KEY = '3b-nav-snapshot'
const AVG_SPEED_MPH = 55  // conservative trucking average for ETA calc

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcDriveTime(miles: number | null): string {
  if (!miles || miles <= 0) return '—'
  const totalMins = Math.round((miles / AVG_SPEED_MPH) * 60)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function calcEta(miles: number | null): string | null {
  if (!miles || miles <= 0) return null
  const ms = (miles / AVG_SPEED_MPH) * 60 * 60 * 1000
  return new Date(Date.now() + ms).toISOString()
}

function fmtEta(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtUpdated(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function loadSnapshot(): NavSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function blankSnapshot(mission?: LoadMission | null): NavSnapshot {
  const dest    = mission?.destination ?? ''
  const address = mission?.stops?.find(s => !s.completed)?.address ?? ''
  const nextStop = (() => {
    const incomplete = mission?.stops?.filter(s => !s.completed) ?? []
    if (incomplete.length > 1) {
      const s = incomplete[1]
      return [s.name, s.city, s.state].filter(Boolean).join(', ')
    }
    return ''
  })()
  return {
    id:                 crypto.randomUUID(),
    missionId:          mission?.id ?? null,
    loadNumber:         mission?.loadNumber ?? null,
    currentDestination: dest,
    destinationAddress: address,
    remainingMiles:     null,
    estimatedDriveTime: '—',
    eta:                null,
    nextPlannedStop:    nextStop,
    routeSource:        'manual',
    manualRouteNotes:   '',
    lastUpdated:        new Date().toISOString(),
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mission?: LoadMission | null
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NavigationSnapshotCard({ mission }: Props) {
  const [snap,         setSnap]         = useState<NavSnapshot | null>(null)
  const [milesInput,   setMilesInput]   = useState('')
  const [showNotes,    setShowNotes]    = useState(false)
  const [expanded,     setExpanded]     = useState(false)
  const [saved,        setSaved]        = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef  = useRef<HTMLTextAreaElement>(null)

  // ── Load snapshot on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const existing = loadSnapshot()
    // If mission changed (new load), reset destination fields but keep notes
    if (existing) {
      const updated = { ...existing }
      if (mission?.id && existing.missionId !== mission.id) {
        updated.missionId          = mission.id
        updated.loadNumber         = mission.loadNumber ?? null
        updated.currentDestination = mission.destination ?? existing.currentDestination
        updated.nextPlannedStop    = blankSnapshot(mission).nextPlannedStop || existing.nextPlannedStop
      }
      setSnap(updated)
      setMilesInput(updated.remainingMiles != null ? String(updated.remainingMiles) : '')
    } else {
      const blank = blankSnapshot(mission)
      setSnap(blank)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave ───────────────────────────────────────────────────────────────
  const persist = useCallback((s: NavSnapshot) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  function schedule(s: NavSnapshot) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(s), 600)
  }

  // ── Field updaters ─────────────────────────────────────────────────────────
  function updateField<K extends keyof NavSnapshot>(key: K, value: NavSnapshot[K]) {
    setSnap(prev => {
      if (!prev) return prev
      const updated = { ...prev, [key]: value, lastUpdated: new Date().toISOString() }
      schedule(updated)
      return updated
    })
  }

  function handleMilesChange(raw: string) {
    setMilesInput(raw)
    const miles = parseFloat(raw)
    const valid = !isNaN(miles) && miles > 0
    setSnap(prev => {
      if (!prev) return prev
      const updated: NavSnapshot = {
        ...prev,
        remainingMiles:     valid ? miles : null,
        estimatedDriveTime: valid ? calcDriveTime(miles) : '—',
        eta:                valid ? calcEta(miles) : null,
        lastUpdated:        new Date().toISOString(),
      }
      schedule(updated)
      return updated
    })
  }

  function handleSourceChange(src: RouteSourceType) {
    updateField('routeSource', src)
    if (src === 'truckers_path') {
      setShowNotes(true)
      setTimeout(() => notesRef.current?.focus(), 100)
    }
  }

  function handleNotesChange(val: string) {
    updateField('manualRouteNotes', val)
  }

  // ── Recalculate ETA from current miles ────────────────────────────────────
  function recalcEta() {
    const miles = snap?.remainingMiles
    if (!miles) return
    setSnap(prev => {
      if (!prev) return prev
      const updated: NavSnapshot = {
        ...prev,
        estimatedDriveTime: calcDriveTime(miles),
        eta:                calcEta(miles),
        lastUpdated:        new Date().toISOString(),
      }
      persist(updated)
      return updated
    })
  }

  if (!snap) return null

  const hasLoad = !!snap.currentDestination
  const etaDisplay = fmtEta(snap.eta)
  const hasMiles = snap.remainingMiles != null && snap.remainingMiles > 0

  return (
    <div className="cc-card" style={{ position: 'relative' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: '1rem' }}>🗺 Navigation</span>
          {saved && (
            <span style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--success)', background: 'rgba(40,192,72,.1)', border: '1px solid rgba(40,192,72,.2)', borderRadius: 4, padding: '.1rem .35rem' }}>
              saved
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {/* API badge */}
          <span style={{
            fontSize: '.55rem', fontWeight: 800, letterSpacing: '.06em',
            color: 'var(--warn)', background: 'rgba(245,194,0,.1)',
            border: '1px solid rgba(245,194,0,.25)', borderRadius: 5,
            padding: '.15rem .45rem', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            📡 Manual Mode
          </span>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '.8rem', cursor: 'pointer', padding: '.2rem .3rem', lineHeight: 1 }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Destination row ── */}
      {hasLoad ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.55rem' }}>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Destination</div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--text)', lineHeight: 1.2 }}>{snap.currentDestination}</div>
            {snap.destinationAddress && (
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>{snap.destinationAddress}</div>
            )}
          </div>
          {snap.loadNumber && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Load</div>
              <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>#{snap.loadNumber}</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: '.55rem' }}>
          <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Destination</div>
          <input
            value={snap.currentDestination}
            onChange={e => updateField('currentDestination', e.target.value)}
            placeholder="Enter destination city, ST"
            style={{ width: '100%', padding: '.5rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 700, boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* ── Remaining miles + ETA strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem', marginBottom: '.65rem' }}>
        {/* Miles input */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.5rem .65rem' }}>
          <div style={{ fontSize: '.52rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Remaining</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <input
              type="text" inputMode="numeric"
              value={milesInput}
              onChange={e => handleMilesChange(e.target.value)}
              placeholder="0"
              style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontWeight: 900, fontSize: '1.25rem', color: hasMiles ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums', padding: 0 }}
            />
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>mi</span>
          </div>
        </div>

        {/* Drive time */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.5rem .65rem' }}>
          <div style={{ fontSize: '.52rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Drive Time</div>
          <div style={{ fontWeight: 900, fontSize: '1.25rem', color: hasMiles ? 'var(--text)' : 'var(--faint)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {snap.estimatedDriveTime}
          </div>
        </div>

        {/* ETA */}
        <div
          style={{ background: hasMiles ? 'rgba(0,232,176,.07)' : 'var(--surface-2)', border: `1px solid ${hasMiles ? 'rgba(0,232,176,.2)' : 'var(--border)'}`, borderRadius: 10, padding: '.5rem .65rem', cursor: hasMiles ? 'pointer' : 'default' }}
          onClick={hasMiles ? recalcEta : undefined}
          title={hasMiles ? 'Tap to refresh ETA from now' : undefined}
        >
          <div style={{ fontSize: '.52rem', fontWeight: 800, color: hasMiles ? 'var(--primary)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>ETA</div>
          <div style={{ fontWeight: 900, fontSize: '1.25rem', color: hasMiles ? 'var(--primary)' : 'var(--faint)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {etaDisplay}
          </div>
        </div>
      </div>

      {/* ── Next stop ── */}
      <div style={{ marginBottom: '.6rem' }}>
        <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>Next Planned Stop</div>
        <input
          value={snap.nextPlannedStop}
          onChange={e => updateField('nextPlannedStop', e.target.value)}
          placeholder="e.g. Laurel Love's — fuel + scale"
          style={{ width: '100%', padding: '.45rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 600, boxSizing: 'border-box' }}
        />
      </div>

      {/* ── Route source pills ── */}
      <div style={{ display: 'flex', gap: 5, marginBottom: '.6rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.52rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', alignSelf: 'center', marginRight: 2 }}>Source:</div>
        {([
          ['manual',       '✏️ Manual'],
          ['truckers_path','🚛 Truckers Path'],
          ['google_maps',  '🗺 Google Maps'],
        ] as [RouteSourceType, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => handleSourceChange(id)}
            style={{
              padding: '.25rem .6rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 700, cursor: 'pointer',
              border:     snap.routeSource === id ? '1px solid rgba(0,232,176,.4)' : '1px solid var(--border)',
              background: snap.routeSource === id ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
              color:      snap.routeSource === id ? 'var(--primary)' : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Notes toggle ── */}
      <button
        onClick={() => {
          setShowNotes(v => !v)
          if (!showNotes) setTimeout(() => notesRef.current?.focus(), 80)
        }}
        style={{
          width: '100%', padding: '.4rem .75rem', borderRadius: 9, fontSize: '.75rem', fontWeight: 700,
          border: showNotes ? '1px solid rgba(0,232,176,.3)' : '1px solid var(--border)',
          background: showNotes ? 'rgba(0,232,176,.06)' : 'var(--surface-2)',
          color: showNotes ? 'var(--primary)' : 'var(--muted)',
          cursor: 'pointer', textAlign: 'left', marginBottom: showNotes ? '.5rem' : 0,
          display: 'flex', alignItems: 'center', gap: 6, boxSizing: 'border-box',
        }}
      >
        <span>📋</span>
        <span>{snap.manualRouteNotes ? `Route Notes (${snap.manualRouteNotes.length} chars)` : 'Paste Route Notes / Truckers Path Import'}</span>
        <span style={{ marginLeft: 'auto', fontSize: '.65rem' }}>{showNotes ? '▲' : '▼'}</span>
      </button>

      {showNotes && (
        <div>
          <textarea
            ref={notesRef}
            value={snap.manualRouteNotes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder={`Paste route notes here — Truckers Path, Google Maps directions, dispatcher notes, weigh station alerts, road conditions, preferred exits...\n\nThis will NOT overwrite your trip plan.`}
            rows={5}
            style={{
              width: '100%', padding: '.65rem .85rem', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', lineHeight: 1.55,
              resize: 'vertical', boxSizing: 'border-box', marginBottom: '.35rem',
            }}
          />
          <div style={{ fontSize: '.6rem', color: 'var(--faint)', fontStyle: 'italic', lineHeight: 1.4 }}>
            ✅ These notes are saved separately — your trip plan is not affected.
          </div>
        </div>
      )}

      {/* ── Expanded: destination address + future-ready notice ── */}
      {expanded && (
        <div style={{ marginTop: '.75rem', borderTop: '1px solid var(--border)', paddingTop: '.75rem', display: 'grid', gap: '.55rem' }}>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>Destination Address</div>
            <input
              value={snap.destinationAddress}
              onChange={e => updateField('destinationAddress', e.target.value)}
              placeholder="Full street address (optional)"
              style={{ width: '100%', padding: '.45rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', boxSizing: 'border-box' }}
            />
          </div>

          {/* Future fields — placeholder UI */}
          <div style={{ padding: '.6rem .85rem', background: 'rgba(74,196,255,.04)', border: '1px solid rgba(74,196,255,.15)', borderRadius: 10 }}>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>🔌 Routing API — Coming Soon</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              When a truck routing API is connected, these fields will auto-fill live:<br />
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>Turn-by-turn · Current road · Off-route detection · Live ETA · Re-routing</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginTop: '.55rem' }}>
              {['Next Turn', 'Dist. to Turn', 'Current Road', 'Off-Route'].map(f => (
                <div key={f} style={{ padding: '.3rem .55rem', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.62rem', color: 'var(--faint)', fontWeight: 700 }}>
                  {f}: <span style={{ fontStyle: 'italic' }}>—</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer: speed assumption + last updated ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.6rem', paddingTop: '.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '.58rem', color: 'var(--faint)' }}>
          ETA based on {AVG_SPEED_MPH} mph avg
        </div>
        <div style={{ fontSize: '.58rem', color: 'var(--faint)', textAlign: 'right' }}>
          Updated {fmtUpdated(snap.lastUpdated)}
        </div>
      </div>
    </div>
  )
}
