'use client'
/**
 * /maintenance — Tractor PM Scheduler + Maintenance Command
 *
 * Sections:
 *  1. Active PM alerts (overdue + due soon) — per tractor
 *  2. PM Planning grid (progress bars, schedule actions)
 *  3. Nearest Love's / Speedco locations
 *  4. Per-tractor service history
 *  5. Odometer / engine hours update form
 *
 * Data layer: maintenanceEngine.ts (localStorage + Supabase write-through)
 */
import { useState, useEffect, useCallback } from 'react'
import {
  getTractorMaintenance,
  getTractorRecord,
  getActivePMTasks,
  detectDuePMs,
  findServiceLocations,
  getNearestServiceLocation,
  saveTractorMaintenance,
  syncPMTasks,
  PM_CONFIG,
  pmStatusColor,
  pmStatusLabel,
  formatMilesUntil,
  getMaintenanceContext,
  type TractorMaintenance,
  type PMTask,
  type ServiceLocation,
  type PMSchedule,
} from '@/lib/maintenanceEngine'
import PMSchedulerSheet  from '@/components/maintenance/PMSchedulerSheet'
import PMStatusCard      from '@/components/maintenance/PMStatusCard'
import ServiceHistoryPanel from '@/components/maintenance/ServiceHistoryPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d    = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30)  return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const BRAND_META: Record<string, { emoji: string; color: string }> = {
  loves:     { emoji: '❤️', color: '#e8003d' },
  speedco:   { emoji: '🔩', color: 'var(--primary)' },
  petro:     { emoji: '⛽', color: '#ff8c00' },
  ta:        { emoji: '🏁', color: '#60c8ff' },
  pilot:     { emoji: '✈️', color: '#6060ff' },
  flying_j:  { emoji: '🦅', color: '#ffb800' },
  other:     { emoji: '🔧', color: 'var(--muted)' },
}

// ── Odometer update sheet ─────────────────────────────────────────────────────

