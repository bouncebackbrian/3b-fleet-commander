export type AppSettings = {
  driverName: string
  dispatcher: string
  defaultCpm: number
  cpmLow: number
  cpmHigh: number
  detentionRate: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  driverName: '',
  dispatcher: 'Trev',
  defaultCpm: 0.55,
  cpmLow: 0.50,
  cpmHigh: 0.55,
  detentionRate: 50,
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
