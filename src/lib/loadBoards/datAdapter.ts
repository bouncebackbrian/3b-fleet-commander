/**
 * datAdapter.ts — DAT Load Board Adapter
 *
 * DAT Solutions (dat.com) — largest load board in North America.
 * ~200M+ loads posted annually.
 *
 * Auth:      OAuth 2.0 (Resource Owner Password Credentials)
 * Base URL:  https://gateway.dat.com
 * Docs:      https://developer.dat.com (requires DAT account)
 *
 * Endpoints used:
 *   POST /freight/login                  → get access token
 *   POST /freight/search/loads           → search loads
 *   GET  /freight/loads/{id}             → get single load
 *   POST /freight/posting/loads          → post a load (broker)
 *   POST /freight/posting/equipment      → post a truck (carrier)
 *   POST /freight/ratecalculator/rate    → get rate estimate
 */

import type {
  LoadBoardAdapter, LoadBoardCredentials, LoadSearchParams,
  NormalizedLoad, TruckPosting, MarketRate, EquipmentType,
} from './types'

const BASE_URL = 'https://gateway.dat.com'

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAccessToken(creds: LoadBoardCredentials): Promise<string | null> {
  if (creds.accessToken && creds.tokenExpires && new Date(creds.tokenExpires) > new Date()) {
    return creds.accessToken  // still valid
  }

  try {
    const base = creds.baseUrl ?? BASE_URL
    const res  = await fetch(`${base}/freight/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username: creds.username,
        password: creds.password,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.token ?? data.access_token ?? null
  } catch { return null }
}

// ── Map DAT load → NormalizedLoad ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoad(raw: any): NormalizedLoad {
  const origin = raw.origin ?? raw.originLocation ?? {}
  const dest   = raw.destination ?? raw.destinationLocation ?? {}

  return {
    boardLoadId:   raw.id ?? raw.loadId ?? String(raw.postingId ?? ''),
    board:         'dat',
    externalUrl:   raw.url ?? `https://www.dat.com/load/${raw.id}`,

    origin: {
      city:       origin.city ?? '',
      state:      origin.stateProv ?? origin.state ?? '',
      zip:        origin.postalCode,
      lat:        origin.latitude,
      lng:        origin.longitude,
      earlyDate:  raw.earliestAvailability ?? raw.pickupDate,
      lateDate:   raw.latestAvailability,
    },
    destination: {
      city:       dest.city ?? '',
      state:      dest.stateProv ?? dest.state ?? '',
      zip:        dest.postalCode,
      lat:        dest.latitude,
      lng:        dest.longitude,
    },

    deadheadMiles: raw.deadheadMileage,
    tripMiles:     raw.mileage ?? raw.loadedMileage,

    weight:        raw.weight,
    length:        raw.length,
    commodity:     raw.commodity,
    equipmentType: mapEquipment(raw.equipmentType ?? raw.equipment),
    fullOrPartial:  raw.fullOrPartial === 'FULL' ? 'FTL' : raw.fullOrPartial === 'PARTIAL' ? 'PARTIAL' : 'FTL',

    rate:        raw.rate?.amount ?? raw.amount,
    ratePerMile: raw.rate?.ratePerMile ?? raw.ratePerMile,
    rateBasis:   raw.rate?.basis?.toLowerCase() as 'flat' | 'per_mile' | 'negotiable' ?? 'negotiable',
    currency:    raw.rate?.currency ?? 'USD',

    brokerName:     raw.contact?.companyName ?? raw.posterName,
    brokerPhone:    raw.contact?.phone,
    brokerEmail:    raw.contact?.email,
    brokerMcNumber: raw.contact?.mcNumber,

    postedAt:  raw.created ?? raw.postedAt,
    expiresAt: raw.expires ?? raw.expiresAt,
  }
}

function mapEquipment(raw: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    'V': 'V', 'VAN': 'V', 'DRY_VAN': 'V',
    'R': 'R', 'REEFER': 'R', 'REFRIGERATED': 'R',
    'F': 'F', 'FLAT': 'F', 'FLATBED': 'F',
    'SD': 'SD', 'STEP_DECK': 'SD',
    'RGN': 'RGN',
    'PO': 'PO', 'POWER_ONLY': 'PO',
    'HS': 'HS', 'HOT_SHOT': 'HS',
    'TANK': 'TANK', 'TANKER': 'TANK',
  }
  return map[raw?.toUpperCase()] ?? 'V'
}

