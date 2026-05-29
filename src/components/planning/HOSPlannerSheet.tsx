'use client'
/**
 * HOSPlannerSheet — HOS-Centric Operational Planning
 *
 * Interactive HOS simulation for a proposed load.
 * Input: miles, current HOS, departure time.
 * Output: legal ETA, rest stop timeline, feasibility score, constraints.
 *
 * Also shows driver availability windows (home-time, preferred days)
 * if a driver profile exists.
 *
 * Can be mounted as an inline sheet or as a standalone card.
 */
import { useState, useEffect } from 'react'
import {
  type HOSSnapshot,
  type HOSETASimulation,
  type DriverProfile,
  type AvailabilityWindow,
  simulateHOSETA,
  scoreLoadFeasibility,
  getDriverAvailabilityWindows,
  readAvailabilityPrefs,
  saveAvailabilityPrefs,
  readDriverProfiles,
  feasibilityStatusLabel,
  feasibilityColor,
  homeTimeFreqLabel,
  saveHOSPlanResult,
  type HomeTimeFrequency,
  type DayOfWeek,
} from '@/lib/hosPlanning'

// ── Styles ────────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '.5rem .75rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box',
}
const label: React.CSSProperties = {
  display: 'block', fontSize: '.6rem', fontWeight: 800,
  color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4,
}

// ── Timeline event row ────────────────────────────────────────────────────────

function TimelineRow({ type, timeLabel, label: lbl, miles }: { type: string; timeLabel: string; label: string; miles?: number }) {
  const colors: Record<string, string> = {
    depart: 'var(--primary)', drive: 'var(--text)', break: 'var(--warn)',
    rest: '#a78bfa', arrive: 'var(--primary)',
  }
  const bullets: Record<string, string> = { depart: '🚛', drive: '🛣', break: '⏸', rest: '😴', arrive: '🏁' }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
        <span style={{ fontSize: '.85rem' }}>{bullets[type] ?? '·'}</span>
        <div style={{ width: 2, flex: 1, minHeight: 12, background: 'var(--border)', marginTop: 2 }} />
      </div>
      <div style={{ paddingBottom: '.5rem', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 1 }}>{timeLabel}</div>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: colors[type] ?? 'var(--text)' }}>{lbl}</div>
        {miles != null && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{miles.toFixed(0)} mi this segment</div>}
      </div>
    </div>
  )
}

// ── Availability window pill ──────────────────────────────────────────────────

function AvailPill({ window: w }: { window: AvailabilityWindow }) {
  const typeColors: Record<string, { color: string; bg: string; border: string }> = {
    home_time:         { color: 'var(--primary)', bg: 'rgba(0,232,176,.08)',  border: 'rgba(0,232,176,.25)' },
    home_window:       { color: '#38bdf8',        bg: 'rgba(56,189,248,.07)', border: 'rgba(56,189,248,.2)'  },
    preferred_off:     { color: 'var(--muted)',   bg: 'var(--surface-2)',     border: 'var(--border)'        },
    rest_required:     { color: 'var(--warn)',    bg: 'rgba(245,194,0,.07)',  border: 'rgba(245,194,0,.2)'   },
    available:         { color: 'var(--primary)', bg: 'rgba(0,232,176,.05)',  border: 'rgba(0,232,176,.15)'  },
  }
  const c = typeColors[w.type] ?? typeColors.available
  const fmt = (d: Date) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <div style={{ padding: '.5rem .7rem', borderRadius: 10, background: c.bg, border: `1px solid ${c.border}` }}>
      <div style={{ fontWeight: 800, fontSize: '.68rem', color: c.color, marginBottom: 2 }}>{w.label}</div>
      <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>
        {fmt(w.startAt)}{w.endAt ? ` → ${fmt(w.endAt)}` : ''}
      </div>
      <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{w.description}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  initialMiles?:     number
  loadNumber?:       string
  onSave?:           (sim: HOSETASimulation) => void
}

