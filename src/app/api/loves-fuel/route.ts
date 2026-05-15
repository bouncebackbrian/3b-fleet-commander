import { NextRequest, NextResponse } from 'next/server'

const PRODUCT_CODES = '20'

function distMi(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

let tokenCache: { value: string; exp: number } | null = null

async function getToken(apiUrl: string, clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.value
  const tokenUrl = process.env.LOVES_TOKEN_URL || `${apiUrl}/oauth/token`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`)
  const j = await res.json()
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
  return tokenCache.value
}

export async function GET(req: NextRequest) {
  const apiUrl = process.env.LOVES_API_URL
  if (!apiUrl) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const clientId = process.env.LOVES_CLIENT_ID
  const clientSecret = process.env.LOVES_CLIENT_SECRET
  const useAuth = Boolean(clientId && clientSecret)

  const sp = new URL(req.url).searchParams
  const lat = parseFloat(sp.get('lat') || 'NaN')
  const lng = parseFloat(sp.get('lng') || 'NaN')

  try {
    const authHeader: Record<string, string> = useAuth
      ? { Authorization: `Bearer ${await getToken(apiUrl, clientId!, clientSecret!)}` }
      : {}

    // Fetch prices + locations in parallel (locations has no auth requirement)
    const [pricesRes, locationsRes] = await Promise.all([
      fetch(`${apiUrl}/fuelPrices?productCodes=${PRODUCT_CODES}`, {
        headers: authHeader,
        next: { revalidate: 1800 },
      }),
      fetch(`${apiUrl}/locations?facilityTypeName=Store`, {
        next: { revalidate: 86400 },
      }),
    ])

    if (!pricesRes.ok) throw new Error(`fuelPrices: ${pricesRes.status}`)
    if (!locationsRes.ok) throw new Error(`locations: ${locationsRes.status}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices: any[] = await pricesRes.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locations: any[] = await locationsRes.json()

    // Build siteId → location map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locMap = new Map<number, any>()
    for (const loc of locations) locMap.set(loc.siteId, loc)

    // Build initial results with distance
    const results = prices
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fp: any[] = p.fuelPrices || []
        if (!fp.length) return null
        const loc = locMap.get(p.siteId)
        const addr = loc?.addresses?.find((a: { addressTypeName?: string }) => a.addressTypeName === 'Physical')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const diesel = fp.find((f: any) => f.type?.toUpperCase().includes('DIESEL') || f.name?.toUpperCase().includes('DIESEL'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reefer = fp.find((f: any) => f.category?.toLowerCase().includes('reefer') || f.name?.toLowerCase().includes('reefer'))
        const storeLat = loc?.latitude
        const storeLng = loc?.longitude
        const miles = (!isNaN(lat) && !isNaN(lng) && storeLat != null && storeLng != null)
          ? distMi(lat, lng, storeLat, storeLng)
          : null
        return {
          siteId: p.siteId,
          name: loc?.preferredName || loc?.name || `Store #${p.storeNumber}`,
          city: addr?.city || loc?.city || '',
          state: addr?.state || loc?.state || '',
          address: addr ? `${addr.address1}, ${addr.city}, ${addr.state} ${addr.zip}` : null,
          miles,
          diesel: diesel ? Number(diesel.price) : null,
          reefer: reefer ? Number(reefer.price) : null,
          showers: null as { total: number; available: number; queued: number; active: boolean } | null,
        }
      })
      .filter(Boolean)

    // Sort by distance, take top 20
    if (!isNaN(lat) && !isNaN(lng)) {
      results.sort((a, b) => (a!.miles ?? 9999) - (b!.miles ?? 9999))
    }
    const top = results.slice(0, 20)

    // Fetch shower status for these siteIds
    const siteIds = top.map(s => s!.siteId).join(',')
    if (siteIds) {
      try {
        const showersRes = await fetch(`${apiUrl}/showers/status?siteIds=${siteIds}`, {
          headers: authHeader,
          next: { revalidate: 300 },
        })
        if (showersRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const showerData: any[] = await showersRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const showerMap = new Map<string, any>()
          for (const s of showerData) showerMap.set(String(s.siteId), s)
          for (const store of top) {
            const sd = showerMap.get(String(store!.siteId))
            if (sd) {
              store!.showers = {
                total: sd.totalShowers,
                available: sd.availableShowers,
                queued: sd.numInQueue,
                active: sd.active,
              }
            }
          }
        }
      } catch {
        // Shower data is optional — don't fail the whole request
      }
    }

    return NextResponse.json(top)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
