'use client'
/**
 * NavigationSnapshotCard
 *
 * Lightweight navigation progress layer. No live routing API yet —
 * manual entry + Truckers Path paste import. API-ready when routing connects.
 *
 * Persistence strategy (layered):
 *   1. localStorage '3b-nav-snapshot'  — always, immediate, offline-safe
 *   2. Supabase fleet_navigation_snapshots — when authenticated, async
 *
 * New v2 features:
 *   - Driver-adjustable avg speed (default 55, range 25–80 mph)
 *   - "Updated by: [Name] · Source: Manual" attribution footer
 *   - Timeline event logged to localStorage on miles change
 *   - Supabase upsert with graceful local fallback
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { LoadMission, NavSnapshot, RouteSourceType } from '@/lib/dashboard/types'
import { createClient } from '@/lib/supabase-browser'

const LS_KEY        = '3b-nav-snapshot'
const LS_EVENTS_KEY = '3b-nav-events'
const LS_SETTINGS   = '3b-fleet-settings'
const DEFAULT_SPEED = 55
const MIN_SPEED     = 25
const MAX_SPEED     = 80

// ── Speed-aware helpers ───────────────────────────────────────────────────────
function calcDriveTime(miles: number | null, speed: number): string {
  if (!miles || miles <= 0 || speed <= 0) return '—'
  const totalMins = Math.round((miles / speed) * 60)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function calcEta(miles: number | null, speed: number): string | null {
  if (!miles || miles <= 0 || speed <= 0) return null
  const ms = (miles / speed) * 60 * 60 * 1000
  return new Date(Date.now() + ms).toISOString()
}

function fmtEta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadSnapshot(): NavSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function getDriverName(): string {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    if (!raw) return ''
    const s = JSON.parse(raw)
    return s?.driverName ?? s?.name ?? ''
  } catch { return '' }
}

function logNavEvent(miles: number, driverName: string) {
  try {
    const event = {
      id:        crypto.randomUUID(),
      message:   `Navigation snapshot updated — ${miles.toLocaleString()} mi remaining`,
      miles,
      updatedBy: driverName || 'Driver',
      timestamp: new Date().toISOString(),
    }
    const raw    = localStorage.getItem(LS_EVENTS_KEY) ?? '[]'
    const events = JSON.parse(raw) as typeof event[]
    events.unshift(event)
    localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(events.slice(0, 50)))
  } catch { /* ignore */ }
}

function blankSnapshot(mission?: LoadMission | null, driverName = ''): NavSnapshot {
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
    currentDestination: mission?.destination ?? '',
    destinationAddress: mission?.stops?.find(s => !s.completed)?.address ?? '',
    remainingMiles:     null,
    estimatedDriveTime: '—',
    eta:                null,
    nextPlannedStop:    nextStop,
    routeSource:        'manual',
    manualRouteNotes:   '',
    lastUpdated:        new Date().toISOString(),
    avgSpeedMph:        DEFAULT_SPEED,
    updatedBy:          driverName,
    updatedSource:      'manual',
  }
}

// ── Supabase sync (fire-and-forget) ──────────────────────────────────────────
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local_only'

