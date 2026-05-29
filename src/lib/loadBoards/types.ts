/**
 * loadBoards/types.ts — Normalized types for all load board adapters
 *
 * Every board (DAT, Truckstop, 123LB, etc.) maps its native response
 * to these shared types. Components only ever see NormalizedLoad —
 * never board-specific shapes.
 */

// ── Board identifiers ─────────────────────────────────────────────────────────

export type LoadBoardId =
  | 'dat'
  | 'truckstop'
  | '123loadboard'
  | 'loadsmart'
  | 'uber_freight'
  | 'amazon_relay'
  | 'generic'

export const BOARD_META: Record<LoadBoardId, { label: string; url: string; logoEmoji: string; color: string }> = {
  dat:           { label: 'DAT',           url: 'dat.com',             logoEmoji: '🔵', color: '#1e40af' },
  truckstop:     { label: 'Truckstop',     url: 'truckstop.com',       logoEmoji: '🟠', color: '#ea580c' },
  '123loadboard':{ label: '123Loadboard',  url: '123loadboard.com',    logoEmoji: '🟢', color: '#16a34a' },
  loadsmart:     { label: 'Loadsmart',     url: 'loadsmart.com',       logoEmoji: '🟣', color: '#7c3aed' },
  uber_freight:  { label: 'Uber Freight',  url: 'uberfreight.com',     logoEmoji: '⚫', color: '#18181b' },
  amazon_relay:  { label: 'Amazon Relay',  url: 'relay.amazon.com',    logoEmoji: '🟡', color: '#ca8a04' },
  generic:       { label: 'Custom Board',  url: '',                    logoEmoji: '📦', color: '#6b7280' },
}

// ── Equipment types ───────────────────────────────────────────────────────────

export type EquipmentType =
  | 'V'    // Van / dry van
  | 'R'    // Reefer
  | 'F'    // Flatbed
  | 'SD'   // Step deck
  | 'RGN'  // Removable gooseneck
  | 'DD'   // Double drop
  | 'LB'   // Lowboy
  | 'PO'   // Power only
  | 'HS'   // Hot shot
  | 'TANK' // Tanker
  | 'AUTO' // Auto carrier
  | 'VO'   // Van + open / combo

// ── Normalized load (common across all boards) ────────────────────────────────

export interface LoadLocation {
  city:        string
  state:       string
  zip?:        string
  lat?:        number
  lng?:        number
  earlyDate?:  string   // ISO
  lateDate?:   string   // ISO
  earlyTime?:  string   // HH:MM
  lateTime?:   string   // HH:MM
}

export interface NormalizedLoad {
  // Identity
  boardLoadId:    string          // ID on the source board
  board:          LoadBoardId
  externalUrl?:   string          // link back to the load on that board

  // Lane
  origin:         LoadLocation
  destination:    LoadLocation
  deadheadMiles?: number          // miles to pickup from current location
  tripMiles?:     number          // loaded miles

  // Cargo
  weight?:        number          // lbs
  length?:        number          // feet
  commodity?:     string
  equipmentType:  EquipmentType
  fullOrPartial:  'FTL' | 'LTL' | 'PARTIAL'

  // Rate
  rate?:          number          // posted rate $
  ratePerMile?:   number          // $/mile
  rateBasis?:     'flat' | 'per_mile' | 'negotiable'
  currency:       string

  // Broker / poster
  brokerName?:    string
  brokerPhone?:   string
  brokerEmail?:   string
  brokerMcNumber?: string
  brokerDotNumber?: string

  // Status
  postedAt?:      string          // ISO
  expiresAt?:     string          // ISO
  bookedAt?:      string          // set when we book it

  // Market context
  marketRate?:    number          // avg rate for this lane (from board's rate intelligence)
  vsDayAvg?:      number          // % vs 24h avg (positive = above market)

  // FC internal
  savedToFleet?:  boolean         // true once fleet_loads record created
  fleetLoadId?:   string          // FK to fleet_loads.id once saved
}

// ── Load search params ────────────────────────────────────────────────────────

export interface LoadSearchParams {
  // Origin filter
  originCity?:     string
  originState?:    string
  originLat?:      number
  originLng?:      number
  originRadiusMi?: number          // default 50

  // Destination filter (optional — omit for all destinations)
  destCity?:       string
  destState?:      string
  destLat?:        number
  destLng?:        number
  destRadiusMi?:   number

  // Equipment
  equipment:       EquipmentType[]

  // Dates
  pickupDateStart?: string         // ISO date
  pickupDateEnd?:   string

  // Rate filter
  minRate?:         number
  maxWeight?:       number

  // Carrier
  maxDeadheadMiles?: number

  // Pagination
  limit?:           number         // default 25
  offset?:          number
}

// ── Truck posting ─────────────────────────────────────────────────────────────

export interface TruckPosting {
  equipment:        EquipmentType
  availableDate:    string          // ISO
  originCity:       string
  originState:      string
  originLat?:       number
  originLng?:       number
  destStates?:      string[]        // preferred destination states
  length?:          number
  weight?:          number
  comments?:        string
  driverName?:      string
  phone?:           string
}

// ── Market rate data ──────────────────────────────────────────────────────────

export interface MarketRate {
  board:            LoadBoardId
  originState:      string
  destState:        string
  equipment:        EquipmentType
  avgRatePerMile:   number
  lowRatePerMile:   number
  highRatePerMile:  number
  avgTripMiles?:    number
  dataPoints?:      number          // sample size
  trend?:           'up' | 'down' | 'flat'
  trendPct?:        number          // % change vs prior period
  asOf:             string          // ISO — when this data was pulled
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface LoadBoardCredentials {
  boardId:       LoadBoardId
  authType:      'api_key' | 'oauth2_password' | 'oauth2_code' | 'basic'
  clientId?:     string
  clientSecret?: string
  apiKey?:       string
  username?:     string
  password?:     string
  baseUrl?:      string            // override default
  accessToken?:  string           // cached OAuth token
  tokenExpires?: string           // ISO — when to refresh
}

export interface LoadBoardAdapter {
  boardId:       LoadBoardId
  searchLoads(params: LoadSearchParams, creds: LoadBoardCredentials): Promise<NormalizedLoad[]>
  getLoad(boardLoadId: string, creds: LoadBoardCredentials): Promise<NormalizedLoad | null>
  bookLoad?(boardLoadId: string, creds: LoadBoardCredentials): Promise<{ success: boolean; confirmationId?: string; error?: string }>
  postTruck?(truck: TruckPosting, creds: LoadBoardCredentials): Promise<{ success: boolean; postingId?: string }>
  getMarketRates?(origin: string, dest: string, equipment: EquipmentType, creds: LoadBoardCredentials): Promise<MarketRate | null>
  getAccessToken?(creds: LoadBoardCredentials): Promise<string | null>
}

// ── Search result wrapper ─────────────────────────────────────────────────────

export interface LoadBoardSearchResult {
  board:       LoadBoardId
  loads:       NormalizedLoad[]
  total:       number
  fetchedAt:   string
  error?:      string            // if partial failure
}
