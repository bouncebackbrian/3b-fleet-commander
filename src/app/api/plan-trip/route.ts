import { NextRequest, NextResponse } from 'next/server'

interface LatLon { lat: number; lon: number }

function distMi(a: LatLon, b: LatLon) {
  const R = 3958.8
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function routeT(pt: LatLon, o: LatLon, d: LatLon) {
  const dx = d.lon - o.lon, dy = d.lat - o.lat
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return 0
  return Math.max(0, Math.min(1, ((pt.lon - o.lon) * dx + (pt.lat - o.lat) * dy) / len2))
}

function perpMi(pt: LatLon, o: LatLon, d: LatLon) {
  const t = routeT(pt, o, d)
  return distMi(pt, { lat: o.lat + t * (d.lat - o.lat), lon: o.lon + t * (d.lon - o.lon) })
}

/** Real road-route distance via OSRM (same public router RouteMap.tsx already uses) — falls back to the straight-line×1.18 estimate if OSRM is unreachable. */
async function osrmRouteMiles(o: LatLon, d: LatLon): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=false`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]?.distance) return null
    return data.routes[0].distance / 1609.344 // meters -> miles
  } catch { return null }
}

async function geocode(q: string): Promise<LatLon | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': '3BFleetCommander/1.0 (fleet.bouncebackbrian.com)' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch { return null }
}

let tokenCache: { value: string; exp: number } | null = null
async function getToken(apiUrl: string, cid: string, csec: string) {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.value
  const tokenUrl = process.env.LOVES_TOKEN_URL || `${apiUrl}/oauth/token`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cid, client_secret: csec }),
  })
  if (!res.ok) throw new Error(`Token: ${res.status}`)
  const j = await res.json()
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
  return tokenCache.value
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const originQ = sp.get('origin')
  const destQ = sp.get('dest')
  const departStr = sp.get('depart')
  const loadNumber = sp.get('load') || null
  const avgSpeed = parseFloat(sp.get('speed') || '60')

  if (!originQ || !destQ) return NextResponse.json({ error: 'origin and dest required' }, { status: 400 })

  const [originCoord, destCoord] = await Promise.all([geocode(originQ), geocode(destQ)])
  if (!originCoord) return NextResponse.json({ error: `Cannot geocode: ${originQ}` }, { status: 400 })
  if (!destCoord) return NextResponse.json({ error: `Cannot geocode: ${destQ}` }, { status: 400 })

  // Real road distance via OSRM; straight-line × 1.18 only as a fallback if OSRM is unreachable.
  const osrmMiles = await osrmRouteMiles(originCoord, destCoord)
  const totalMiles = Math.round(osrmMiles ?? distMi(originCoord, destCoord) * 1.18)
  const depart = departStr ? new Date(departStr) : new Date()

  // Fetch Love's locations
  const apiUrl = process.env.LOVES_API_URL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let locations: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priceMap = new Map<number, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let showerMap = new Map<number, any>()

  if (apiUrl) {
    try {
      const locRes = await fetch(`${apiUrl}/locations?facilityTypeName=Store`, { next: { revalidate: 86400 } })
      if (locRes.ok) locations = await locRes.json()
    } catch { /* no locations */ }
  }

  // Filter to corridor: within 40mi of straight line, between 5%–95% of route
  const corridor = locations.filter(loc => {
    if (loc.latitude == null || loc.longitude == null) return false
    const pt = { lat: loc.latitude, lon: loc.longitude }
    const t = routeT(pt, originCoord, destCoord)
    return t > 0.04 && t < 0.96 && perpMi(pt, originCoord, destCoord) <= 40
  })
  corridor.sort((a, b) => routeT({ lat: a.latitude, lon: a.longitude }, originCoord, destCoord) - routeT({ lat: b.latitude, lon: b.longitude }, originCoord, destCoord))

  // Fetch fuel prices + showers for corridor stores (requires auth)
  if (apiUrl && corridor.length > 0) {
    const cid = process.env.LOVES_CLIENT_ID
    const csec = process.env.LOVES_CLIENT_SECRET
    if (cid && csec) {
      try {
        const token = await getToken(apiUrl, cid, csec)
        const auth = { Authorization: `Bearer ${token}` }
        const siteIds = corridor.map(l => l.siteId).join(',')
        const [prRes, shRes] = await Promise.all([
          fetch(`${apiUrl}/fuelPrices?productCodes=20`, { headers: auth, next: { revalidate: 1800 } }),
          fetch(`${apiUrl}/showers/status?siteIds=${siteIds}`, { headers: auth, next: { revalidate: 300 } }),
        ])
        if (prRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pd: any[] = await prRes.json()
          for (const p of pd) priceMap.set(p.siteId, p)
        }
        if (shRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sd: any[] = await shRes.json()
          for (const s of sd) showerMap.set(Number(s.siteId), s)
        }
      } catch { /* proceed without auth data */ }
    }
  }

  // HOS constants
  const STOP_EVERY_MI = 300      // target fuel stop interval
  const DRIVE_BREAK_MIN = 480    // 8h drive → mandatory 30-min break
  const BREAK_MIN = 30
  const AVG_FUEL_STOP_MIN = 15   // quick fuel only
  const SHOWER_STOP_MIN = 30     // shower + meal

  // Precompute route position + diesel price once per corridor store, so stop
  // selection below can compare price across every candidate in a window
  // instead of just taking the first one encountered going down the route.
  const enriched = corridor.map(loc => {
    const pt = { lat: loc.latitude, lon: loc.longitude }
    const miFromOrigin = Math.round(routeT(pt, originCoord, destCoord) * totalMiles)
    const pd = priceMap.get(loc.siteId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fp: any[] = pd?.fuelPrices || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const diesel = fp.find((f: any) => f.type?.toUpperCase().includes('DIESEL') || f.name?.toUpperCase().includes('DIESEL'))
    return { loc, miFromOrigin, dieselPrice: diesel ? Number(diesel.price) : null }
  })

  let lastStopMi = 0
  let timeMs = depart.getTime()
  let driveMin = 0
  let onDutyMin = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stops: any[] = []
  const used = new Set<number>()

  for (;;) {
    // Cheapest diesel among stores within the target-interval window; falls
    // back to the nearest past-threshold store if nothing in-window has
    // price data (or nothing falls in-window at all) — same reachability
    // guarantee the old "first past threshold" logic gave, just price-aware
    // when there's a real choice.
    const windowLow = lastStopMi + STOP_EVERY_MI * 0.70
    const windowHigh = lastStopMi + STOP_EVERY_MI * 1.30
    const inWindow = enriched.filter((e, i) => !used.has(i) && e.miFromOrigin >= windowLow && e.miFromOrigin <= windowHigh)
    let chosenIdx = -1
    if (inWindow.length > 0) {
      const priced = inWindow.filter(e => e.dieselPrice != null)
      const pool = priced.length > 0 ? priced : inWindow
      const cheapest = pool.reduce((a, b) => (b.dieselPrice ?? Infinity) < (a.dieselPrice ?? Infinity) ? b : a)
      chosenIdx = enriched.indexOf(cheapest)
    } else {
      chosenIdx = enriched.findIndex((e, i) => !used.has(i) && e.miFromOrigin >= windowLow)
    }
    if (chosenIdx === -1) break
    used.add(chosenIdx)

    const { loc, miFromOrigin, dieselPrice } = enriched[chosenIdx]
    const miFromLast = miFromOrigin - lastStopMi

    const sd = showerMap.get(loc.siteId)
    const showersAvail = sd?.active && sd?.availableShowers > 0
    const hasRestaurant = (loc.restaurants || []).length > 0
    const addr = (loc.addresses || []).find((a: { addressTypeName?: string }) => a.addressTypeName === 'Physical')

    // Drive to this stop
    const legMin = (miFromLast / avgSpeed) * 60
    timeMs += legMin * 60 * 1000
    driveMin += legMin
    onDutyMin += legMin

    const mandatoryBreak = driveMin >= DRIVE_BREAK_MIN
    const isShowerStop = showersAvail && hasRestaurant && !mandatoryBreak
    const stopMin = mandatoryBreak ? BREAK_MIN : isShowerStop ? SHOWER_STOP_MIN : AVG_FUEL_STOP_MIN

    let stopType: string
    if (mandatoryBreak && showersAvail) stopType = 'Mandatory break — shower + meal'
    else if (mandatoryBreak) stopType = 'Mandatory 30-min break (HOS)'
    else if (isShowerStop) stopType = 'Fuel + shower + meal'
    else stopType = 'Fuel stop'

    stops.push({
      siteId: loc.siteId,
      name: loc.preferredName || loc.name || `Store #${loc.number}`,
      city: addr?.city || loc.city || '',
      state: addr?.state || loc.state || '',
      address: addr ? `${addr.address1}, ${addr.city}, ${addr.state} ${addr.zip}` : null,
      miFromOrigin,
      miFromLast,
      eta: new Date(timeMs).toISOString(),
      stopType,
      stopMin,
      recommended: mandatoryBreak || isShowerStop,
      diesel: dieselPrice,
      showers: sd ? { available: sd.availableShowers, total: sd.totalShowers, queued: sd.numInQueue, active: sd.active } : null,
      hasRestaurant,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      restaurants: (loc.restaurants || []).slice(0, 4).map((r: any) => r.name),
      driveHrsSoFar: (driveMin / 60).toFixed(1),
      onDutyHrsSoFar: (onDutyMin / 60).toFixed(1),
    })

    lastStopMi = miFromOrigin
    timeMs += stopMin * 60 * 1000
    onDutyMin += stopMin
    if (mandatoryBreak) driveMin = 0 // break resets 8-hr drive clock
  }

  // Final leg
  const remMi = totalMiles - lastStopMi
  timeMs += (remMi / avgSpeed) * 60 * 60 * 1000

  return NextResponse.json({
    origin: { query: originQ, ...originCoord },
    destination: { query: destQ, ...destCoord },
    totalMiles,
    departTime: depart.toISOString(),
    estArrival: new Date(timeMs).toISOString(),
    estDriveHours: (totalMiles / avgSpeed).toFixed(1),
    stops,
    loadNumber,
    corridorStores: corridor.length,
  })
}