async function syncToSupabase(snap: NavSnapshot): Promise<SyncStatus> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'local_only'

    // Fetch business_id from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    const { error } = await supabase
      .from('fleet_navigation_snapshots')
      .upsert({
        id:                   snap.id,
        user_id:              user.id,
        business_id:          profile?.business_id ?? null,
        load_id:              null,          // wired to loads UUID in future phase
        current_destination:  snap.currentDestination   || null,
        destination_address:  snap.destinationAddress   || null,
        remaining_miles:      snap.remainingMiles,
        estimated_drive_time: snap.estimatedDriveTime   || null,
        eta:                  snap.eta,
        next_planned_stop:    snap.nextPlannedStop       || null,
        route_source:         snap.routeSource,
        manual_route_notes:   snap.manualRouteNotes      || null,
        avg_speed_mph:        snap.avgSpeedMph,
        updated_by:           snap.updatedBy             || null,
        updated_source:       snap.updatedSource         || 'manual',
        last_updated:         snap.lastUpdated,
      }, { onConflict: 'id' })

    return error ? 'local_only' : 'synced'
  } catch {
    return 'local_only'
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mission?: LoadMission | null
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NavigationSnapshotCard({ mission }: Props) {
  const [snap,          setSnap]          = useState<NavSnapshot | null>(null)
  const [milesInput,    setMilesInput]    = useState('')
  const [speedInput,    setSpeedInput]    = useState(String(DEFAULT_SPEED))
  const [editingSpeed,  setEditingSpeed]  = useState(false)
  const [showNotes,     setShowNotes]     = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [syncStatus,    setSyncStatus]    = useState<SyncStatus>('idle')
  const [driverName,    setDriverName]    = useState('')

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef   = useRef<HTMLTextAreaElement>(null)
  const speedRef   = useRef<HTMLInputElement>(null)
  // Track the last miles value that got a timeline event (avoid duplicate events)
  const lastLoggedMiles = useRef<number | null>(null)

  // ── Mount: load snapshot + driver name ────────────────────────────────────
  useEffect(() => {
    const name     = getDriverName()
    setDriverName(name)

    const existing = loadSnapshot()
    if (existing) {
      const snap = { ...existing }
      // If mission swapped, refresh destination fields but preserve notes + speed
      if (mission?.id && existing.missionId !== mission.id) {
        snap.missionId          = mission.id
        snap.loadNumber         = mission.loadNumber ?? null
        snap.currentDestination = mission.destination ?? existing.currentDestination
        snap.nextPlannedStop    = blankSnapshot(mission).nextPlannedStop || existing.nextPlannedStop
      }
      setSnap(snap)
      setMilesInput(snap.remainingMiles != null ? String(snap.remainingMiles) : '')
      setSpeedInput(String(snap.avgSpeedMph ?? DEFAULT_SPEED))
      lastLoggedMiles.current = snap.remainingMiles
    } else {
      const blank = blankSnapshot(mission, name)
      setSnap(blank)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist to localStorage + queue Supabase sync ─────────────────────────
  const persist = useCallback((s: NavSnapshot) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* ignore */ }

    // Debounce Supabase sync (1.5s after last change)
    if (syncTimer.current) clearTimeout(syncTimer.current)
    setSyncStatus('syncing')
    syncTimer.current = setTimeout(async () => {
      const status = await syncToSupabase(s)
      setSyncStatus(status)
      // Fade back to idle after 3s
      setTimeout(() => setSyncStatus('idle'), 3000)
    }, 1500)
  }, [])

  function schedule(s: NavSnapshot) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(s), 500)
  }

  // ── Generic field updater ─────────────────────────────────────────────────
  function updateField<K extends keyof NavSnapshot>(key: K, value: NavSnapshot[K]) {
    setSnap(prev => {
      if (!prev) return prev
      const updated: NavSnapshot = {
        ...prev,
        [key]:         value,
        updatedBy:     driverName || prev.updatedBy,
        updatedSource: prev.routeSource,
        lastUpdated:   new Date().toISOString(),
      }
      schedule(updated)
      return updated
    })
  }

  // ── Miles change: recalc + log timeline event ─────────────────────────────
  function handleMilesChange(raw: string) {
    setMilesInput(raw)
    const miles = parseFloat(raw)
    const valid = !isNaN(miles) && miles > 0
    setSnap(prev => {
      if (!prev) return prev
      const speed = prev.avgSpeedMph ?? DEFAULT_SPEED
      const updated: NavSnapshot = {
        ...prev,
        remainingMiles:     valid ? miles : null,
        estimatedDriveTime: valid ? calcDriveTime(miles, speed) : '—',
        eta:                valid ? calcEta(miles, speed) : null,
        updatedBy:          driverName || prev.updatedBy,
        updatedSource:      prev.routeSource,
        lastUpdated:        new Date().toISOString(),
      }
      schedule(updated)
      return updated
    })
  }

  // Log timeline event on miles blur (only if value actually changed)
  function handleMilesBlur() {
    const miles = parseFloat(milesInput)
    if (!isNaN(miles) && miles > 0 && miles !== lastLoggedMiles.current) {
      logNavEvent(miles, driverName)
      lastLoggedMiles.current = miles
    }
  }

  // ── Speed change ──────────────────────────────────────────────────────────
  function commitSpeed(raw: string) {
    const parsed = parseInt(raw, 10)
    const speed  = isNaN(parsed) ? DEFAULT_SPEED : Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed))
    setSpeedInput(String(speed))
    setEditingSpeed(false)
    setSnap(prev => {
      if (!prev) return prev
      const miles = prev.remainingMiles
      const updated: NavSnapshot = {
        ...prev,
        avgSpeedMph:        speed,
        estimatedDriveTime: miles ? calcDriveTime(miles, speed) : '—',
        eta:                miles ? calcEta(miles, speed) : null,
        updatedBy:          driverName || prev.updatedBy,
        lastUpdated:        new Date().toISOString(),
      }
      persist(updated)
      return updated
    })
  }

  function nudgeSpeed(delta: number) {
    const cur   = parseInt(speedInput, 10) || DEFAULT_SPEED
    const next  = Math.min(MAX_SPEED, Math.max(MIN_SPEED, cur + delta))
    setSpeedInput(String(next))
    commitSpeed(String(next))
  }

  // ── Source change ─────────────────────────────────────────────────────────
  function handleSourceChange(src: RouteSourceType) {
    updateField('routeSource', src)
    if (src === 'truckers_path') {
      setShowNotes(true)
      setTimeout(() => notesRef.current?.focus(), 80)
    }
  }

  // ── Tap ETA tile to recalc from now ──────────────────────────────────────
  function recalcEta() {
    if (!snap?.remainingMiles) return
    const speed = snap.avgSpeedMph ?? DEFAULT_SPEED
    setSnap(prev => {
      if (!prev) return prev
      const updated: NavSnapshot = {
        ...prev,
        estimatedDriveTime: calcDriveTime(prev.remainingMiles, speed),
        eta:                calcEta(prev.remainingMiles, speed),
        updatedBy:          driverName || prev.updatedBy,
        lastUpdated:        new Date().toISOString(),
      }
      persist(updated)
      return updated
    })
  }

  if (!snap) return null

  const hasLoad  = !!snap.currentDestination
  const hasMiles = snap.remainingMiles != null && snap.remainingMiles > 0
  const speed    = snap.avgSpeedMph ?? DEFAULT_SPEED

  // Sync badge
  const syncBadge = syncStatus === 'syncing'   ? { text: '⟳ syncing',    color: 'var(--muted)' }
                  : syncStatus === 'synced'     ? { text: '☁️ synced',    color: 'var(--success)' }
                  : syncStatus === 'local_only' ? { text: '💾 local',     color: 'var(--warn)' }
                  : null

  return (
    <div className="cc-card" style={{ position: 'relative' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: '1rem' }}>🗺 Navigation</span>
          {syncBadge && (
            <span style={{ fontSize: '.58rem', fontWeight: 800, color: syncBadge.color }}>
              {syncBadge.text}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Destination</div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {snap.currentDestination}
            </div>
            {snap.destinationAddress && (
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snap.destinationAddress}</div>
            )}
          </div>
          {snap.loadNumber && (
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
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

      {/* ── Miles · Drive Time · ETA strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem', marginBottom: '.65rem' }}>

        {/* Remaining miles — editable */}
        <div style={{ background: 'var(--surface-2)', border: `1px solid ${hasMiles ? 'rgba(0,232,176,.25)' : 'var(--border)'}`, borderRadius: 10, padding: '.5rem .65rem' }}>
          <div style={{ fontSize: '.52rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Remaining</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <input
              type="text"
              inputMode="numeric"
              value={milesInput}
              onChange={e => handleMilesChange(e.target.value)}
              onBlur={handleMilesBlur}
              placeholder="0"
              style={{
                width: '100%', background: 'none', border: 'none', outline: 'none',
                fontWeight: 900, fontSize: '1.25rem',
                color: hasMiles ? 'var(--text)' : 'var(--muted)',
                fontVariantNumeric: 'tabular-nums', padding: 0,
              }}
            />
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>mi</span>
          </div>
        </div>

        {/* Derived drive time */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.5rem .65rem' }}>
          <div style={{ fontSize: '.52rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Drive Time</div>
          <div style={{ fontWeight: 900, fontSize: '1.25rem', color: hasMiles ? 'var(--text)' : 'var(--faint)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {snap.estimatedDriveTime}
          </div>
        </div>

        {/* ETA — tap to refresh */}
        <div
          onClick={hasMiles ? recalcEta : undefined}
          title={hasMiles ? 'Tap to refresh ETA from now' : undefined}
          style={{
            background: hasMiles ? 'rgba(0,232,176,.07)' : 'var(--surface-2)',
            border: `1px solid ${hasMiles ? 'rgba(0,232,176,.2)' : 'var(--border)'}`,
            borderRadius: 10, padding: '.5rem .65rem',
            cursor: hasMiles ? 'pointer' : 'default',
          }}
        >
          <div style={{ fontSize: '.52rem', fontWeight: 800, color: hasMiles ? 'var(--primary)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>ETA</div>
          <div style={{ fontWeight: 900, fontSize: '1.25rem', color: hasMiles ? 'var(--primary)' : 'var(--faint)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {fmtEta(snap.eta)}
          </div>
        </div>
      </div>

      {/* ── Next planned stop ── */}
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
      <div style={{ display: 'flex', gap: 5, marginBottom: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: '.52rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Source:</div>
        {([
          ['manual',        '✏️ Manual'],
          ['truckers_path', '🚛 Truckers Path'],
          ['google_maps',   '🗺 Google Maps'],
        ] as [RouteSourceType, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => handleSourceChange(id)}
            style={{
              padding: '.25rem .6rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 700, cursor: 'pointer',
              border:     snap.routeSource === id ? '1px solid rgba(0,232,176,.4)' : '1px solid var(--border)',
              background: snap.routeSource === id ? 'rgba(0,232,176,.1)'           : 'var(--surface-2)',
              color:      snap.routeSource === id ? 'var(--primary)'               : 'var(--muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Route notes toggle ── */}
      <button
        onClick={() => { setShowNotes(v => !v); if (!showNotes) setTimeout(() => notesRef.current?.focus(), 80) }}
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
        <span>
          {snap.manualRouteNotes
            ? `Route Notes (${snap.manualRouteNotes.length} chars)`
            : 'Paste Route Notes / Truckers Path Import'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '.65rem' }}>{showNotes ? '▲' : '▼'}</span>
      </button>

      {showNotes && (
        <div style={{ marginTop: '.35rem' }}>
          <textarea
            ref={notesRef}
            value={snap.manualRouteNotes}
            onChange={e => updateField('manualRouteNotes', e.target.value)}
            placeholder={`Paste route notes — Truckers Path, Google Maps directions, dispatcher notes, weigh station alerts, road conditions...\n\nThis will NOT overwrite your trip plan.`}
            rows={5}
            style={{
              width: '100%', padding: '.65rem .85rem', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', lineHeight: 1.55,
              resize: 'vertical', boxSizing: 'border-box', marginBottom: '.3rem',
            }}
          />
          <div style={{ fontSize: '.6rem', color: 'var(--faint)', fontStyle: 'italic' }}>
            ✅ Saved separately — your trip plan is not affected.
          </div>
        </div>
      )}

      {/* ── Expanded: address + future API notice ── */}
      {expanded && (
        <div style={{ marginTop: '.75rem', borderTop: '1px solid var(--border)', paddingTop: '.75rem', display: 'grid', gap: '.55rem' }}>
          <div>
            <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>Delivery Address</div>
            <input
              value={snap.destinationAddress}
              onChange={e => updateField('destinationAddress', e.target.value)}
              placeholder="Full street address (optional)"
              style={{ width: '100%', padding: '.45rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ padding: '.6rem .85rem', background: 'rgba(74,196,255,.04)', border: '1px solid rgba(74,196,255,.15)', borderRadius: 10 }}>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--blue, #4ac4ff)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>🔌 Routing API — Coming Soon</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              When connected: <span style={{ color: 'var(--text)', fontWeight: 600 }}>Turn-by-turn · Current road · Off-route detection · Live ETA · Auto re-route</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', marginTop: '.5rem' }}>
              {['Next Turn', 'Dist. to Turn', 'Current Road', 'Off-Route'].map(f => (
                <div key={f} style={{ padding: '.3rem .55rem', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.62rem', color: 'var(--faint)', fontWeight: 700 }}>
                  {f}: <span style={{ fontStyle: 'italic' }}>—</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer: avg speed (editable) + attribution + timestamp ── */}
      <div style={{ marginTop: '.65rem', paddingTop: '.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>

        {/* Speed control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '.58rem', color: 'var(--faint)', fontWeight: 600 }}>Avg:</span>
          {editingSpeed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <button onClick={() => nudgeSpeed(-5)}
                style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: '.7rem', cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1 }}>
                −
              </button>
              <input
                ref={speedRef}
                type="text"
                inputMode="numeric"
                value={speedInput}
                onChange={e => setSpeedInput(e.target.value)}
                onBlur={() => commitSpeed(speedInput)}
                onKeyDown={e => { if (e.key === 'Enter') commitSpeed(speedInput); if (e.key === 'Escape') { setEditingSpeed(false); setSpeedInput(String(speed)) } }}
                style={{
                  width: 36, textAlign: 'center', padding: '.15rem .2rem',
                  borderRadius: 5, border: '1px solid var(--primary)',
                  background: 'var(--surface-2)', color: 'var(--text)',
                  fontSize: '.75rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                }}
              />
              <button onClick={() => nudgeSpeed(5)}
                style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: '.7rem', cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1 }}>
                +
              </button>
              <span style={{ fontSize: '.58rem', color: 'var(--faint)' }}>mph</span>
            </div>
          ) : (
            <button
              onClick={() => { setEditingSpeed(true); setTimeout(() => { speedRef.current?.select() }, 50) }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '.1rem .4rem', fontSize: '.72rem', fontWeight: 800, color: 'var(--text)', cursor: 'pointer', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              {speed} mph <span style={{ fontSize: '.55rem', color: 'var(--muted)' }}>✏</span>
            </button>
          )}
        </div>

        {/* Attribution + timestamp */}
        <div style={{ textAlign: 'right' }}>
          {snap.updatedBy && (
            <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 600, lineHeight: 1.3 }}>
              Updated by: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{snap.updatedBy}</span>
              {' · '}
              <span style={{ textTransform: 'capitalize' }}>{snap.updatedSource ?? 'Manual'}</span>
            </div>
          )}
          <div style={{ fontSize: '.56rem', color: 'var(--faint)' }}>
            {fmtTime(snap.lastUpdated)}
          </div>
        </div>
      </div>
    </div>
  )
}