// ── Adapter implementation ────────────────────────────────────────────────────

export const datAdapter: LoadBoardAdapter = {
  boardId: 'dat',

  async searchLoads(params: LoadSearchParams, creds: LoadBoardCredentials): Promise<NormalizedLoad[]> {
    const token = await getAccessToken(creds)
    if (!token) return []

    const base = creds.baseUrl ?? BASE_URL

    const body = {
      searchType: 'LOAD',
      origin: {
        place: {
          city:     params.originCity,
          stateProv: params.originState,
        },
        area: { type: 'OPEN_MILES', miles: params.originRadiusMi ?? 50 },
      },
      destination: params.destState ? {
        place: {
          city:     params.destCity,
          stateProv: params.destState,
        },
        area: { type: 'OPEN_MILES', miles: params.destRadiusMi ?? 100 },
      } : { area: { type: 'ANY' } },
      equipment: {
        types: params.equipment.map(e => e),
      },
      availability: params.pickupDateStart ? {
        earliest: params.pickupDateStart,
        latest:   params.pickupDateEnd ?? params.pickupDateStart,
      } : undefined,
      count: params.limit ?? 25,
      offset: params.offset ?? 0,
    }

    try {
      const res = await fetch(`${base}/freight/search/loads`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'DAT-Application': 'fleet-commander/1.0',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.matchingLoads ?? data.results ?? []).map(mapLoad)
    } catch { return [] }
  },

  async getLoad(boardLoadId: string, creds: LoadBoardCredentials): Promise<NormalizedLoad | null> {
    const token = await getAccessToken(creds)
    if (!token) return null

    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/freight/loads/${boardLoadId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) return null
      return mapLoad(await res.json())
    } catch { return null }
  },

  async postTruck(truck: TruckPosting, creds: LoadBoardCredentials) {
    const token = await getAccessToken(creds)
    if (!token) return { success: false, error: 'Auth failed' }

    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/freight/posting/equipment`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          origin: { place: { city: truck.originCity, stateProv: truck.originState } },
          availability: { earliest: truck.availableDate },
          equipment: { types: [truck.equipment] },
          preferredDestinations: truck.destStates?.map(s => ({ place: { stateProv: s } })),
          comments: truck.comments,
        }),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      return { success: true, postingId: data.id ?? data.postingId }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  },

  async getMarketRates(
    origin: string, dest: string,
    equipment: EquipmentType, creds: LoadBoardCredentials
  ): Promise<MarketRate | null> {
    const token = await getAccessToken(creds)
    if (!token) return null

    const base = creds.baseUrl ?? BASE_URL
    try {
      const [oState, dState] = [origin.toUpperCase(), dest.toUpperCase()]
      const res = await fetch(`${base}/freight/ratecalculator/rate`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          origin:      { place: { stateProv: oState } },
          destination: { place: { stateProv: dState } },
          equipment:   { types: [equipment] },
        }),
      })
      if (!res.ok) return null
      const d = await res.json()
      return {
        board:           'dat',
        originState:     oState,
        destState:       dState,
        equipment,
        avgRatePerMile:  d.ratePerMile?.perMile ?? d.averageRatePerMile ?? 0,
        lowRatePerMile:  d.ratePerMile?.low ?? 0,
        highRatePerMile: d.ratePerMile?.high ?? 0,
        avgTripMiles:    d.mileage,
        trend:           d.trend?.direction?.toLowerCase() ?? 'flat',
        trendPct:        d.trend?.percent,
        asOf:            new Date().toISOString(),
      }
    } catch { return null }
  },

  getAccessToken,
}
