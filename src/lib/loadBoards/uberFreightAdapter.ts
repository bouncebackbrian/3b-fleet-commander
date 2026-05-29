/**
 * uberFreightAdapter.ts — Uber Freight API Adapter
 *
 * Uber Freight (uberfreight.com) — carrier & shipper marketplace.
 *
 * Auth:      OAuth 2.0 (client_credentials)
 * Base URL:  https://api.uberfreight.com
 * Token URL: https://auth.uberfreight.com/oauth/token
 * Docs:      https://developer.uberfreight.com
 *
 * Key endpoints:
 *   POST {tokenUrl}/oauth/token       → get access token
 *   GET  /loads/v1                    → list available loads
 *   GET  /loads/v1/{id}               → get load detail
 *   POST /loads/v1/{id}/bid           → submit bid / book load
 *   GET  /market/v1/rates             → market rate data
 */

import type {
  LoadBoardAdapter, LoadBoardCredentials, LoadSearchParams,
  NormalizedLoad, MarketRate, EquipmentType,
} from './types'

const BASE_URL  = 'https://api.uberfreight.com'
const TOKEN_URL = 'https://auth.uberfreight.com/oauth/token'

async function getAccessToken(creds: LoadBoardCredentials): Promise<string | null> {
  if (creds.accessToken && creds.tokenExpires && new Date(creds.tokenExpires) > new Date()) {
    return creds.accessToken
  }
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     creds.clientId     ?? '',
        client_secret: creds.clientSecret ?? '',
        scope:         'loads:read loads:write',
      }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token ?? null
  } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoad(raw: any): NormalizedLoad {
  const pickup   = raw.pickup   ?? raw.origin      ?? {}
  const dropoff  = raw.dropoff  ?? raw.destination ?? {}

  return {
    boardLoadId:   String(raw.id ?? raw.load_id ?? ''),
    board:         'uber_freight',
    externalUrl:   `https://carrier.uberfreight.com/loads/${raw.id}`,
    origin: {
      city:      pickup.city  ?? '',
      state:     pickup.state ?? '',
      zip:       pickup.postal_code,
      lat:       pickup.lat,
      lng:       pickup.lng,
      earlyDate: pickup.earliest_time ?? pickup.date,
      lateDate:  pickup.latest_time,
    },
    destination: {
      city:      dropoff.city  ?? '',
      state:     dropoff.state ?? '',
      zip:       dropoff.postal_code,
    },
    tripMiles:     raw.distance ?? raw.miles,
    weight:        raw.weight_lbs ?? raw.weight,
    commodity:     raw.commodity ?? raw.freight_description,
    equipmentType: mapEquipment(raw.trailer_type ?? raw.equipment),
    fullOrPartial:  'FTL',
    rate:        raw.rate ?? raw.offer_rate,
    ratePerMile: raw.rate_per_mile,
    rateBasis:   'flat',
    currency:    'USD',
    brokerName:  raw.shipper_name ?? 'Uber Freight',
    postedAt:    raw.created_at ?? raw.available_at,
  }
}

function mapEquipment(raw: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    'DRY_VAN': 'V', 'VAN': 'V', 'REEFER': 'R', 'REFRIGERATED': 'R',
    'FLATBED': 'F', 'FLAT': 'F', 'STEP_DECK': 'SD', 'POWER_ONLY': 'PO',
  }
  return map[raw?.toUpperCase()] ?? 'V'
}

export const uberFreightAdapter: LoadBoardAdapter = {
  boardId: 'uber_freight',

  async searchLoads(params: LoadSearchParams, creds: LoadBoardCredentials): Promise<NormalizedLoad[]> {
    const token = await getAccessToken(creds)
    if (!token) return []

    const base  = creds.baseUrl ?? BASE_URL
    const query = new URLSearchParams({
      origin_state:    params.originState ?? '',
      equipment_types: params.equipment.join(','),
      limit:           String(params.limit ?? 25),
    })
    if (params.destState)       query.set('destination_state', params.destState)
    if (params.pickupDateStart) query.set('available_from', params.pickupDateStart)
    if (params.maxDeadheadMiles) query.set('max_deadhead_miles', String(params.maxDeadheadMiles))

    try {
      const res = await fetch(`${base}/loads/v1?${query}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.loads ?? data.results ?? []).map(mapLoad)
    } catch { return [] }
  },

  async getLoad(boardLoadId: string, creds: LoadBoardCredentials): Promise<NormalizedLoad | null> {
    const token = await getAccessToken(creds)
    if (!token) return null
    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/loads/v1/${boardLoadId}`, {
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
      const res = await fetch(`${base}/loads/v1/${boardLoadId}/bid`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'BOOK_NOW' }),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      return { success: true, confirmationId: data.booking_id ?? data.id }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Error' }
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
      const res = await fetch(
        `${base}/market/v1/rates?origin_state=${origin}&destination_state=${dest}&equipment=${equipment}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (!res.ok) return null
      const d = await res.json()
      return {
        board: 'uber_freight', originState: origin, destState: dest, equipment,
        avgRatePerMile:  d.average_rate_per_mile ?? 0,
        lowRatePerMile:  d.low_rate_per_mile  ?? 0,
        highRatePerMile: d.high_rate_per_mile ?? 0,
        dataPoints:      d.data_points,
        asOf:            new Date().toISOString(),
      }
    } catch { return null }
  },

  getAccessToken,
}
