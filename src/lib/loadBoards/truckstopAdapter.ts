/**
 * truckstopAdapter.ts — Truckstop (truckstop.com) Load Board Adapter
 *
 * Truckstop.com — second largest load board in North America.
 *
 * Auth:      OAuth 2.0 (Resource Owner Password Grant or Auth Code)
 * Base URL:  https://api.truckstop.com (production)
 * Token URL: https://identity.truckstop.com/connect/token
 * Docs:      https://developer.truckstop.com
 *
 * API version: v2 (loads), v3 (Rate Insights)
 *
 * Endpoints used:
 *   POST {tokenUrl}/connect/token          → get OAuth token
 *   POST /v2/loads/search                  → search loads
 *   GET  /v2/loads/{id}                    → get single load
 *   POST /v2/loads                         → post a load (broker)
 *   PUT  /v2/loads/{id}                    → update/refresh a load
 *   DELETE /v2/loads/{id}                  → delete a load posting
 *   POST /v2/equipment                     → post a truck
 *   GET  /v3/rateinsights                  → Rate Insights (market data)
 *   POST /v2/loads/{id}/book               → tender / book a load
 */

import type {
  LoadBoardAdapter, LoadBoardCredentials, LoadSearchParams,
  NormalizedLoad, TruckPosting, MarketRate, EquipmentType,
} from './types'

const BASE_URL  = 'https://api.truckstop.com'
const TOKEN_URL = 'https://identity.truckstop.com/connect/token'

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAccessToken(creds: LoadBoardCredentials): Promise<string | null> {
  if (creds.accessToken && creds.tokenExpires && new Date(creds.tokenExpires) > new Date()) {
    return creds.accessToken
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'password',
      username:   creds.username ?? '',
      password:   creds.password ?? '',
      client_id:  creds.clientId ?? '',
      scope:      'openid profile',
    })
    if (creds.clientSecret) params.set('client_secret', creds.clientSecret)

    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token ?? null
  } catch { return null }
}

// ── Map Truckstop load → NormalizedLoad ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoad(raw: any): NormalizedLoad {
  const origin  = raw.origin  ?? raw.pickupLocation  ?? {}
  const dest    = raw.destination ?? raw.deliveryLocation ?? {}
  const contact = raw.posterContact ?? raw.brokerContact ?? {}
  const rate    = raw.rate ?? raw.freight?.rate ?? {}

  return {
    boardLoadId:   String(raw.id ?? raw.loadId ?? ''),
    board:         'truckstop',
    externalUrl:   `https://truckstop.com/load/${raw.id}`,

    origin: {
      city:       origin.city ?? '',
      state:      origin.state ?? origin.stateCode ?? '',
      zip:        origin.zip ?? origin.postalCode,
      lat:        origin.latitude,
      lng:        origin.longitude,
      earlyDate:  origin.pickupEarlyDate ?? origin.earlyDate,
      lateDate:   origin.pickupLateDate  ?? origin.lateDate,
      earlyTime:  origin.pickupEarlyTime,
      lateTime:   origin.pickupLateTime,
    },
    destination: {
      city:       dest.city ?? '',
      state:      dest.state ?? dest.stateCode ?? '',
      zip:        dest.zip ?? dest.postalCode,
      lat:        dest.latitude,
      lng:        dest.longitude,
      earlyDate:  dest.deliveryEarlyDate,
      lateDate:   dest.deliveryLateDate,
    },

    deadheadMiles: raw.deadheadMiles,
    tripMiles:     raw.loadedMiles ?? raw.mileage,

    weight:        raw.weight,
    length:        raw.length,
    commodity:     raw.commodity ?? raw.description,
    equipmentType: mapEquipment(raw.equipmentType ?? raw.equipment?.type),
    fullOrPartial:  raw.loadType === 'TL' ? 'FTL' : raw.loadType === 'LTL' ? 'LTL' : 'FTL',

    rate:        rate.amount ?? rate.totalRate,
    ratePerMile: rate.perMile ?? rate.ratePerMile,
    rateBasis:   rate.basis?.toLowerCase() as 'flat' | 'per_mile' | 'negotiable' ?? 'negotiable',
    currency:    'USD',

    brokerName:     contact.companyName ?? contact.name,
    brokerPhone:    contact.phone ?? contact.phoneNumber,
    brokerEmail:    contact.email,
    brokerMcNumber: contact.mcNumber ?? raw.posterMcNumber,

    postedAt:  raw.postedAt ?? raw.created,
    expiresAt: raw.expiresAt ?? raw.expiration,

    marketRate: raw.rateInsight?.bookRate?.perMile,
    vsDayAvg:   raw.rateInsight?.bookRate?.percentDiff,
  }
}

