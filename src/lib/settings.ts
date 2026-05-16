export type AppSettings = {
  // ── Personal ──────────────────────────────────────
  driverName:   string
  dispatcher:   string
  // ── Vehicle ───────────────────────────────────────
  truckNum:     string
  year:         string
  make:         string
  model:        string
  vin:          string
  hp:           string
  truckHeight:  number
  trailerNum:   string
  trailerType:  string
  trailerLen:   number
  trailerHeight:number
  axles:        string
  maxWeight:    number
  gvwr:         number
  cdlClass:     string
  endorsements: string
  // ── Pay ───────────────────────────────────────────
  cpmReceived:  number   // actual CPM on current contract
  defaultCpm:   number
  cpmLow:       number
  cpmHigh:      number
  detentionRate:number
  // ── Fuel ──────────────────────────────────────────
  mpg:          number   // loaded MPG (feeds MIS)
  mpgLoaded:    number
  mpgEmpty:     number
  tankGal:      number
  fuelPrice:    number
}

export const DEFAULT_SETTINGS: AppSettings = {
  driverName:   '',
  dispatcher:   'Trev',
  truckNum:     '',
  year:         '',
  make:         '',
  model:        '',
  vin:          '',
  hp:           '',
  truckHeight:  13.5,
  trailerNum:   '',
  trailerType:  '53dry',
  trailerLen:   53,
  trailerHeight:13.5,
  axles:        '5',
  maxWeight:    80000,
  gvwr:         80000,
  cdlClass:     'A',
  endorsements: '',
  cpmReceived:  0.55,
  defaultCpm:   0.55,
  cpmLow:       0.50,
  cpmHigh:      0.55,
  detentionRate:50,
  mpg:          6.5,
  mpgLoaded:    6.2,
  mpgEmpty:     8.0,
  tankGal:      120,
  fuelPrice:    4.00,
}

const KEY = '3b-fleet-settings'

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function persistSettings(s: AppSettings): void {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s))
}
