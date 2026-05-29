/**
 * loadsmartAdapter.ts — Loadsmart API Adapter
 *
 * Loadsmart (loadsmart.com) — digital freight brokerage with open API.
 *
 * Auth:      API Key in Authorization header
 * Base URL:  https://api.loadsmart.com
 * Docs:      https://developers.loadsmart.com
 *
 * Key endpoints:
 *   POST /pricing/v1/quotes          → instant rate quote
 *   GET  /tracking/v1/shipments      → load search / available loads
 *   POST /booking/v1/shipments       → book a load
 */

import type {
  LoadBoardAdapter, LoadBoardCredentials, LoadSearchParams,
  NormalizedLoad, TruckPosting, MarketRate, EquipmentType,
} from './types'

const BASE_URL = 'https://api.loadsmart.com'

function authHeaders(creds: LoadBoardCredentials): Record<string, string> {
  return {
    'Authorization': creds.apiKey ? `Token ${creds.apiKey}` : `Bearer ${creds.accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoad(raw: any): NormalizedLoad {
  return {
    boardLoadId:   String(raw.id ?? raw.shipment_id ?? ''),
    board:         'loadsmart',
    externalUrl:   `https://app.loadsmart.com/shipment/${raw.id}`,
    origin: {
      city:      raw.pickup?.city ?? raw.origin?.city ?? '',
      state:     raw.pickup?.state ?? raw.origin?.state ?? '',
      zip:       raw.pickup?.zip,
      earlyDate: raw.pickup?.date ?? raw.pickup_date,
      earlyTime: raw.pickup?.time,
    },
    destination: {
      city:      raw.delivery?.city ?? raw.destination?.city ?? '',
      state:     raw.delivery?.state ?? raw.destination?.state ?? '',
      zip:       raw.delivery?.zip,
    },
    tripMiles:     raw.distance_miles ?? raw.miles,
    weight:        raw.weight,
    commodity:     raw.commodity,
    equipmentType: (raw.equipment_type?.toUpperCase() as EquipmentType) ?? 'V',
    fullOrPartial:  raw.load_type === 'LTL' ? 'LTL' : 'FTL',
    rate:        raw.price ?? raw.rate,
    ratePerMile: raw.rate_per_mile,
    rateBasis:   'flat',
    currency:    'USD',
    brokerName:  'Loadsmart',
    postedAt:    raw.created_at ?? raw.posted_at,
  }
}

export const loadsmartAdapter: LoadBoardAdapter = {
  boardId: 'loadsmart',

  async searchLoads(params: LoadSearchParams, creds: LoadBoardCredentials): Promise<NormalizedLoad[]> {
    const base = creds.baseUrl ?? BASE_URL
    try {
      const query = new URLSearchParams({
        pickup_state:   params.originState ?? '',
        equipment_type: params.equipment[0] ?? 'V',
        limit:          String(params.limit ?? 25),
      })
      if (params.destState) query.set('delivery_state', params.destState)
      if (params.pickupDateStart) query.set('pickup_date', params.pickupDateStart)

      const res = await fetch(`${base}/tracking/v1/shipments?${query}`, {
        headers: authHeaders(creds),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.results ?? data.shipments ?? []).map(mapLoad)
    } catch { return [] }
  },

  async getLoad(boardLoadId: string, creds: LoadBoardCredentials): Promise<NormalizedLoad | null> {
    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/tracking/v1/shipments/${boardLoadId}`, {
        headers: authHeaders(creds),
      })
      if (!res.ok) return null
      return mapLoad(await res.json())
    } catch { return null }
  },

  async bookLoad(boardLoadId: string, creds: LoadBoardCredentials) {
    const base = creds.baseUrl ?? BASE_URL
    try {
      const res = await fetch(`${base}/booking/v1/shipments/${boardLoadId}/book`, {
        method: 'POST',
        headers: authHeaders(creds),
        body: JSON.stringify({ status: 'BOOKED' }),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      return { success: true, confirmationId: data.id ?? data.confirmation_id }
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
      const res = await fetch(`${base}/pricing/v1/quotes`, {
        method: 'POST',
        headers: authHeaders(creds),
        body: JSON.stringify({
          pickup:   { state: origin },
          delivery: { state: dest },
          equipment_type: equipment,
        }),
      })
      if (!res.ok) return null
      const d = await res.json()
      return {
        board:           'loadsmart',
        originState:     origin,
        destState:       dest,
        equipment,
        avgRatePerMile:  d.rate_per_mile ?? d.price_per_mile ?? 0,
        lowRatePerMile:  d.min_rate_per_mile ?? 0,
        highRatePerMile: d.max_rate_per_mile ?? 0,
        asOf:            new Date().toISOString(),
      }
    } catch { return null }
  },
}
