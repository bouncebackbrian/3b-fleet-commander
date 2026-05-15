'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'

type MsgCategory = 'load' | 'arrival' | 'issues' | 'hos' | 'custom'

type ActiveTrip = {
  origin?: { query: string }
  destination?: { query: string }
  totalMiles?: number
  loadNumber?: string | null
  departTime?: string
  estArrival?: string
}

type VehicleSetup = {
  truckNum?: string; trailerNum?: string; make?: string; model?: string; year?: string
}

type HOSData = {
  driveRemainingHrs?: number; shiftRemainingHrs?: number; breakInHrs?: number
  cycleRemainingHrs?: number; status?: string; driverName?: string
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }
const btn: React.CSSProperties = { padding: '.6rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' }
const secLabel: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)', paddingBottom: '.5rem', borderBottom: '1px solid var(--border)', marginBottom: '.9rem' }

function fmtHrs(h: number | undefined) {
  if (h == null) return '—'
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

const CATS: { id: MsgCategory; label: string; icon: string }[] = [
  { id: 'load', label: 'Load Accept / Deny', icon: '📦' },
  { id: 'arrival', label: 'En Route / Arrival', icon: '🚛' },
  { id: 'issues', label: 'Issues & Delays', icon: '⚠️' },
  { id: 'hos', label: 'HOS Updates', icon: '⏱' },
  { id: 'custom', label: 'Custom Message', icon: '✏️' },
]

export default function DispatchMessages() {
  const [cat, setCat] = useState<MsgCategory>('load')
  const [trip, setTrip] = useState<ActiveTrip | null>(null)
  const [vehicle, setVehicle] = useState<VehicleSetup | null>(null)
  const [hos, setHos] = useState<HOSData | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [driverName, setDriverName] = useState('')
  const [issueType, setIssueType] = useState('mechanical delay')
  const [issueDetail, setIssueDetail] = useState('')
  const [delayMins, setDelayMins] = useState('60')

  useEffect(() => {
    try {
      const t = localStorage.getItem('3b-active-trip'); if (t) setTrip(JSON.parse(t))
      const v = localStorage.getItem('3b-vehicle'); if (v) setVehicle(JSON.parse(v))
      const h = localStorage.getItem('3b-hos-data'); if (h) setHos(JSON.parse(h))
    } catch { /* ignore */ }
  }, [])

  const origin = trip?.origin?.query ?? '—'
  const dest = trip?.destination?.query ?? '—'
  const loadNum = trip?.loadNumber ?? '—'
  const tractorNum = vehicle?.truckNum ?? '—'
  const trailerNum = vehicle?.trailerNum ?? '—'
  const driver = driverName || hos?.driverName || 'Driver'
  const driveRem = fmtHrs(hos?.driveRemainingHrs)
  const shiftRem = fmtHrs(hos?.shiftRemainingHrs)
  const cycleRem = fmtHrs(hos?.cycleRemainingHrs)

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const MESSAGES: Record<MsgCategory, { id: string; title: string; text: string }[]> = {
    load: [
      {
        id: 'accept',
        title: '✅ Accept Load',
        text: `Hello, this is ${driver}.\n\nI am accepting load #${loadNum}.\n\nRoute: ${origin} → ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nI will be ready for pickup as dispatched. Please confirm any special instructions.\n\nThank you.`,
      },
      {
        id: 'accept-eta',
        title: '✅ Accept Load + ETA',
        text: `Hello, this is ${driver} confirming load #${loadNum}.\n\nRoute: ${origin} → ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nEstimated arrival at pickup: ${trip?.departTime ? new Date(trip.departTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'per dispatch'}\n\nAll set — I'll keep you updated on any changes.\n\nThank you.`,
      },
      {
        id: 'deny-hos',
        title: '❌ Deny Load — HOS',
        text: `Hello, this is ${driver}.\n\nUnfortunately I am unable to accept load #${loadNum} at this time due to HOS limitations.\n\nDrive time remaining: ${driveRem}\nShift time remaining: ${shiftRem}\n\nThis does not allow me to safely complete the route within legal driving limits. I am available after my required rest period.\n\nApologies for the inconvenience.`,
      },
      {
        id: 'deny-weight',
        title: '❌ Deny Load — Weight / Legal',
        text: `Hello, this is ${driver}.\n\nI am unable to accept load #${loadNum}. The listed weight or cargo specifications may exceed my current legal limits or trailer configuration.\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nPlease verify the weight and commodity details and re-dispatch if eligible.\n\nThank you.`,
      },
      {
        id: 'deny-other',
        title: '❌ Deny Load — Other',
        text: `Hello, this is ${driver}.\n\nI am unable to accept load #${loadNum} at this time.\n\nPlease re-assign to another available driver. I will be available for future dispatch.\n\nThank you for understanding.`,
      },
    ],
    arrival: [
      {
        id: 'enroute',
        title: '🚛 En Route to Pickup',
        text: `Hello, this is ${driver} — I am en route to pickup for load #${loadNum}.\n\nOrigin: ${origin}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDrive time remaining: ${driveRem}\n\nI will notify you upon arrival.`,
      },
      {
        id: 'arrived-pickup',
        title: '📍 Arrived at Pickup',
        text: `Hello, this is ${driver}.\n\nI have arrived at the pickup location for load #${loadNum}.\n\nLocation: ${origin}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nArrival time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\nChecking in with the facility now.`,
      },
      {
        id: 'loaded-departing',
        title: '✅ Loaded — Departing',
        text: `Hello, this is ${driver}.\n\nLoad #${loadNum} is loaded and secured. I am departing now.\n\nOrigin: ${origin}\nDestination: ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDepart time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nDrive remaining: ${driveRem} | Shift remaining: ${shiftRem}\n\nWill provide updates en route.`,
      },
      {
        id: 'arrived-delivery',
        title: '🏁 Arrived at Delivery',
        text: `Hello, this is ${driver}.\n\nI have arrived at the delivery location for load #${loadNum}.\n\nLocation: ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nArrival time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\nChecking in now. Will confirm unload completion.`,
      },
      {
        id: 'empty-available',
        title: '📭 Empty — Available for Dispatch',
        text: `Hello, this is ${driver}.\n\nLoad #${loadNum} has been delivered and unloaded. I am now empty and available for the next load.\n\nCurrent location: ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDrive remaining: ${driveRem} | Shift remaining: ${shiftRem}\n\nReady for next dispatch.`,
      },
    ],
    issues: [
      {
        id: 'mechanical',
        title: '🔧 Mechanical Delay',
        text: `Hello, this is ${driver} — reporting a ${issueType} on load #${loadNum}.\n\nLocation: (current position)\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nEstimated delay: ~${delayMins} minutes${issueDetail ? `\nDetails: ${issueDetail}` : ''}\n\nI will keep you updated as the situation develops. Please advise on any required actions.\n\nThank you.`,
      },
      {
        id: 'traffic',
        title: '🚦 Traffic / Road Delay',
        text: `Hello, this is ${driver}.\n\nReporting a traffic delay on load #${loadNum}.\n\nEstimated delay: ~${delayMins} minutes${issueDetail ? `\nDetails: ${issueDetail}` : ''}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nI will update my ETA accordingly. No cargo issues — just road conditions.`,
      },
      {
        id: 'weather',
        title: '🌧 Weather Delay',
        text: `Hello, this is ${driver}.\n\nI am experiencing weather-related delays on load #${loadNum}.\n\nConditions are affecting safe travel. Estimated delay: ~${delayMins} minutes.\nTractor: ${tractorNum} | Trailer: ${trailerNum}${issueDetail ? `\nDetails: ${issueDetail}` : ''}\n\nI am parked safely and will resume when conditions improve. Will update ETA.`,
      },
      {
        id: 'detention',
        title: '⏳ Detention Clock Started',
        text: `Hello, this is ${driver}.\n\nDetention time has started for load #${loadNum}.\n\nArrival time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nFacility: ${cat === 'arrival' ? origin : dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nFacility has not begun unloading within the 2-hour window. Detention clock is now running. Please log this for settlement purposes.`,
      },
      {
        id: 'breakdown',
        title: '🚨 Breakdown — Emergency',
        text: `BREAKDOWN — Load #${loadNum}\n\nDriver: ${driver}\nLocation: (provide GPS coordinates or mile marker)\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nIssue: ${issueDetail || 'Vehicle breakdown — unable to proceed'}\n\nI have secured the vehicle and activated hazard lights. Requesting roadside assistance and updated dispatch instructions.\n\nPlease call me immediately.`,
      },
    ],
    hos: [
      {
        id: 'hos-status',
        title: '⏱ HOS Status Update',
        text: `Hello, this is ${driver} — HOS status update for load #${loadNum}.\n\nDrive time remaining: ${driveRem}\nShift time remaining: ${shiftRem}\nCycle remaining: ${cycleRem}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nRoute: ${origin} → ${dest}`,
      },
      {
        id: 'hos-low',
        title: '⚠️ Low HOS — Need Rest',
        text: `Hello, this is ${driver}.\n\nHOS warning for load #${loadNum} — running low on available drive time.\n\nDrive time remaining: ${driveRem}\nShift time remaining: ${shiftRem}\n\nI will need to take my required rest before completing delivery. Please advise on preferred rest location and updated delivery expectations.\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}`,
      },
      {
        id: 'hos-rest-start',
        title: '🛑 Starting 10-Hour Rest',
        text: `Hello, this is ${driver}.\n\nI am beginning my mandatory 10-hour rest break for load #${loadNum}.\n\nCurrent location: (provide location)\nRest start: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nExpected resume: ${new Date(Date.now() + 10 * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nWill notify dispatch upon waking and resuming.`,
      },
      {
        id: 'hos-rest-done',
        title: '✅ Rest Complete — Resuming',
        text: `Hello, this is ${driver}.\n\nRest period complete for load #${loadNum}. I am resuming driving.\n\nResume time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nDrive time available: 11h 0m\nShift time available: 14h 0m\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nHeading to ${dest}. Will update ETA.`,
      },
      {
        id: 'hos-break30',
        title: '⏸ Taking Mandatory 30-Min Break',
        text: `Hello, this is ${driver}.\n\nTaking mandatory 30-minute break (FMCSA §395.3) — load #${loadNum}.\n\nBreak start: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nResume: ${new Date(Date.now() + 30 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nDrive time remaining after break: ${driveRem}\nTractor: ${tractorNum} | Trailer: ${trailerNum}`,
      },
    ],
    custom: [],
  }

  const activeMsgs = MESSAGES[cat]

  return (
    <>
      <TopBar title="Dispatch Messages" module="ops" subtitle="Pre-built message templates for load, arrival, issues & HOS" />

      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0,320px) 1fr', gap: '1.4rem', padding: '1.4rem', alignItems: 'start' }}>

        {/* ── LEFT: Settings + Categories ── */}
        <div style={{ display: 'grid', gap: '.75rem' }}>

          {/* Driver / assets card */}
          <div style={card}>
            <div style={secLabel}>Your Info</div>
            <div style={{ display: 'grid', gap: '.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Driver name</label>
                <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder={hos?.driverName ?? 'Your name'} style={{ width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', fontSize: 'var(--text-xs)' }}>
                {[['Load #', loadNum], ['Origin', origin.length > 18 ? origin.slice(0, 16) + '…' : origin], ['Dest', dest.length > 18 ? dest.slice(0, 16) + '…' : dest], ['Tractor', tractorNum], ['Trailer', trailerNum]].map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '.45rem .65rem', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                    <div style={{ fontWeight: 800, color: v === '—' ? 'var(--faint)' : 'var(--text)', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
                {hos && (
                  <div style={{ background: 'rgba(79,152,163,.08)', borderRadius: 8, padding: '.45rem .65rem', border: '1px solid rgba(79,152,163,.2)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Drive rem.</div>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>{driveRem}</div>
                  </div>
                )}
              </div>
              {!trip && !vehicle && (
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.55, background: 'rgba(253,171,67,.06)', border: '1px solid rgba(253,171,67,.2)', borderRadius: 8, padding: '.5rem .75rem' }}>
                  💡 Build a trip plan and set up your truck to auto-fill load, route, and asset info into messages.
                </div>
              )}
            </div>
          </div>

          {/* Issue details (shown when issues cat active) */}
          {cat === 'issues' && (
            <div style={card}>
              <div style={secLabel}>Issue Details</div>
              <div style={{ display: 'grid', gap: '.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Issue type</label>
                  <select value={issueType} onChange={e => setIssueType(e.target.value)} style={{ width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none' }}>
                    {['mechanical delay', 'tire issue', 'brake issue', 'engine warning light', 'electrical issue', 'cargo damage', 'accident', 'traffic delay', 'weather delay', 'dock delay'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Details (optional)</label>
                  <input value={issueDetail} onChange={e => setIssueDetail(e.target.value)} placeholder="Brief description..." style={{ width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Est. delay (mins)</label>
                  <input type="number" value={delayMins} onChange={e => setDelayMins(e.target.value)} style={{ width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
          )}

          {/* Category selector */}
          <div style={card}>
            <div style={secLabel}>Message Type</div>
            <div style={{ display: 'grid', gap: '.4rem' }}>
              {CATS.map(c => (
                <button key={c.id} onClick={() => setCat(c.id)}
                  style={{ ...btn, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '.6rem .85rem', background: cat === c.id ? 'rgba(79,152,163,.12)' : 'var(--surface-2)', borderColor: cat === c.id ? 'rgba(79,152,163,.4)' : 'var(--border)', color: cat === c.id ? 'var(--primary)' : 'var(--text)' }}>
                  <span>{c.icon}</span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Message cards ── */}
        <div style={{ display: 'grid', gap: '.85rem' }}>

          {cat === 'custom' ? (
            <div style={card}>
              <div style={secLabel}>Custom Message</div>
              <div style={{ display: 'grid', gap: '.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Message subject / note</label>
                  <input value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="e.g. Fuel receipt, lumper payment, appointment confirmation..." style={{ width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Message body</label>
                  <textarea value={customText} onChange={e => setCustomText(e.target.value)}
                    placeholder={`Hello, this is ${driver}.\n\nLoad #${loadNum}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\n[Your message here]`}
                    style={{ width: '100%', padding: '.65rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', resize: 'vertical', minHeight: 200, lineHeight: 1.65, boxSizing: 'border-box' }} />
                </div>
                <button onClick={() => copy('custom', customText)} style={{ ...btn, background: copied === 'custom' ? 'rgba(109,170,69,.12)' : 'var(--surface-2)', borderColor: copied === 'custom' ? 'rgba(109,170,69,.4)' : 'var(--border)', color: copied === 'custom' ? 'var(--success)' : 'var(--text)', padding: '.7rem', textAlign: 'center' }}>
                  {copied === 'custom' ? '✅ Copied!' : '📋 Copy message'}
                </button>
              </div>
            </div>
          ) : (
            activeMsgs.map(msg => (
              <div key={msg.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.85rem' }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{msg.title}</div>
                  <button onClick={() => copy(msg.id, msg.text)} style={{ ...btn, padding: '.35rem .75rem', fontSize: '.65rem', background: copied === msg.id ? 'rgba(109,170,69,.12)' : 'var(--surface-2)', borderColor: copied === msg.id ? 'rgba(109,170,67,.4)' : 'var(--border)', color: copied === msg.id ? 'var(--success)' : 'var(--text)', flexShrink: 0 }}>
                    {copied === msg.id ? '✅ Copied!' : '📋 Copy'}
                  </button>
                </div>
                <pre style={{ fontFamily: 'inherit', fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.75rem .9rem' }}>
                  {msg.text}
                </pre>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  )
}
