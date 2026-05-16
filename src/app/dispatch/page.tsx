'use client'
import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'

type MsgCategory = 'load' | 'arrival' | 'issues' | 'hos' | 'custom'

type ActiveTrip = {
  origin?: { query: string; lat?: number; lon?: number; lng?: number }
  destination?: { query: string; lat?: number; lon?: number; lng?: number }
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

type GeoState = {
  status: 'idle' | 'loading' | 'ok' | 'error'
  lat: number | null
  lng: number | null
  address: string | null
  etaPickup: string | null      // formatted time string
  etaDelivery: string | null
  driveMinPickup: number | null
  driveMinDelivery: number | null
  error: string | null
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }
const btn: React.CSSProperties = { padding: '.6rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' }
const secLabel: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)', paddingBottom: '.5rem', borderBottom: '1px solid var(--border)', marginBottom: '.9rem' }
const inpStyle: React.CSSProperties = { width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box' }

function fmtHrs(h: number | undefined) {
  if (h == null) return '—'
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function fmtTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function minsToHM(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

async function fetchOSRM(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`
    const res = await fetch(url)
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]) {
      return Math.ceil(data.routes[0].duration / 60) // seconds → minutes
    }
  } catch { /* ignore */ }
  return null
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const a = data.address || {}
    const city = a.city || a.town || a.village || a.county || ''
    const state = a.state || ''
    if (city && state) return `${city}, ${state}`
    return data.display_name?.split(',').slice(0, 2).join(', ') ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

const CATS: { id: MsgCategory; label: string; icon: string }[] = [
  { id: 'load',    label: 'Load Accept / Deny', icon: '📦' },
  { id: 'arrival', label: 'En Route / Arrival',  icon: '🚛' },
  { id: 'issues',  label: 'Issues & Delays',     icon: '⚠️' },
  { id: 'hos',     label: 'HOS Updates',         icon: '⏱' },
  { id: 'custom',  label: 'Custom Message',      icon: '✏️' },
]

export default function DispatchMessages() {
  const [cat,         setCat]         = useState<MsgCategory>('load')
  const [trip,        setTrip]        = useState<ActiveTrip | null>(null)
  const [vehicle,     setVehicle]     = useState<VehicleSetup | null>(null)
  const [hos,         setHos]         = useState<HOSData | null>(null)
  const [copied,      setCopied]      = useState<string | null>(null)
  const [customText,  setCustomText]  = useState('')
  const [customNote,  setCustomNote]  = useState('')
  const [driverName,  setDriverName]  = useState('')
  const [issueType,   setIssueType]   = useState('mechanical delay')
  const [issueDetail, setIssueDetail] = useState('')
  const [delayMins,   setDelayMins]   = useState('60')
  const [geo, setGeo] = useState<GeoState>({
    status: 'idle', lat: null, lng: null, address: null,
    etaPickup: null, etaDelivery: null,
    driveMinPickup: null, driveMinDelivery: null, error: null,
  })

  useEffect(() => {
    try {
      const t = localStorage.getItem('3b-active-trip'); if (t) setTrip(JSON.parse(t))
      const v = localStorage.getItem('3b-vehicle');     if (v) setVehicle(JSON.parse(v))
      const h = localStorage.getItem('3b-hos-data');    if (h) setHos(JSON.parse(h))
    } catch { /* ignore */ }
  }, [])

  const getLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeo(g => ({ ...g, status: 'error', error: 'Geolocation not supported by this browser.' }))
      return
    }
    setGeo(g => ({ ...g, status: 'loading', error: null }))

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords

        // Reverse geocode in parallel with ETA fetches
        const pickupLat  = trip?.origin?.lat      ?? trip?.origin?.lon      ?? null
        const pickupLng  = trip?.origin?.lng       ?? null
        const delivLat   = trip?.destination?.lat  ?? trip?.destination?.lon ?? null
        const delivLng   = trip?.destination?.lng  ?? null

        const [address, driveMinPickup, driveMinDelivery] = await Promise.all([
          reverseGeocode(lat, lng),
          (pickupLat && pickupLng) ? fetchOSRM(lat, lng, pickupLat, pickupLng) : Promise.resolve(null),
          (delivLat  && delivLng)  ? fetchOSRM(lat, lng, delivLat,  delivLng)  : Promise.resolve(null),
        ])

        const now = Date.now()
        const etaPickup   = driveMinPickup   != null ? fmtTime(new Date(now + driveMinPickup   * 60000)) : null
        const etaDelivery = driveMinDelivery != null ? fmtTime(new Date(now + driveMinDelivery * 60000)) : null

        setGeo({
          status: 'ok', lat, lng, address,
          etaPickup, etaDelivery, driveMinPickup, driveMinDelivery, error: null,
        })
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'Location permission denied. Please allow location access in your browser.',
          2: 'Position unavailable. Make sure GPS is enabled.',
          3: 'Location request timed out. Try again.',
        }
        setGeo(g => ({ ...g, status: 'error', error: msgs[err.code] ?? 'Could not get location.' }))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }, [trip])

  const origin      = trip?.origin?.query      ?? '—'
  const dest        = trip?.destination?.query ?? '—'
  const loadNum     = trip?.loadNumber         ?? '—'
  const tractorNum  = vehicle?.truckNum        ?? '—'
  const trailerNum  = vehicle?.trailerNum      ?? '—'
  const driver      = driverName || hos?.driverName || 'Driver'
  const driveRem    = fmtHrs(hos?.driveRemainingHrs)
  const shiftRem    = fmtHrs(hos?.shiftRemainingHrs)
  const cycleRem    = fmtHrs(hos?.cycleRemainingHrs)
  const currentLoc  = geo.address ?? '(location not set — tap Get Location)'
  const etaPickupStr   = geo.etaPickup   ? `${geo.etaPickup} (${minsToHM(geo.driveMinPickup!)} drive)` : '—'
  const etaDelivStr    = geo.etaDelivery ? `${geo.etaDelivery} (${minsToHM(geo.driveMinDelivery!)} drive)` : '—'

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
        text: `Hello, this is ${driver} confirming load #${loadNum}.\n\nRoute: ${origin} → ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nCurrent location: ${currentLoc}\nETA to pickup: ${etaPickupStr}\n\nAll set — I'll keep you updated on any changes.\n\nThank you.`,
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
        text: `Hello, this is ${driver} — I am en route to pickup for load #${loadNum}.\n\nCurrent location: ${currentLoc}\nETA to pickup (${origin}): ${etaPickupStr}\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDrive time remaining: ${driveRem}\n\nI will notify you upon arrival.`,
      },
      {
        id: 'enroute-delivery',
        title: '🚛 En Route to Delivery',
        text: `Hello, this is ${driver} — load #${loadNum} is loaded and I am en route to delivery.\n\nCurrent location: ${currentLoc}\nETA to delivery (${dest}): ${etaDelivStr}\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDrive time remaining: ${driveRem}\n\nWill provide updates en route.`,
      },
      {
        id: 'arrived-pickup',
        title: '📍 Arrived at Pickup',
        text: `Hello, this is ${driver}.\n\nI have arrived at the pickup location for load #${loadNum}.\n\nLocation: ${origin}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nArrival time: ${fmtTime(new Date())}\n\nChecking in with the facility now.`,
      },
      {
        id: 'loaded-departing',
        title: '✅ Loaded — Departing',
        text: `Hello, this is ${driver}.\n\nLoad #${loadNum} is loaded and secured. I am departing now.\n\nOrigin: ${origin}\nDestination: ${dest}\nETA to delivery: ${etaDelivStr}\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDepart time: ${fmtTime(new Date())}\nDrive remaining: ${driveRem} | Shift remaining: ${shiftRem}\n\nWill provide updates en route.`,
      },
      {
        id: 'arrived-delivery',
        title: '🏁 Arrived at Delivery',
        text: `Hello, this is ${driver}.\n\nI have arrived at the delivery location for load #${loadNum}.\n\nLocation: ${dest}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nArrival time: ${fmtTime(new Date())}\n\nChecking in now. Will confirm unload completion.`,
      },
      {
        id: 'empty-available',
        title: '📭 Empty — Available for Dispatch',
        text: `Hello, this is ${driver}.\n\nLoad #${loadNum} has been delivered and unloaded. I am now empty and available for the next load.\n\nCurrent location: ${currentLoc}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nDrive remaining: ${driveRem} | Shift remaining: ${shiftRem}\n\nReady for next dispatch.`,
      },
    ],
    issues: [
      {
        id: 'mechanical',
        title: '🔧 Mechanical Delay',
        text: `Hello, this is ${driver} — reporting a ${issueType} on load #${loadNum}.\n\nCurrent location: ${currentLoc}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nEstimated delay: ~${delayMins} minutes${issueDetail ? `\nDetails: ${issueDetail}` : ''}\n\nUpdated ETA to delivery: ${etaDelivStr !== '—' ? `~${fmtTime(new Date(Date.now() + (geo.driveMinDelivery ?? 0) * 60000 + Number(delayMins) * 60000))}` : 'TBD'}\n\nI will keep you updated as the situation develops. Please advise on any required actions.\n\nThank you.`,
      },
      {
        id: 'traffic',
        title: '🚦 Traffic / Road Delay',
        text: `Hello, this is ${driver}.\n\nReporting a traffic delay on load #${loadNum}.\n\nCurrent location: ${currentLoc}\nEstimated delay: ~${delayMins} minutes${issueDetail ? `\nDetails: ${issueDetail}` : ''}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nI will update my ETA accordingly. No cargo issues — just road conditions.`,
      },
      {
        id: 'weather',
        title: '🌧 Weather Delay',
        text: `Hello, this is ${driver}.\n\nI am experiencing weather-related delays on load #${loadNum}.\n\nCurrent location: ${currentLoc}\nConditions are affecting safe travel. Estimated delay: ~${delayMins} minutes.\nTractor: ${tractorNum} | Trailer: ${trailerNum}${issueDetail ? `\nDetails: ${issueDetail}` : ''}\n\nI am parked safely and will resume when conditions improve. Will update ETA.`,
      },
      {
        id: 'detention',
        title: '⏳ Detention Clock Started',
        text: `Hello, this is ${driver}.\n\nDetention time has started for load #${loadNum}.\n\nArrival time: ${fmtTime(new Date())}\nFacility: ${dest}\nCurrent location: ${currentLoc}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nFacility has not begun unloading within the 2-hour window. Detention clock is now running. Please log this for settlement purposes.`,
      },
      {
        id: 'breakdown',
        title: '🚨 Breakdown — Emergency',
        text: `BREAKDOWN — Load #${loadNum}\n\nDriver: ${driver}\nCurrent location: ${currentLoc}${geo.lat ? `\nGPS: ${geo.lat.toFixed(5)}, ${geo.lng?.toFixed(5)}` : ''}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nIssue: ${issueDetail || 'Vehicle breakdown — unable to proceed'}\n\nI have secured the vehicle and activated hazard lights. Requesting roadside assistance and updated dispatch instructions.\n\nPlease call me immediately.`,
      },
    ],
    hos: [
      {
        id: 'hos-status',
        title: '⏱ HOS Status Update',
        text: `Hello, this is ${driver} — HOS status update for load #${loadNum}.\n\nDrive time remaining: ${driveRem}\nShift time remaining: ${shiftRem}\nCycle remaining: ${cycleRem}\n\nCurrent location: ${currentLoc}\nETA to delivery: ${etaDelivStr}\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}\nRoute: ${origin} → ${dest}`,
      },
      {
        id: 'hos-low',
        title: '⚠️ Low HOS — Need Rest',
        text: `Hello, this is ${driver}.\n\nHOS warning for load #${loadNum} — running low on available drive time.\n\nDrive time remaining: ${driveRem}\nShift time remaining: ${shiftRem}\nCurrent location: ${currentLoc}\n\nI will need to take my required rest before completing delivery. Please advise on preferred rest location and updated delivery expectations.\n\nTractor: ${tractorNum} | Trailer: ${trailerNum}`,
      },
      {
        id: 'hos-rest-start',
        title: '🛑 Starting 10-Hour Rest',
        text: `Hello, this is ${driver}.\n\nI am beginning my mandatory 10-hour rest break for load #${loadNum}.\n\nCurrent location: ${currentLoc}\nRest start: ${fmtTime(new Date())}\nExpected resume: ${fmtTime(new Date(Date.now() + 10 * 3600000))}\nTractor: ${tractorNum} | Trailer: ${trailerNum}\n\nWill notify dispatch upon waking and resuming.`,
      },
      {
        id: 'hos-rest-done',
        title: '✅ Rest Complete — Resuming',
        text: `Hello, this is ${driver}.\n\nRest period complete for load #${loadNum}. I am resuming driving.\n\nResume time: ${fmtTime(new Date())}\nCurrent location: ${currentLoc}\nETA to delivery: ${etaDelivStr}\nDrive time available: 11h 0m | Shift time available: 14h 0m\nTractor: ${tractorNum} | Trailer: ${trailerNum}`,
      },
      {
        id: 'hos-break30',
        title: '⏸ Taking Mandatory 30-Min Break',
        text: `Hello, this is ${driver}.\n\nTaking mandatory 30-minute break (FMCSA §395.3) — load #${loadNum}.\n\nBreak start: ${fmtTime(new Date())}\nResume: ${fmtTime(new Date(Date.now() + 30 * 60000))}\nCurrent location: ${currentLoc}\nDrive time remaining after break: ${driveRem}\nTractor: ${tractorNum} | Trailer: ${trailerNum}`,
      },
    ],
    custom: [],
  }

  const activeMsgs = MESSAGES[cat]

  const hasCoords = !!(trip?.origin?.lat || trip?.origin?.lng) || !!(trip?.destination?.lat || trip?.destination?.lng)

  return (
    <>
      <TopBar title="Dispatch Messages" module="ops" subtitle="Geo-tagged · pre-built message templates" />

      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0,300px) 1fr', gap: '1.2rem', padding: '1.2rem', alignItems: 'start' }}>

        {/* ── LEFT ── */}
        <div style={{ display: 'grid', gap: '.75rem' }}>

          {/* 📍 Geo Location Card */}
          <div style={{ ...card, border: geo.status === 'ok' ? '1px solid rgba(0,232,176,.3)' : '1px solid var(--border)' }}>
            <div style={secLabel}>📍 Live Location & ETA</div>

            <button onClick={getLocation} disabled={geo.status === 'loading'}
              style={{
                width: '100%', padding: '.7rem', borderRadius: 10, fontWeight: 800,
                fontSize: 'var(--text-sm)', cursor: geo.status === 'loading' ? 'not-allowed' : 'pointer',
                border: 'none', marginBottom: '.75rem',
                background: geo.status === 'ok'
                  ? 'rgba(0,232,176,.1)'
                  : geo.status === 'error'
                    ? 'rgba(232,64,0,.08)'
                    : 'linear-gradient(135deg,rgba(0,232,176,.15),rgba(0,200,144,.1))',
                color: geo.status === 'ok' ? 'var(--primary)' : geo.status === 'error' ? 'var(--error)' : 'var(--text)',
                boxShadow: geo.status === 'ok' ? '0 0 0 1px rgba(0,232,176,.25)' : '0 0 0 1px rgba(0,232,176,.12)',
                opacity: geo.status === 'loading' ? .7 : 1,
              }}>
              {geo.status === 'loading' ? '📡 Getting location…' :
               geo.status === 'ok'      ? '🔄 Refresh Location' :
                                          '📍 Get My Location + ETA'}
            </button>

            {geo.status === 'error' && (
              <div style={{ padding: '.6rem .75rem', borderRadius: 8, background: 'rgba(232,64,0,.07)', border: '1px solid rgba(232,64,0,.2)', color: 'var(--error)', fontSize: 'var(--text-xs)', marginBottom: '.65rem', lineHeight: 1.5 }}>
                {geo.error}
              </div>
            )}

            {geo.status === 'ok' && (
              <div style={{ display: 'grid', gap: '.5rem' }}>
                {/* Current position */}
                <div style={{ background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 10, padding: '.6rem .8rem' }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>📍 Current location</div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text)' }}>{geo.address}</div>
                  <div style={{ fontSize: '.6rem', color: 'var(--faint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {geo.lat?.toFixed(5)}, {geo.lng?.toFixed(5)}
                  </div>
                </div>

                {/* ETA to pickup */}
                {geo.etaPickup ? (
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.6rem .8rem' }}>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>🚛 ETA to pickup</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text)' }}>{geo.etaPickup}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>{minsToHM(geo.driveMinPickup!)} · {origin.length > 28 ? origin.slice(0, 26) + '…' : origin}</div>
                  </div>
                ) : !hasCoords ? (
                  <div style={{ fontSize: '.65rem', color: 'var(--faint)', lineHeight: 1.5, padding: '.4rem .5rem' }}>
                    💡 Build a trip plan to get ETA to pickup and delivery.
                  </div>
                ) : null}

                {/* ETA to delivery */}
                {geo.etaDelivery && (
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.6rem .8rem' }}>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>🏁 ETA to delivery</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text)' }}>{geo.etaDelivery}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>{minsToHM(geo.driveMinDelivery!)} · {dest.length > 28 ? dest.slice(0, 26) + '…' : dest}</div>
                  </div>
                )}
              </div>
            )}

            {geo.status === 'idle' && (
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '.25rem' }}>
                Tap to get your GPS position and calculate drive time to pickup &amp; delivery. ETAs auto-fill into messages.
              </div>
            )}
          </div>

          {/* Driver / assets card */}
          <div style={card}>
            <div style={secLabel}>Your Info</div>
            <div style={{ display: 'grid', gap: '.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Driver name</label>
                <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder={hos?.driverName ?? 'Your name'} style={inpStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', fontSize: 'var(--text-xs)' }}>
                {[['Load #', loadNum], ['Origin', origin.length > 18 ? origin.slice(0, 16) + '…' : origin], ['Dest', dest.length > 18 ? dest.slice(0, 16) + '…' : dest], ['Tractor', tractorNum], ['Trailer', trailerNum]].map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '.45rem .65rem', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                    <div style={{ fontWeight: 800, color: v === '—' ? 'var(--faint)' : 'var(--text)', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
                {hos && (
                  <div style={{ background: 'rgba(0,232,176,.06)', borderRadius: 8, padding: '.45rem .65rem', border: '1px solid rgba(0,232,176,.15)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Drive rem.</div>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>{driveRem}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Issue details */}
          {cat === 'issues' && (
            <div style={card}>
              <div style={secLabel}>Issue Details</div>
              <div style={{ display: 'grid', gap: '.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Issue type</label>
                  <select value={issueType} onChange={e => setIssueType(e.target.value)} style={inpStyle}>
                    {['mechanical delay','tire issue','brake issue','engine warning light','electrical issue','cargo damage','accident','traffic delay','weather delay','dock delay'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Details (optional)</label>
                  <input value={issueDetail} onChange={e => setIssueDetail(e.target.value)} placeholder="Brief description..." style={inpStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Est. delay (mins)</label>
                  <input type="number" value={delayMins} onChange={e => setDelayMins(e.target.value)} style={inpStyle} />
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
                  style={{ ...btn, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '.6rem .85rem', background: cat === c.id ? 'rgba(0,232,176,.08)' : 'var(--surface-2)', borderColor: cat === c.id ? 'rgba(0,232,176,.3)' : 'var(--border)', color: cat === c.id ? 'var(--primary)' : 'var(--text)' }}>
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
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Subject / note</label>
                  <input value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="e.g. Fuel receipt, lumper payment…" style={inpStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Message body</label>
                  <textarea value={customText} onChange={e => setCustomText(e.target.value)}
                    placeholder={`Hello, this is ${driver}.\n\nLoad #${loadNum}\nCurrent location: ${currentLoc}\n\n[Your message here]`}
                    style={{ ...inpStyle, resize: 'vertical', minHeight: 200, lineHeight: 1.65 }} />
                </div>
                <button onClick={() => copy('custom', customText)} style={{ ...btn, background: copied === 'custom' ? 'rgba(40,192,72,.1)' : 'var(--surface-2)', borderColor: copied === 'custom' ? 'rgba(40,192,72,.3)' : 'var(--border)', color: copied === 'custom' ? 'var(--success)' : 'var(--text)', padding: '.7rem', textAlign: 'center' }}>
                  {copied === 'custom' ? '✅ Copied!' : '📋 Copy message'}
                </button>
              </div>
            </div>
          ) : (
            activeMsgs.map(msg => (
              <div key={msg.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.85rem', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{msg.title}</div>
                  <button onClick={() => copy(msg.id, msg.text)}
                    style={{ ...btn, padding: '.35rem .75rem', fontSize: '.65rem', flexShrink: 0, background: copied === msg.id ? 'rgba(40,192,72,.1)' : 'var(--surface-2)', borderColor: copied === msg.id ? 'rgba(40,192,72,.3)' : 'var(--border)', color: copied === msg.id ? 'var(--success)' : 'var(--text)' }}>
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

      {/* Mobile: stack columns */}
      <style>{`
        @media (max-width: 768px) {
          main { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