function OdometerSheet({
  open, initial, truckNumber, onClose, onSaved,
}: {
  open:        boolean
  initial?:    TractorMaintenance
  truckNumber: string
  onClose:     () => void
  onSaved:     () => void
}) {
  const [truckNum,  setTruckNum]  = useState('')
  const [make,      setMake]      = useState('')
  const [model,     setModel]     = useState('')
  const [year,      setYear]      = useState('')
  const [odo,       setOdo]       = useState('')
  const [hours,     setHours]     = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  useEffect(() => {
    if (!open) return
    setTruckNum(initial?.truckNumber ?? truckNumber)
    setMake(initial?.make  ?? '')
    setModel(initial?.model ?? '')
    setYear(initial?.year  ?? '')
    setOdo(initial?.currentOdometer ? String(initial.currentOdometer) : '')
    setHours(initial?.engineHours  ? String(initial.engineHours)  : '')
    setNotes(initial?.notes ?? '')
    setSaved(false); setSaving(false)
  }, [open, initial, truckNumber])

  if (!open) return null

  async function handleSave() {
    if (!truckNum.trim() || !odo || saving) return
    setSaving(true)
    try {
      await saveTractorMaintenance({
        truckNumber:     truckNum.trim(),
        make:            make  || undefined,
        model:           model || undefined,
        year:            year  || undefined,
        currentOdometer: parseInt(odo, 10),
        engineHours:     hours ? parseFloat(hours) : undefined,
        notes:           notes || undefined,
        pmHistory:       initial?.pmHistory ?? [],
      })
      syncPMTasks(truckNum.trim())
      setSaved(true)
      onSaved()
      setTimeout(() => { onClose(); setSaved(false) }, 800)
    } catch { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 330, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 331, background: 'var(--surface)', borderRadius: '20px 20px 0 0', maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '.65rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🚛 Tractor Profile</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
            Update odometer + engine hours to trigger PM detection
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Truck #', val: truckNum, set: setTruckNum, ph: 'T-204',    type: 'text' },
              { label: 'Year',    val: year,     set: setYear,     ph: '2020',     type: 'text' },
              { label: 'Make',    val: make,     set: setMake,     ph: 'Kenworth', type: 'text' },
              { label: 'Model',   val: model,    set: setModel,    ph: 'T680',     type: 'text' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>{f.label}</div>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type}
                  style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Odometer (miles) *</div>
              <input type="number" inputMode="numeric" value={odo} onChange={e => setOdo(e.target.value)} placeholder="425000"
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: `1px solid ${!odo ? 'var(--error)' : 'var(--border)'}`, background: 'var(--surface)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Engine Hours</div>
              <input type="number" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} placeholder="14200"
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
            style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          <button onClick={handleSave} disabled={!truckNum.trim() || !odo || saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : (!truckNum.trim() || !odo) ? 'var(--surface-2)' : 'var(--primary)',
            color: saved ? '#000' : (!truckNum.trim() || !odo) ? 'var(--muted)' : '#000',
            fontWeight: 900, fontSize: '1rem',
            cursor: (!truckNum.trim() || !odo || saving || saved) ? 'default' : 'pointer',
          }}>
            {saved ? '✅ Saved' : saving ? 'Saving…' : '💾 Save + Sync PM Tasks'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const [tractors,         setTractors]         = useState<TractorMaintenance[]>([])
  const [activeTasks,      setActiveTasks]      = useState<PMTask[]>([])
  const [locations,        setLocations]        = useState<ServiceLocation[]>([])
  const [nearestLoc,       setNearestLoc]       = useState<ServiceLocation | null>(null)
  const [gpsLat,           setGpsLat]           = useState<number | null>(null)
  const [gpsLng,           setGpsLng]           = useState<number | null>(null)
  const [activeTruck,      setActiveTruck]      = useState('')

  const [showScheduler,    setShowScheduler]    = useState(false)
  const [showOdometer,     setShowOdometer]     = useState(false)
  const [schedulerTask,    setSchedulerTask]    = useState<PMTask | null>(null)
  const [expandHistory,    setExpandHistory]    = useState(false)
  const [loadingLocs,      setLoadingLocs]      = useState(false)

  const load = useCallback(() => {
    const all = getTractorMaintenance()
    const ctx = getMaintenanceContext()
    const tn  = ctx.truckNumber || (all[0]?.truckNumber ?? '')
    setTractors(all)
    setActiveTruck(tn)
    setActiveTasks(getActivePMTasks(tn || undefined))
  }, [])

  const loadLocations = useCallback(async (lat: number, lng: number) => {
    setLoadingLocs(true)
    try {
      const locs = await findServiceLocations(lat, lng, 250)
      setLocations(locs.slice(0, 8))
      setNearestLoc(locs[0] ?? null)
    } catch { /* silent */ }
    setLoadingLocs(false)
  }, [])

  useEffect(() => {
    load()
    // GPS for nearest location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        setGpsLat(pos.coords.latitude)
        setGpsLng(pos.coords.longitude)
        loadLocations(pos.coords.latitude, pos.coords.longitude)
      }, () => {
        // fallback: load mock without real coords
        loadLocations(40.0, -112.0)
      })
    } else {
      loadLocations(40.0, -112.0)
    }
  }, [load, loadLocations])

  const activeTractor = tractors.find(t => t.truckNumber === activeTruck)
  const duePMs        = activeTractor ? detectDuePMs(activeTractor, { includeAll: false }) : []

  function openScheduler(task: PMTask) {
    setSchedulerTask(task)
    setShowScheduler(true)
  }

  function handleSchedulerSaved(_s: PMSchedule) {
    load()
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 120 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg,rgba(6,18,16,.98) 0%,var(--surface) 100%)',
        borderBottom: '1px solid var(--border)',
        padding: '1rem 1.1rem .85rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-.01em' }}>
              🔧 Maintenance Command
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              PM Scheduler · Love&apos;s / Speedco · Service History
            </div>
          </div>
          <button
            onClick={() => setShowOdometer(true)}
            style={{
              padding: '.4rem .75rem', borderRadius: 20, fontSize: '.72rem', fontWeight: 700,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            + Tractor
          </button>
        </div>

        {/* Active tractor selector */}
        {tractors.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {tractors.map(t => (
              <button
                key={t.truckNumber}
                onClick={() => {
                  setActiveTruck(t.truckNumber)
                  setActiveTasks(getActivePMTasks(t.truckNumber))
                }}
                style={{
                  padding: '.35rem .75rem', borderRadius: 20, fontSize: '.78rem', fontWeight: 700,
                  border: `1.5px solid ${t.truckNumber === activeTruck ? 'var(--primary)' : 'var(--border)'}`,
                  background: t.truckNumber === activeTruck ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                  color: t.truckNumber === activeTruck ? 'var(--primary)' : 'var(--text)',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                🚛 {t.truckNumber}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Empty state */}
        {tractors.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: '2.5rem' }}>🔧</span>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>
              No Tractors Configured
            </div>
            <div style={{ fontSize: '.82rem' }}>
              Add a tractor with its current odometer to start PM tracking.
            </div>
            <button
              onClick={() => setShowOdometer(true)}
              style={{
                padding: '.65rem 1.5rem', borderRadius: 12, border: 'none',
                background: 'var(--primary)', color: '#000', fontWeight: 900, fontSize: '.9rem', cursor: 'pointer',
              }}
            >
              + Add Tractor
            </button>
          </div>
        )}

        {/* PM Alerts — active tasks */}
        {activeTasks.length > 0 && (
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              PM Alerts — {activeTruck}
            </div>
            <PMStatusCard
              tasks={activeTasks}
              nearestLocation={nearestLoc}
              truckNumber={activeTruck}
              onSchedule={openScheduler}
            />
          </div>
        )}

        {/* PM Planning grid */}
        {activeTractor && duePMs.length > 0 && (
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              PM Planning
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {duePMs.map(trigger => {
                const cfg = PM_CONFIG[trigger.pmType]
                const sc  = pmStatusColor(trigger.status)
                const pct = Math.max(0, Math.min(100,
                  ((cfg.miles - trigger.milesUntilDue) / cfg.miles) * 100,
                ))
                const task = activeTasks.find(t => t.pmType === trigger.pmType)
                return (
                  <div key={trigger.pmType} style={{
                    background: 'var(--surface-2)', borderRadius: 12, padding: '.75rem .9rem',
                    borderLeft: `4px solid ${sc}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: '1rem' }}>{cfg.emoji}</span>
                        <span style={{ fontWeight: 800, fontSize: '.88rem' }}>{cfg.label}</span>
                        <span style={{
                          fontSize: '.6rem', fontWeight: 800, color: sc,
                          background: `${sc}18`, padding: '1px 8px', borderRadius: 20,
                          border: `1px solid ${sc}30`,
                        }}>
                          {pmStatusLabel(trigger.status)}
                        </span>
                      </div>
                      <span style={{ fontSize: '.82rem', fontWeight: 800, color: sc }}>
                        {trigger.milesUntilDue < 0 ? '−' : ''}{formatMilesUntil(Math.abs(trigger.milesUntilDue))}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 5, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: sc, borderRadius: 4, transition: 'width .4s' }} />
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: '.68rem', color: 'var(--muted)', flex: 1 }}>
                        {cfg.description}
                        {trigger.daysUntilDue !== undefined && (
                          <span style={{ color: trigger.daysUntilDue < 0 ? 'var(--error)' : 'var(--muted)', marginLeft: 6 }}>
                            · {trigger.daysUntilDue < 0 ? `${Math.abs(trigger.daysUntilDue)}d overdue` : `${trigger.daysUntilDue}d`}
                          </span>
                        )}
                      </span>
                      {task && (
                        <button
                          onClick={() => openScheduler(task)}
                          style={{
                            padding: '.25rem .65rem', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${sc}50`, background: `${sc}10`, color: sc,
                            fontWeight: 700, fontSize: '.68rem', flexShrink: 0,
                          }}
                        >
                          📅 Schedule
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* No PMs due */}
        {activeTractor && duePMs.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(0,232,176,.06)', border: '1.5px solid rgba(0,232,176,.2)',
            borderRadius: 12, padding: '.75rem 1rem',
          }}>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.85rem', color: 'var(--primary)' }}>All PMs Current</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>
                Tractor {activeTruck} · {activeTractor.currentOdometer.toLocaleString()} mi
              </div>
            </div>
            <button
              onClick={() => {
                setShowOdometer(true)
              }}
              style={{
                marginLeft: 'auto', padding: '.3rem .65rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'none',
                color: 'var(--muted)', fontSize: '.72rem', cursor: 'pointer',
              }}
            >
              Update
            </button>
          </div>
        )}

        {/* Dispatch PM planning summary */}
        {activeTractor && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '.8rem 1rem' }}>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Dispatch Window
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '.6rem .75rem' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>TRACTOR</div>
                <div style={{ fontWeight: 900, fontSize: '.9rem' }}>{activeTruck || '—'}</div>
              </div>
              <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '.6rem .75rem' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>ODOMETER</div>
                <div style={{ fontWeight: 900, fontSize: '.9rem' }}>
                  {activeTractor.currentOdometer.toLocaleString()} mi
                </div>
              </div>
              <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '.6rem .75rem' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>PM STATUS</div>
                <div style={{ fontWeight: 800, fontSize: '.82rem', color: activeTasks.length > 0 ? 'var(--warn)' : 'var(--success)' }}>
                  {activeTasks.length > 0
                    ? `${activeTasks.length} PM${activeTasks.length > 1 ? 's' : ''} due`
                    : 'All current'}
                </div>
              </div>
              <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '.6rem .75rem' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>BEST WINDOW</div>
                <div style={{ fontWeight: 700, fontSize: '.75rem', color: 'var(--text)' }}>
                  {activeTasks.length > 0
                    ? 'After delivery / reset'
                    : 'On schedule'}
                </div>
              </div>
            </div>
            {activeTasks.length > 0 && nearestLoc && (
              <div style={{ marginTop: 8, fontSize: '.72rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📍</span>
                <span>
                  Route match: {nearestLoc.name.replace("Love's Travel Stop", "Love's")} —{' '}
                  {nearestLoc.city}, {nearestLoc.state} ({Math.round(nearestLoc.distanceMiles ?? 0)} mi)
                  {nearestLoc.hasSpeedco && ' · Speedco available'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Love's / Speedco locations */}
        <div>
          <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            {gpsLat ? 'Nearby Service Centers' : 'Service Centers (I-80 Corridor)'}
          </div>
          {loadingLocs && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '.82rem' }}>
              🔍 Finding locations…
            </div>
          )}
          {!loadingLocs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {locations.map(loc => {
                const bm = BRAND_META[loc.brand] ?? BRAND_META.other
                return (
                  <div key={loc.id} style={{
                    background: 'var(--surface-2)', borderRadius: 12, padding: '.7rem .9rem',
                    borderLeft: `3px solid ${bm.color}`,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{bm.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ fontWeight: 800, fontSize: '.85rem' }}>
                          {loc.city}, {loc.state}
                        </div>
                        <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                          {Math.round(loc.distanceMiles ?? 0)} mi
                        </span>
                      </div>
                      <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                        {loc.name.replace("Love's Travel Stop", "Love's").replace(' Travel Center', '')}
                        {loc.hours && <span> · {loc.hours}</span>}
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {loc.hasSpeedco && (
                          <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', background: 'rgba(0,232,176,.1)', padding: '1px 7px', borderRadius: 20 }}>
                            🔩 Speedco
                          </span>
                        )}
                        {loc.services.slice(0, 3).map(s => (
                          <span key={s} style={{ fontSize: '.6rem', color: 'var(--muted)', padding: '1px 7px', borderRadius: 20, border: '1px solid var(--border)' }}>
                            {s}
                          </span>
                        ))}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(`${loc.address}, ${loc.city}, ${loc.state}`)}&navigate=yes`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '.28rem .65rem', borderRadius: 7, textDecoration: 'none',
                            border: '1px solid var(--border)', background: 'var(--surface)',
                            color: 'var(--text)', fontSize: '.7rem', fontWeight: 700,
                          }}
                        >
                          🗺️ Navigate
                        </a>
                        {loc.phone && (
                          <a
                            href={`tel:${loc.phone.replace(/\D/g, '')}`}
                            style={{
                              padding: '.28rem .65rem', borderRadius: 7, textDecoration: 'none',
                              border: '1px solid var(--border)', background: 'var(--surface)',
                              color: 'var(--text)', fontSize: '.7rem', fontWeight: 700,
                            }}
                          >
                            📞 Call
                          </a>
                        )}
                        {activeTasks.length > 0 && activeTasks[0] && (
                          <button
                            onClick={() => openScheduler(activeTasks[0])}
                            style={{
                              padding: '.28rem .65rem', borderRadius: 7,
                              border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.07)',
                              color: 'var(--primary)', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            📅 Schedule PM
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Service history */}
        {activeTractor && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Service History — {activeTruck}
              </div>
              <button
                onClick={() => setExpandHistory(p => !p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}
              >
                {expandHistory ? 'Less ↑' : 'All →'}
              </button>
            </div>
            <ServiceHistoryPanel
              tractor={activeTractor}
              limit={expandHistory ? 999 : 5}
              showAll={expandHistory}
            />

            {/* Edit tractor button */}
            <button
              onClick={() => setShowOdometer(true)}
              style={{
                marginTop: 10, width: '100%', padding: '.55rem', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--muted)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer',
              }}
            >
              ✏️ Update Odometer / Engine Hours
            </button>
          </div>
        )}

      </div>

      {/* Sheets */}
      <PMSchedulerSheet
        open={showScheduler}
        onClose={() => setShowScheduler(false)}
        onSaved={handleSchedulerSaved}
        task={schedulerTask}
        truckNumber={activeTruck}
        currentLat={gpsLat ?? undefined}
        currentLng={gpsLng ?? undefined}
      />
      <OdometerSheet
        open={showOdometer}
        initial={activeTractor}
        truckNumber={activeTruck}
        onClose={() => setShowOdometer(false)}
        onSaved={load}
      />
    </div>
  )
}