function mapEquipment(raw: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    'V': 'V', 'VAN': 'V', 'DRY': 'V', 'DRYVAN': 'V',
    'R': 'R', 'REEFER': 'R', 'REFRIGERATED': 'R',
    'F': 'F', 'FLAT': 'F', 'FLATBED': 'F',
    'SD': 'SD', 'STEPDECK': 'SD', 'STEP': 'SD',
    'RGN': 'RGN',
    'PO': 'PO', 'POWERONLY': 'PO',
    'HS': 'HS', 'HOTSHOT': 'HS',
    'TANK': 'TANK', 'TANKER': 'TANK',
  }
  return map[raw?.toUpperCase()?.replace(/[_\s-]/g, '')] ?? 'V'
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const truckstopAdapter: LoadBoardAdapter = {
  boardId: 'truckstop',

  async searchLoads(params: LoadSearchParams, creds: LoadBoardCredentials): Promise<NormalizedLoad[]> {
    const token = await getAccessToken(creds)
    if (!token) return []

    const base = creds.baseUrl ?? BASE_URL
    const body: Record<string, unknown> = {
      origin: {
        city:         params.originCity,
        state:        params.originState,
        radius:       params.originRadiusMi ?? 50,
        radiusUnit:   'Miles',
      },
      equipmentTypes: params.equipment,
      loadType:       'TL',
      pageSize:       params.limit ?? 25,
      pageNumber:     Math.floor((params.offset ?? 0) / (params.limit ?? 25)) + 1,
    }

    if (params.destState || params.destCity) {
      body.destination = {
        city:       params.destCity,
        state:      params.destState,
        radius:     params.destRadiusMi ?? 100,
        radiusUnit: 'Miles',
      }
    }

    if (params.pickupDateStart) {
      body.pickupDate = {
        earliest: params.pickupDateStart,
        latest:   params.pickupDateEnd ?? params.pickupDateStart,
      }
    }

    if (params.maxDeadheadMiles) {
      body.maxDeadheadMiles = params.maxDeadheadMiles
    }

    try {
      const res = await fetch(`${base}/v2/loads/search`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'User-Agent':    'FleetCommander/1.0',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.loads ?? data.results ?? data.items ?? []).map(mapLoad)
    } catch { return [] }
  },

  async getLoad(boardLoadId: string, creds: LoadBoardCredentials): Promise<NormalizedLoad | null> {
    const token = await getAccessToken(creds)
    if (!token) return null

    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/v2/loads/${boardLoadId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) return null
      return mapLoad(await res.json())
    } catch { return null }
  },

  async bookLoad(boardLoadId: string, creds: LoadBoardCredentials) {
    const token = await getAccessToken(creds)
    if (!token) return { success: false, error: 'Auth failed' }

    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/v2/loads/${boardLoadId}/book`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ status: 'BOOKED' }),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      return { success: true, confirmationId: data.confirmationId ?? data.id }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  },

  async postTruck(truck: TruckPosting, creds: LoadBoardCredentials) {
    const token = await getAccessToken(creds)
    if (!token) return { success: false, error: 'Auth failed' }

    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/v2/equipment`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          equipmentType:    truck.equipment,
          availableDate:    truck.availableDate,
          origin:           { city: truck.originCity, state: truck.originState },
          destinationStates: truck.destStates,
          length:           truck.length,
          comments:         truck.comments,
          contact:          truck.phone ? { phone: truck.phone } : undefined,
        }),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      return { success: true, postingId: data.id }
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
      const url = new URL(`${base}/v3/rateinsights`)
      url.searchParams.set('originState',      origin.toUpperCase())
      url.searchParams.set('destinationState', dest.toUpperCase())
      url.searchParams.set('equipmentType',    equipment)

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) return null
      const d = await res.json()
      const book = d.bookedRate ?? d.bookRate ?? {}
      return {
        board:           'truckstop',
        originState:     origin,
        destState:       dest,
        equipment,
        avgRatePerMile:  book.perMile ?? book.average ?? 0,
        lowRatePerMile:  book.low  ?? 0,
        highRatePerMile: book.high ?? 0,
        dataPoints:      d.sampleSize,
        trend:           d.trend?.direction?.toLowerCase() ?? 'flat',
        trendPct:        d.trend?.percentChange,
        asOf:            new Date().toISOString(),
      }
    } catch { return null }
  },

  getAccessToken,
}
