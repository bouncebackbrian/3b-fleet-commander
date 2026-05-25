'use client'
/**
 * PMSchedulerSheet — Full scheduling bottom sheet.
 *
 * Flow:
 *   1. Shows PM details + services list
 *   2. Fetches nearby Love's / Speedco locations
 *   3. Driver selects location → Schedule / Call / Navigate / Defer
 *   4. Mark Completed + Upload Receipt
 *   5. On save → writes PMSchedule + updates PMTask
 */
import { useState, useEffect, useCallback } from 'react'
import {
  PM_CONFIG,
  findServiceLocations,
  savePMSchedule,
  upsertPMTask,
  logPMCompletion,
  pmStatusColor,
  formatMilesUntil,
  type PMTask,
  type PMSchedule,
  type ServiceLocation,
} from '@/lib/maintenanceEngine'

// ── Map link helpers ──────────────────────────────────────────────────────────

function buildGoogleMapsUrl(loc: ServiceLocation): string {
  const q = encodeURIComponent(`${loc.address}, ${loc.city}, ${loc.state}`)
  return `https://maps.google.com/?q=${q}&navigate=yes`
}

function buildAppleMapsUrl(loc: ServiceLocation): string {
  const q = encodeURIComponent(`${loc.address}, ${loc.city}, ${loc.state}`)
  return `https://maps.apple.com/?q=${q}`
}

function buildPhoneUrl(phone?: string): string {
  return `tel:${(phone ?? '').replace(/\D/g, '')}`
}

// ── Location card ─────────────────────────────────────────────────────────────

const BRAND_META: Record<string, { emoji: string; shortName: string }> = {
  loves:     { emoji: '❤️', shortName: "Love's" },
  speedco:   { emoji: '🔩', shortName: 'Speedco' },
  petro:     { emoji: '⛽', shortName: 'Petro'   },
  ta:        { emoji: '🏁', shortName: 'TA'      },
  pilot:     { emoji: '✈️', shortName: 'Pilot'   },
  flying_j:  { emoji: '🦅', shortName: 'Flying J'},
  other:     { emoji: '🔧', shortName: 'Service' },
}

function LocationCard({
  loc, selected, onSelect,
}: { loc: ServiceLocation; selected: boolean; onSelect: () => void }) {
  const brand = BRAND_META[loc.brand] ?? BRAND_META.other

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%', textAlign: 'left', padding: '.75rem .9rem', borderRadius: 12,
        border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: selected ? 'rgba(0,232,176,.06)' : 'var(--surface-2)',
        cursor: 'pointer', transition: 'all .12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: 1 }}>{brand.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: '.85rem' }}>
              {brand.shortName} — {loc.city}, {loc.state}
            </div>
            <span style={{
              fontSize: '.75rem', fontWeight: 900,
              color: selected ? 'var(--primary)' : 'var(--muted)',
              flexShrink: 0,
            }}>
              {Math.round(loc.distanceMiles ?? 0)} mi
            </span>
          </div>
          <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
            {loc.address}
          </div>
          <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {loc.hasSpeedco && (
              <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', background: 'rgba(0,232,176,.1)', padding: '1px 7px', borderRadius: 20 }}>
                🔩 Speedco
              </span>
            )}
            {loc.hours && (
              <span style={{ fontSize: '.6rem', color: 'var(--muted)', padding: '1px 7px', borderRadius: 20, border: '1px solid var(--border)' }}>
                🕐 {loc.hours}
              </span>
            )}
            {loc.services.slice(0, 3).map(s => (
              <span key={s} style={{ fontSize: '.6rem', color: 'var(--muted)', padding: '1px 7px', borderRadius: 20, border: '1px solid var(--border)' }}>
                {s}
              </span>
            ))}
          </div>
        </div>
        {selected && (
          <span style={{ fontSize: '1rem', flexShrink: 0, color: 'var(--primary)' }}>✓</span>
        )}
      </div>
    </button>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean
  onClose:        () => void
  onSaved?:       (schedule: PMSchedule) => void
  task:           PMTask | null
  truckNumber?:   string
  currentLat?:    number
  currentLng?:    number
}

