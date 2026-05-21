/**
 * Driver Mode helpers — safe to call outside React.
 *
 * Driver Mode is a localStorage-only flag stored in '3b-fleet-settings'.
 * It is NOT authentication. It hides owner/operator financial tools for
 * company drivers who should only see execution and compliance data.
 *
 * Default behavior when settings are missing or unreadable: NOT guarded.
 * (Unknown state → don't block; better to show data than lock someone out.)
 */

const SETTINGS_KEY = '3b-fleet-settings'

/**
 * Returns true if Driver Mode is currently enabled.
 * Safe to call server-side — returns false when window is unavailable.
 */
export function isDriverModeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? !!parsed.driverMode : false
  } catch {
    return false // unreadable settings → default unguarded
  }
}

/**
 * Returns the full settings object or null if unavailable.
 * Useful for reading multiple settings fields at once without multiple parses.
 */
export function readFleetSettings(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
