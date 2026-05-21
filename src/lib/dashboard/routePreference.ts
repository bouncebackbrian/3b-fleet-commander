/**
 * Route Preference — deterministic risk assessment.
 * Scans free-form route notes for keywords that indicate backroad,
 * restricted, or non-corridor routing, then cross-references the
 * driver's route preference to determine whether to surface a warning.
 *
 * Zero API cost. Runs synchronously. No external dependencies.
 */

import type { RoutePreference, RouteRiskLevel, RouteRisk } from './types'

// ── HIGH risk — trucks should NOT be on these without dispatcher approval ─────
const HIGH_RISK_PATTERNS: RegExp[] = [
  /\bbackroad\b|\bback road\b|\bback-road\b/i,
  /\bcounty road\b/i,
  /\b(CR|FM|RR)-?\s*\d+\b/i,          // county/farm-to-market designators
  /\bno truck\b|\bno semi\b|\bno 18.?wheel/i,
  /\bno truck stop\b|\bno services\b/i,
  /\bno overnight\b/i,
  /\brestricted\b/i,
  /\blow.?clearance\b|\blow bridge\b/i,
  /\bweight limit\b|\bposted limit\b|\bposted road\b/i,
  /\bshortcut\b/i,
  /\bgravel\b|\bdirt road\b/i,
  /\bnarrow road\b|\bnarrow bridge\b/i,
  /\bunknown route\b|\bnon-standard\b/i,
]

// ── MODERATE risk — passable but warrants awareness ───────────────────────────
const MODERATE_RISK_PATTERNS: RegExp[] = [
  /\bstate (highway|hwy|route|road)\b/i,
  /\bstate road\b|\bstate route\b/i,
  /\b(SR|SH|SL)-?\s*\d+\b/i,          // state route designators
  /\brural\b/i,
  /\blimited services?\b|\bfew stops?\b/i,
  /\bno scale\b|\bno weigh\b/i,
  /\bmountain pass\b|\bhill country\b/i,
  /\bweather exposure\b|\bopen plains\b/i,
  /\bseasonal\b/i,                     // seasonal road
  /\bpoor parking\b|\blimited parking\b/i,
  /\bdetour\b/i,
]

// ── LOW risk — main corridor indicators ──────────────────────────────────────
const LOW_RISK_PATTERNS: RegExp[] = [
  /\b(I-|Interstate\s?)\d+/i,
  /\b(US-|US\s?Hwy|US\s?Highway)\s?\d+/i,
  /\bfreight corridor\b/i,
  /\btruck route\b/i,
  /\bmajor highway\b|\bmain highway\b/i,
]

// ── Scanner ────────────────────────────────────────────────────────────────────
function scanText(text: string): RouteRiskLevel {
  for (const pat of HIGH_RISK_PATTERNS) {
    if (pat.test(text)) return 'HIGH'
  }
  // Explicit LOW match overrides MODERATE
  for (const pat of LOW_RISK_PATTERNS) {
    if (pat.test(text)) return 'LOW'
  }
  for (const pat of MODERATE_RISK_PATTERNS) {
    if (pat.test(text)) return 'MODERATE'
  }
  return 'LOW'
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) return m[0]
  }
  return null
}

// ── Main export ────────────────────────────────────────────────────────────────
export function computeRouteRisk(
  notes: string | null | undefined,
  preference: RoutePreference = 'main_corridors',
): RouteRisk {
  // manual_review always produces a warning regardless of notes
  if (preference === 'manual_review') {
    const textLevel = notes?.trim() ? scanText(notes.trim()) : 'LOW'
    return {
      level:       textLevel === 'HIGH' ? 'HIGH' : 'MODERATE',
      reasons:     ['Dispatcher approval required before departure'],
      disclaimer:  'Manual review required — dispatcher must approve routing.',
      showWarning: true,
    }
  }

  const text = notes?.trim() ?? ''

  // No notes — no risk (except manual_review handled above)
  if (!text) {
    return { level: 'LOW', reasons: [], disclaimer: null, showWarning: false }
  }

  const level = scanText(text)
  const reasons: string[] = []

  if (level === 'HIGH') {
    const match = firstMatch(text, HIGH_RISK_PATTERNS)
    reasons.push(
      match
        ? `Route note flags "${match}" — potential truck restriction or access issue`
        : 'Route notes indicate high-risk routing for commercial vehicles',
    )
  } else if (level === 'MODERATE') {
    const match = firstMatch(text, MODERATE_RISK_PATTERNS)
    reasons.push(
      match
        ? `Route note mentions "${match}" — limited services or non-corridor routing possible`
        : 'Route notes suggest non-interstate routing — verify services along route',
    )
  }

  // Main corridors preference amplifies the warning
  const mainCorridor = preference === 'main_corridors'
  const showWarning  = mainCorridor && level !== 'LOW'
  const disclaimer   = showWarning
    ? 'Main corridors preferred — verify truck-safe routing before dispatch.'
    : null

  return { level, reasons, disclaimer, showWarning }
}

// ── UI labels ──────────────────────────────────────────────────────────────────
export const ROUTE_PREF_META: Record<RoutePreference, { label: string; emoji: string; desc: string }> = {
  main_corridors: { label: 'Main Corridors', emoji: '🛣️',  desc: 'Interstates + major US highways' },
  fastest:        { label: 'Fastest Route',  emoji: '⚡',  desc: 'Minimize drive time, any route'  },
  fuel_saver:     { label: 'Fuel Saver',     emoji: '⛽',  desc: 'Optimize for fuel efficiency'    },
  avoid_cities:   { label: 'Avoid Cities',   emoji: '🏙️', desc: 'Bypass metro congestion'         },
  manual_review:  { label: 'Manual Review',  emoji: '📋',  desc: 'Dispatcher must approve routing' },
}

export const ROUTE_RISK_META: Record<RouteRiskLevel, { label: string; bg: string; color: string; border: string }> = {
  LOW:      { label: 'LOW RISK',  bg: 'rgba(40,192,72,.1)',   color: 'var(--success)', border: 'rgba(40,192,72,.25)'  },
  MODERATE: { label: 'MODERATE',  bg: 'rgba(245,194,0,.1)',   color: 'var(--warn)',    border: 'rgba(245,194,0,.25)'  },
  HIGH:     { label: 'HIGH RISK', bg: 'rgba(232,64,0,.1)',    color: 'var(--error)',   border: 'rgba(232,64,0,.25)'   },
}
