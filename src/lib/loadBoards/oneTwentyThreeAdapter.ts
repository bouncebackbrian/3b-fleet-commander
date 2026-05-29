/**
 * oneTwentyThreeAdapter.ts — 123Loadboard API Adapter
 *
 * 123Loadboard (123loadboard.com) — popular mid-tier load board,
 * strong with owner-ops and small carriers.
 *
 * Auth:      API Key (Bearer token)
 * Base URL:  https://api.123loadboard.com/v2
 * Docs:      https://www.123loadboard.com/api (requires account)
 *
 * Key endpoints:
 *   GET  /loads/search               → search available loads
 *   GET  /loads/{id}                 → load detail
 *   POST /trucks                     → post available truck
 *   GET  /rates                      → market rate data
 */

import type {
  LoadBoardAdapter, LoadBoardCredentials, LoadSearchParams,
  NormalizedLoad, TruckPosting, MarketRate, EquipmentType,
} from './types'

const BASE_URL = 'https://api.123loadboard.com/v2'

function authHeaders(creds: LoadBoardCredentials): Record<string, string> {
  return {
    'Authorization': `Bearer ${creds.apiKey ?? creds.accessToken ?? ''}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoad(raw: any): NormalizedLoad {
  const origin = raw.origin ?? raw.pickup ?? {}
  const dest   = raw.destination ?? raw.delivery ?? {}

  return {
    boardLoadId:   String(raw.id ?? raw.loadId ?? ''),
    board:         '123loadboard',
    externalUrl:   `https://www.123loadboard.com/load/${raw.id}`,
    origin: {
      city:      origin.city  ?? '',
      state:     origin.state ?? origin.stateCode ?? '',
      zip:       origin.zip,
      earlyDate: raw.pickupDate ?? origin.date,
      earlyTime: raw.pickupTime ?? origin.time,
    },
    destination: {
      city:      dest.city  ?? '',
      state:     dest.state ?? dest.stateCode ?? '',
      zip:       dest.zip,
    },
    deadheadMiles: raw.deadheadMiles ?? raw.dh,
    tripMiles:     raw.tripMiles ?? raw.miles ?? raw.mileage,
    weight:        raw.weight,
    length:        raw.length,
    commodity:     raw.commodity ?? raw.description,
    equipmentType: mapEquipment(raw.equipmentType ?? raw.equipment ?? raw.trailer),
    fullOrPartial:  raw.full ? 'FTL' : raw.partial ? 'PARTIAL' : 'FTL',
    rate:        raw.rate ?? raw.amount,
    ratePerMile: raw.ratePerMile ?? raw.rpm,
    rateBasis:   raw.rateBasis?.toLowerCase() ?? 'negotiable',
    currency:    'USD',
    brokerName:  raw.company ?? raw.posterName ?? raw.broker,
    brokerPhone: raw.phone ?? raw.contact?.phone,
    brokerMcNumber: raw.mcNumber ?? raw.mc,
    postedAt:    raw.postedDate ?? raw.posted,
    expiresAt:   raw.expiresDate ?? raw.expires,
  }
}

function mapEquipment(raw: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    'V': 'V', 'VAN': 'V', 'DRYVAN': 'V', 'DV': 'V',
    'R': 'R', 'REEFER': 'R', 'RE': 'R',
    'F': 'F', 'FLAT': 'F', 'FLATBED': 'F', 'FB': 'F',
    'SD': 'SD', 'STEPDECK': 'SD',
    'PO': 'PO', 'POWERONLY': 'PO',
    'HS': 'HS', 'HOTSHOT': 'HS',
    'RGN': 'RGN',
  }
  return map[raw?.toUpperCase()?.replace(/[\s_-]/g, '')] ?? 'V'
}

export const oneTwentyThreeAdapter: LoadBoardAdapter = {
  boardId: '123loadboard',

  async searchLoads(params: LoadSearchParams, creds: LoadBoardCredentials): Promise<NormalizedLoad[]> {
    const base  = creds.baseUrl ?? BASE_URL
    const query = new URLSearchParams({
      originState: params.originState ?? '',
      equipment:   params.equipment.join(','),
      count:       String(params.limit ?? 25),
    })
    if (params.originCity)       query.set('originCity', params.originCity)
    if (params.destState)        query.set('destState', params.destState)
    if (params.destCity)         query.set('destCity', params.destCity)
    if (params.pickupDateStart)  query.set('pickupDate', params.pickupDateStart)
    if (params.maxDeadheadMiles) query.set('maxDH', String(params.maxDeadheadMiles))

    try {
      const res = await fetch(`${base}/loads/search?${query}`, {
        headers: authHeaders(creds),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.loads ?? data.results ?? data.items ?? []).map(mapLoad)
    } catch { return [] }
  },

  async getLoad(boardLoadId: string, creds: LoadBoardCredentials): Promise<NormalizedLoad | null> {
    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/loads/${boardLoadId}`, { headers: authHeaders(creds) })
      if (!res.ok) return null
      return mapLoad(await res.json())
    } catch { return null }
  },

  async postTruck(truck: TruckPosting, creds: LoadBoardCredentials) {
    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/trucks`, {
        method: 'POST',
        headers: authHeaders(creds),
        body: JSON.stringify({
          equipment:     truck.equipment,
          availableDate: truck.availableDate,
          originCity:    truck.originCity,
          originState:   truck.originState,
          destStates:    truck.destStates,
          length:        truck.length,
          comments:      truck.comments,
          phone:         truck.phone,
        }),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      return { success: true, postingId: data.id ?? data.truckId }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Error' }
    }
  },

  async getMarketRates(
    origin: string, dest: string,
    equipment: EquipmentType, creds: LoadBoardCredentials
  ): Promise<MarketRate | null> {
    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(
        `${base}/rates?originState=${origin}&destState=${dest}&equipment=${equipment}`,
        { headers: authHeaders(creds) }
      )
      if (!res.ok) return null
      const d = await res.json()
      return {
        board: '123loadboard', originState: origin, destState: dest, equipment,
        avgRatePerMile:  d.avgRpm ?? d.averageRatePerMile ?? 0,
        lowRatePerMile:  d.lowRpm ?? 0,
        highRatePerMile: d.highRpm ?? 0,
        dataPoints:      d.loads ?? d.sampleSize,
        trend:           d.trend ?? 'flat',
        asOf:            new Date().toISOString(),
      }
    } catch { return null }
  },
}