type SheetTab = 'details' | 'locations' | 'complete'

// ── Component ─────────────────────────────────────────────────────────────────

export default function PMSchedulerSheet({
  open, onClose, onSaved, task, truckNumber, currentLat, currentLng,
}: Props) {
  const [tab,           setTab]           = useState<SheetTab>('details')
  const [locations,     setLocations]     = useState<ServiceLocation[]>([])
  const [selectedLoc,   setSelectedLoc]   = useState<ServiceLocation | null>(null)
  const [loadingLocs,   setLoadingLocs]   = useState(false)
  const [scheduleNote,  setScheduleNote]  = useState('')
  const [completedOdo,  setCompletedOdo]  = useState('')
  const [completedDate, setCompletedDate] = useState('')
  const [cost,          setCost]          = useState('')
  const [techName,      setTechName]      = useState('')
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)

  const loadLocations = useCallback(async () => {
    if (!currentLat || !currentLng) return
    setLoadingLocs(true)
    try {
      const locs = await findServiceLocations(currentLat, currentLng, 250)
      setLocations(locs)
      if (locs.length > 0) setSelectedLoc(locs[0])
    } catch { /* silent */ }
    setLoadingLocs(false)
  }, [currentLat, currentLng])

  useEffect(() => {
    if (!open) return
    setTab('details')
    setSelectedLoc(null)
    setScheduleNote('')
    setCompletedOdo('')
    setCompletedDate(new Date().toISOString().slice(0, 10))
    setCost('')
    setTechName('')
    setSaved(false)
    setSaving(false)
    loadLocations()
  }, [open, loadLocations])

  if (!open || !task) return null

  const cfg         = PM_CONFIG[task.pmType]
  const statusColor = pmStatusColor(task.status)

  async function handleSchedule() {
    if (!selectedLoc || saving || !task) return
    setSaving(true)
    try {
      const schedule = await savePMSchedule({
        pmTaskId:          task.id,
        truckNumber:       task.truckNumber,
        pmType:            task.pmType,
        serviceLocationId: selectedLoc.id,
        status:            'pending',
        notes:             scheduleNote || undefined,
      })
      setSaved(true)
      onSaved?.(schedule)
      setTimeout(() => { onClose(); setSaved(false) }, 900)
    } catch { setSaving(false) }
  }

  async function handleMarkComplete() {
    if (!completedDate || saving || !task) return
    setSaving(true)
    try {
      await logPMCompletion(task.truckNumber, task.pmType, {
        completedAt:     new Date(completedDate).toISOString(),
        odometerAt:      completedOdo ? parseInt(completedOdo, 10) : task.currentOdometer,
        serviceLocation: selectedLoc?.name,
        cost:            cost ? parseFloat(cost) : undefined,
        techName:        techName || undefined,
        notes:           scheduleNote || undefined,
      })
      await upsertPMTask({
        truckNumber:     task.truckNumber,
        pmType:          task.pmType,
        status:          'completed',
        currentOdometer: task.currentOdometer,
        milesUntilDue:   task.milesUntilDue,
        dueAtOdometer:   task.dueAtOdometer,
        dueByDate:       task.dueByDate,
        daysUntilDue:    task.daysUntilDue,
        completedAt:     new Date(completedDate).toISOString(),
        notes:           scheduleNote || task.notes,
      })
      setSaved(true)
      setTimeout(() => { onClose(); setSaved(false) }, 900)
    } catch { setSaving(false) }
  }

  async function handleDefer() {
    if (!task) return
    await upsertPMTask({
      truckNumber:     task.truckNumber,
      pmType:          task.pmType,
      status:          task.status,
      currentOdometer: task.currentOdometer,
      milesUntilDue:   task.milesUntilDue,
      dueAtOdometer:   task.dueAtOdometer,
      dueByDate:       task.dueByDate,
      daysUntilDue:    task.daysUntilDue,
      notes:           `Deferred: ${scheduleNote || 'No reason given'}`,
    })
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 321,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '94dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.65rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: '1.2rem' }}>{cfg.emoji}</span>
                <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>{cfg.label}</span>
                <span style={{
                  fontSize: '.62rem', fontWeight: 800,
                  color: statusColor, background: `${statusColor}18`,
                  padding: '2px 9px', borderRadius: 20, border: `1px solid ${statusColor}30`,
                }}>
                  {task.status === 'overdue' ? 'OVERDUE' : 'DUE SOON'}
                </span>
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3 }}>
                Tractor {task.truckNumber}
                {task.milesUntilDue < 0
                  ? <span style={{ color: 'var(--error)', marginLeft: 6, fontWeight: 700 }}>
                      {formatMilesUntil(Math.abs(task.milesUntilDue))} overdue
                    </span>
                  : <span style={{ marginLeft: 6 }}>
                      due in {formatMilesUntil(task.milesUntilDue)}
                    </span>
                }
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>

          {/* Tab nav */}
          <div style={{ display: 'flex', gap: 0, marginTop: 10, borderBottom: '1px solid var(--border)', marginLeft: -4 }}>
            {(['details', 'locations', 'complete'] as SheetTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '.4rem .75rem', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
                color: tab === t ? 'var(--primary)' : 'var(--muted)',
                fontWeight: tab === t ? 800 : 600, fontSize: '.75rem', textTransform: 'capitalize',
              }}>
                {t === 'details' ? 'PM Details' : t === 'locations' ? '📍 Locations' : '✅ Complete'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* ── Tab: Details ── */}
          {tab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '.75rem .9rem' }}>
                <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Services Performed
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {cfg.services.map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: '.75rem', color: 'var(--primary)' }}>✓</span>
                      <span style={{ fontSize: '.82rem', color: 'var(--text)' }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .75rem' }}>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>INTERVAL</div>
                  <div style={{ fontWeight: 900, fontSize: '.9rem' }}>{cfg.miles.toLocaleString()} mi</div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .75rem' }}>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>DUE IN</div>
                  <div style={{ fontWeight: 900, fontSize: '.9rem', color: statusColor }}>
                    {task.milesUntilDue < 0 ? 'OVERDUE' : formatMilesUntil(task.milesUntilDue)}
                  </div>
                </div>
                {task.daysUntilDue !== undefined && (
                  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .75rem' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>DAYS</div>
                    <div style={{ fontWeight: 900, fontSize: '.9rem', color: task.daysUntilDue < 0 ? 'var(--error)' : 'var(--text)' }}>
                      {task.daysUntilDue < 0 ? `${Math.abs(task.daysUntilDue)}d overdue` : `${task.daysUntilDue}d`}
                    </div>
                  </div>
                )}
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .75rem' }}>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>DUE AT</div>
                  <div style={{ fontWeight: 800, fontSize: '.85rem' }}>{task.dueAtOdometer?.toLocaleString()} mi</div>
                </div>
              </div>

              {/* Notes */}
              <input
                placeholder="Schedule note (optional)"
                value={scheduleNote}
                onChange={e => setScheduleNote(e.target.value)}
                style={{
                  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* ── Tab: Locations ── */}
          {tab === 'locations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!currentLat && !currentLng && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '.82rem' }}>
                  📍 Location not available — enable GPS to find nearby service centers
                </div>
              )}
              {loadingLocs && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '.85rem' }}>
                  🔍 Finding Love&apos;s / Speedco locations…
                </div>
              )}
              {!loadingLocs && locations.length === 0 && currentLat && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '.82rem' }}>
                  No service locations found within 250 miles
                </div>
              )}
              {!loadingLocs && locations.map(loc => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  selected={selectedLoc?.id === loc.id}
                  onSelect={() => setSelectedLoc(loc)}
                />
              ))}
              {selectedLoc && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <a
                    href={buildGoogleMapsUrl(selectedLoc)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1, padding: '.6rem', borderRadius: 10, textAlign: 'center',
                      border: '1px solid var(--border)', background: 'var(--surface-2)',
                      color: 'var(--text)', textDecoration: 'none', fontWeight: 700, fontSize: '.8rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                  >
                    🗺️ Navigate
                  </a>
                  {selectedLoc.phone && (
                    <a
                      href={buildPhoneUrl(selectedLoc.phone)}
                      style={{
                        flex: 1, padding: '.6rem', borderRadius: 10, textAlign: 'center',
                        border: '1px solid var(--border)', background: 'var(--surface-2)',
                        color: 'var(--text)', textDecoration: 'none', fontWeight: 700, fontSize: '.8rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      📞 Call
                    </a>
                  )}
                  <a
                    href={buildAppleMapsUrl(selectedLoc)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1, padding: '.6rem', borderRadius: 10, textAlign: 'center',
                      border: '1px solid var(--border)', background: 'var(--surface-2)',
                      color: 'var(--text)', textDecoration: 'none', fontWeight: 700, fontSize: '.8rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                  >
                    🍎 Apple Maps
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Complete ── */}
          {tab === 'complete' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 2 }}>
                Log this PM as completed and update tractor history.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Date Completed</div>
                  <input type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)}
                    style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Odometer at Service</div>
                  <input type="number" inputMode="numeric" placeholder={task.currentOdometer.toLocaleString()} value={completedOdo} onChange={e => setCompletedOdo(e.target.value)}
                    style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Cost ($)</div>
                  <input type="number" inputMode="decimal" placeholder="0.00" value={cost} onChange={e => setCost(e.target.value)}
                    style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Tech / Shop Name</div>
                  <input placeholder="Love's #634" value={techName} onChange={e => setTechName(e.target.value)}
                    style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <input placeholder="Notes (optional)" value={scheduleNote} onChange={e => setScheduleNote(e.target.value)}
                style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,232,176,.06)', border: '1px dashed rgba(0,232,176,.25)',
                borderRadius: 10, padding: '.6rem .8rem',
              }}>
                <span style={{ fontSize: '1rem' }}>📷</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--primary)' }}>Upload Receipt</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>Add to Vault after saving</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tab === 'details' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => setTab('locations')}
                style={{
                  padding: '.85rem', borderRadius: 12, border: 'none',
                  background: 'rgba(0,232,176,.15)', color: 'var(--primary)',
                  fontWeight: 900, fontSize: '.9rem', cursor: 'pointer',
                }}
              >
                📍 Find Location
              </button>
              <button
                onClick={() => setTab('complete')}
                style={{
                  padding: '.85rem', borderRadius: 12, border: 'none',
                  background: 'var(--surface-2)', color: 'var(--text)',
                  fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
                }}
              >
                ✅ Mark Completed
              </button>
            </div>
          )}

          {tab === 'locations' && selectedLoc && (
            <>
              <button
                onClick={handleSchedule}
                disabled={saving || saved}
                style={{
                  width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
                  background: saved ? 'var(--success)' : 'rgba(0,232,176,.15)',
                  color: saved ? '#000' : 'var(--primary)',
                  fontWeight: 900, fontSize: '1rem',
                  cursor: saving || saved ? 'default' : 'pointer',
                }}
              >
                {saved ? '✅ Scheduled' : saving ? 'Saving…' : `📅 Schedule at ${BRAND_META[selectedLoc.brand]?.shortName ?? 'Service'} — ${selectedLoc.city}`}
              </button>
              <button
                onClick={handleDefer}
                style={{
                  width: '100%', padding: '.65rem', borderRadius: 12, border: '1px solid var(--border)',
                  background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer',
                }}
              >
                ⏭ Defer for Now
              </button>
            </>
          )}

          {tab === 'complete' && (
            <button
              onClick={handleMarkComplete}
              disabled={!completedDate || saving || saved}
              style={{
                width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
                background: saved ? 'var(--success)' : !completedDate ? 'var(--surface-2)' : 'rgba(0,232,176,.15)',
                color: saved ? '#000' : !completedDate ? 'var(--muted)' : 'var(--primary)',
                fontWeight: 900, fontSize: '1rem',
                cursor: (!completedDate || saving || saved) ? 'default' : 'pointer',
              }}
            >
              {saved ? '✅ Logged' : saving ? 'Saving…' : '✅ Mark PM Completed'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