export default function HOSPlannerSheet({ initialMiles, loadNumber, onSave }: Props) {
  // Form state
  const [miles,      setMiles]      = useState(initialMiles?.toString() ?? '')
  const [driveRem,   setDriveRem]   = useState('')
  const [shiftRem,   setShiftRem]   = useState('')
  const [cycleRem,   setCycleRem]   = useState('')
  const [breakDueIn, setBreakDueIn] = useState('')
  const [avgMph,     setAvgMph]     = useState('55')
  const [sim,        setSim]        = useState<HOSETASimulation | null>(null)
  const [saved,      setSaved]      = useState(false)
  // Availability
  const [profile,    setProfile]    = useState<DriverProfile | null>(null)
  const [windows,    setWindows]    = useState<AvailabilityWindow[]>([])
  const [showAvail,  setShowAvail]  = useState(false)
  // Profile setup
  const [showSetup,  setShowSetup]  = useState(false)
  const [setupCity,  setSetupCity]  = useState('')
  const [setupState, setSetupState] = useState('')
  const [setupFreq,  setSetupFreq]  = useState<HomeTimeFrequency>('weekly')
  const [setupDays,  setSetupDays]  = useState<DayOfWeek[]>(['Mon','Tue','Wed','Thu','Fri'])

  useEffect(() => {
    // Pre-fill HOS from localStorage
    try {
      const hosRaw = localStorage.getItem('3b-hos-data')
      if (hosRaw) {
        const h = JSON.parse(hosRaw)
        if (h.driveRemainingHrs != null) setDriveRem(h.driveRemainingHrs.toFixed(1))
        if (h.shiftRemainingHrs != null) setShiftRem(h.shiftRemainingHrs.toFixed(1))
        if (h.cycleRemainingHrs != null) setCycleRem(h.cycleRemainingHrs.toFixed(1))
      }
      const tripRaw = localStorage.getItem('3b-active-trip')
      if (tripRaw && !initialMiles) {
        const t = JSON.parse(tripRaw)
        if (t.totalMiles) setMiles(Math.round(t.totalMiles).toString())
      }
    } catch { /* ignore */ }
    // Load driver profile
    const profiles = readDriverProfiles()
    if (profiles.length > 0) {
      setProfile(profiles[0])
      setWindows(getDriverAvailabilityWindows(profiles[0], new Date(), 14))
    }
  }, [initialMiles])

  const handleSimulate = () => {
    const m    = parseFloat(miles)
    const dr   = parseFloat(driveRem)
    const sr   = parseFloat(shiftRem) || 14
    const cr   = parseFloat(cycleRem) || 70
    const bd   = breakDueIn ? parseFloat(breakDueIn) : null
    const mph  = parseFloat(avgMph) || 55
    if (isNaN(m) || m <= 0 || isNaN(dr)) return
    const hos: HOSSnapshot = {
      driveRemHrs: dr, shiftRemHrs: sr, cycleRemHrs: cr, breakDueIn: bd,
    }
    const result = simulateHOSETA(m, hos, mph)
    setSim(result)
    setSaved(false)
  }

  const handleSave = () => {
    if (!sim) return
    saveHOSPlanResult({ loadNumber, miles: parseFloat(miles), simulation: sim })
    onSave?.(sim)
    setSaved(true)
  }

  const handleSaveProfile = () => {
    if (!setupCity.trim()) return
    const prefs = { homeCity: setupCity.trim(), homeState: setupState.trim(), homeTimeFreq: setupFreq, homeDaysMin: 2, preferredDays: setupDays, preferredStart: 6, preferredEnd: 20 }
    saveAvailabilityPrefs(prefs)
    // Create a minimal driver profile
    const p: DriverProfile = {
      id: crypto.randomUUID(), driverName: 'Me', homeCity: setupCity, homeState: setupState,
      preferredDays: setupDays, preferredStartHr: 6, preferredEndHr: 20, homeTimeFreq: setupFreq,
      homeDaysMin: 2, cycleType: '70h8d', teamsDriver: false, active: true,
    }
    const { saveDriverProfile } = require('@/lib/hosPlanning')
    saveDriverProfile(p)
    setProfile(p)
    setWindows(getDriverAvailabilityWindows(p, new Date(), 14))
    setShowSetup(false)
  }

  const feasColor = sim ? feasibilityColor(sim.feasibility.status) : 'var(--muted)'
  const feasLabel = sim ? feasibilityStatusLabel(sim.feasibility.status) : ''

  return (
    <div style={{ display: 'grid', gap: '.85rem' }}>

      {/* ── Input form ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem' }}>
        <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.75rem' }}>
          ⏱ HOS Load Planner
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem', marginBottom: '.65rem' }}>
          <div>
            <label style={label}>Miles remaining</label>
            <input value={miles} onChange={e => setMiles(e.target.value)} placeholder="e.g. 480" type="text" inputMode="numeric" style={inp} />
          </div>
          <div>
            <label style={label}>Avg speed (mph)</label>
            <input value={avgMph} onChange={e => setAvgMph(e.target.value)} placeholder="55" type="text" inputMode="numeric" style={inp} />
          </div>
          <div>
            <label style={label}>Drive rem (hrs)</label>
            <input value={driveRem} onChange={e => setDriveRem(e.target.value)} placeholder="e.g. 7.5" type="text" inputMode="decimal" style={inp} />
          </div>
          <div>
            <label style={label}>Shift rem (hrs)</label>
            <input value={shiftRem} onChange={e => setShiftRem(e.target.value)} placeholder="e.g. 10" type="text" inputMode="decimal" style={inp} />
          </div>
          <div>
            <label style={label}>Cycle rem (hrs)</label>
            <input value={cycleRem} onChange={e => setCycleRem(e.target.value)} placeholder="e.g. 42" type="text" inputMode="decimal" style={inp} />
          </div>
          <div>
            <label style={label}>Break due in (hrs)</label>
            <input value={breakDueIn} onChange={e => setBreakDueIn(e.target.value)} placeholder="blank if not due" type="text" inputMode="decimal" style={inp} />
          </div>
        </div>
        <button
          onClick={handleSimulate}
          disabled={!miles || !driveRem}
          style={{
            width: '100%', padding: '.65rem', borderRadius: 10, fontWeight: 900,
            fontSize: 'var(--text-sm)', cursor: (miles && driveRem) ? 'pointer' : 'not-allowed',
            border: 'none', opacity: (miles && driveRem) ? 1 : .5,
            background: 'linear-gradient(135deg,rgba(0,232,176,.2),rgba(0,200,144,.15))',
            color: 'var(--primary)',
          }}
        >
          ⏱ Simulate Legal ETA
        </button>
      </div>

      {/* ── Results ── */}
      {sim && (
        <div style={{ display: 'grid', gap: '.65rem' }}>

          {/* Feasibility banner */}
          <div style={{
            padding: '.75rem 1rem', borderRadius: 12,
            background: 'var(--surface)', border: `1px solid ${feasColor}30`,
            display: 'grid', gap: '.4rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 900, fontSize: '.85rem', color: feasColor }}>{feasLabel}</span>
              <span style={{ fontWeight: 900, fontSize: '.8rem', color: feasColor }}>{sim.feasibility.feasibilityScore}%</span>
            </div>
            {sim.arrivalAt && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Legal ETA</div>
                  <div style={{ fontWeight: 900, fontSize: '.85rem', color: 'var(--text)' }}>
                    {sim.arrivalAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600, marginLeft: 4 }}>
                      {sim.arrivalAt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Drive time</div>
                  <div style={{ fontWeight: 800, fontSize: '.8rem', color: 'var(--text)' }}>{sim.drivingHrs.toFixed(1)}h</div>
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Rest stops</div>
                  <div style={{ fontWeight: 800, fontSize: '.8rem', color: 'var(--text)' }}>{sim.restStops.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Total elapsed</div>
                  <div style={{ fontWeight: 800, fontSize: '.8rem', color: 'var(--text)' }}>{sim.totalElapsedHrs.toFixed(1)}h</div>
                </div>
              </div>
            )}
            {sim.feasibility.constraints.map((c, i) => (
              <div key={i} style={{ fontSize: '.62rem', color: 'var(--warn)', display: 'flex', gap: 5 }}>
                <span>⚠️</span><span>{c}</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem 1rem' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.6rem' }}>
              🗺 Drive Timeline
            </div>
            {sim.timelineEvents.map((ev, i) => (
              <TimelineRow key={i} {...ev} />
            ))}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            style={{
              width: '100%', padding: '.55rem', borderRadius: 10, fontWeight: 800,
              fontSize: 'var(--text-sm)', cursor: 'pointer', border: 'none',
              background: saved ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
              color: saved ? 'var(--primary)' : 'var(--text)',
              border_: `1px solid ${saved ? 'rgba(0,232,176,.25)' : 'var(--border)'}`,
            } as React.CSSProperties}
          >
            {saved ? '✅ Plan saved' : '💾 Save to plan history'}
          </button>
        </div>
      )}

      {/* ── Driver availability ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            🏠 Driver Availability
          </div>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            {profile && (
              <button onClick={() => setShowAvail(v => !v)} style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                {showAvail ? 'Hide' : 'Show'} windows
              </button>
            )}
            <button onClick={() => setShowSetup(v => !v)} style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {profile ? 'Edit profile' : 'Set up profile'}
            </button>
          </div>
        </div>

        {!profile && !showSetup && (
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            Set up your driver profile to see home-time windows and preferred schedule alongside load planning.
          </div>
        )}

        {profile && !showSetup && (
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            🏠 {profile.homeCity}, {profile.homeState} · {homeTimeFreqLabel(profile.homeTimeFreq)} home time
          </div>
        )}

        {showSetup && (
          <div style={{ display: 'grid', gap: '.55rem', marginTop: '.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.4rem' }}>
              <div>
                <label style={label}>Home city</label>
                <input value={setupCity} onChange={e => setSetupCity(e.target.value)} placeholder="e.g. Memphis" style={inp} />
              </div>
              <div>
                <label style={label}>State</label>
                <input value={setupState} onChange={e => setSetupState(e.target.value)} placeholder="TN" style={{ ...inp, width: 52 }} />
              </div>
            </div>
            <div>
              <label style={label}>Home time frequency</label>
              <select value={setupFreq} onChange={e => setSetupFreq(e.target.value as HomeTimeFrequency)} style={inp}>
                {(['weekly','biweekly','monthly','regional','otr_only'] as HomeTimeFrequency[]).map(f => (
                  <option key={f} value={f}>{homeTimeFreqLabel(f)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Preferred work days</label>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                {(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as DayOfWeek[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setSetupDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                    style={{
                      padding: '.25rem .55rem', borderRadius: 8, fontSize: '.62rem', fontWeight: 800,
                      border: `1px solid ${setupDays.includes(d) ? 'rgba(0,232,176,.35)' : 'var(--border)'}`,
                      background: setupDays.includes(d) ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
                      color: setupDays.includes(d) ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button onClick={handleSaveProfile} disabled={!setupCity.trim()}
                style={{ flex: 1, padding: '.5rem', borderRadius: 9, fontWeight: 800, fontSize: 'var(--text-sm)',
                  border: 'none', cursor: setupCity.trim() ? 'pointer' : 'not-allowed', opacity: setupCity.trim() ? 1 : .5,
                  background: 'rgba(0,232,176,.12)', color: 'var(--primary)' }}>
                Save Profile
              </button>
              <button onClick={() => setShowSetup(false)}
                style={{ padding: '.5rem .75rem', borderRadius: 9, fontWeight: 700, fontSize: 'var(--text-sm)',
                  border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showAvail && windows.length > 0 && (
          <div style={{ display: 'grid', gap: '.4rem', marginTop: '.6rem' }}>
            {windows.slice(0, 6).map((w, i) => <AvailPill key={i} window={w} />)}
          </div>
        )}
      </div>
    </div>
  )
}
