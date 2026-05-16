import { NextResponse } from 'next/server'

const BASE = 'https://api.samsara.com'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sGet(path: string, token: string, cache: number = 60): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: cache },
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

function msToHrs(ms: number) { return Math.max(0, ms / 3_600_000) }

function startOfDayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function GET(request: Request) {
  // Accept token from env var (server-side, preferred) OR x-samsara-token header (user-entered in Settings)
  const token = process.env.SAMSARA_API_TOKEN || request.headers.get('x-samsara-token')
  if (!token) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  try {
    // HOS clocks + vehicle locations in parallel (live data, short cache)
    const [hosResult, locResult] = await Promise.allSettled([
      sGet('/fleet/hos/clocks', token, 30),
      sGet('/fleet/vehicles/locations?types=gps&includeReverseGeo=true', token, 15),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hosRaw = hosResult.status === 'fulfilled' ? hosResult.value : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locRaw = locResult.status === 'fulfilled' ? locResult.value : null

    // --- Parse HOS (first/only driver) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hosEntry: any = (hosRaw?.data ?? [])[0] ?? null
    const hos = hosEntry ? {
      driverName: hosEntry.driver?.name ?? null,
      driverId: hosEntry.driver?.id ?? null,
      status: hosEntry.currentDutyStatus?.hosStatusType ?? null,
      statusSince: hosEntry.currentDutyStatus?.startTime ?? null,
      // Remaining times in hours
      driveRemainingHrs: msToHrs(hosEntry.clocks?.drive?.driveRemainingDurationMs ?? 39_600_000),
      shiftRemainingHrs: msToHrs(hosEntry.clocks?.shift?.shiftRemainingDurationMs ?? 50_400_000),
      breakInHrs: hosEntry.clocks?.break?.timeUntilBreakDurationMs != null
        ? msToHrs(hosEntry.clocks.break.timeUntilBreakDurationMs)
        : null,
      cycleRemainingHrs: msToHrs(hosEntry.clocks?.cycle?.cycleRemainingDurationMs ?? 252_000_000),
    } : null

    // --- Parse vehicle location (first vehicle) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehEntry: any = (locRaw?.data ?? [])[0] ?? null
    const location = vehEntry ? {
      vehicleId: vehEntry.id ?? null,
      vehicleName: vehEntry.name ?? null,
      lat: vehEntry.location?.latitude ?? vehEntry.gps?.latitude ?? null,
      lng: vehEntry.location?.longitude ?? vehEntry.gps?.longitude ?? null,
      speedMph: vehEntry.location?.speed ?? vehEntry.gps?.speedMilesPerHour ?? null,
      headingDeg: vehEntry.location?.heading ?? vehEntry.gps?.headingDegrees ?? null,
      address: vehEntry.location?.reverseGeo?.formattedLocation ?? vehEntry.gps?.reverseGeo?.formattedLocation ?? null,
      updatedAt: vehEntry.location?.time ?? vehEntry.gps?.time ?? null,
    } : null

    // --- Today's miles via stats history ---
    let todayMiles: number | null = null
    if (location?.vehicleId) {
      try {
        const startTime = startOfDayISO()
        const endTime = new Date().toISOString()
        const statsUrl = `/fleet/vehicles/stats/history?types=gpsDistanceMeters&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&vehicleIds=${location.vehicleId}`
        const statsRaw = await sGet(statsUrl, token, 300)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vehicleStats: any = (statsRaw?.results ?? statsRaw?.data ?? [])[0]
        const points: { value: number }[] = vehicleStats?.gpsDistanceMeters ?? []
        if (points.length >= 2) {
          const first = points[0].value
          const last = points[points.length - 1].value
          todayMiles = Math.round((last - first) * 0.000621371)
        } else if (points.length === 1) {
          todayMiles = Math.round(points[0].value * 0.000621371)
        }
      } catch { /* not critical */ }
    }

    return NextResponse.json({
      hos,
      location,
      todayMiles,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
