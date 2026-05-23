'use client'
/**
 * alertEngine.ts — Predictive Fleet Intelligence
 *
 * Evaluates trends across tire logs, compliance events, inspections,
 * HOS data, detention, and fuel → outputs tiered alerts.
 *
 * Alert tiers:
 *   info          — passive, no action needed
 *   preventative  — plan action soon (amber)
 *   warning       — should act now (amber/red)
 *   urgent        — operational risk now (red, ack required)
 *   critical      — immediate escalation (flashing red, modal)
 *
 * LS keys:
 *   3b-fleet-alerts             — FleetAlert[]  (max 300)
 *   3b-alert-acknowledgements   — AlertAck[]    (max 500)
 */

import { readBreakLog }     from './loadKpi'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertTier = 'info' | 'preventative' | 'warning' | 'urgent' | 'critical'

export type AlertCategory =
  | 'tire'
  | 'brake'
  | 'inspection'
  | 'hos'
  | 'detention'
  | 'fuel'
  | 'reefer'
  | 'cargo'
  | 'driver'
  | 'appointment'
  | 'system'

export interface FleetAlert {
  id:           string
  tier:         AlertTier
  category:     AlertCategory
  title:        string
  body:         string
  detail?:      string           // expanded explanation / recommendation
  loadNumber?:  string
  truckNum?:    string
  trailerNum?:  string
  createdAt:    string
  expiresAt?:   string           // auto-dismiss after this time
  ackRequired:  boolean
  acked:        boolean
  ackedBy?:     string
  ackedAt?:     string
  dismissed:    boolean
  source:       'driver' | 'system' | 'inspection' | 'dispatch'
  // Prediction fields
  confidence?:  number           // 0-100 (predictive alerts)
  milesUntil?:  number           // predicted miles until critical
  daysUntil?:   number           // predicted days until critical
}

export interface AlertAck {
  alertId:   string
  ackedBy:   string
  ackedAt:   string
  note?:     string
}

// Tire log entry (from compliance/tire logs)
export interface TireReading {
  date:      string     // ISO
  position:  string     // e.g. 'LF', 'RFO', 'RRI'
  depth32:   number     // tread depth in 32nds
  psi:       number
  condition: 'good' | 'worn' | 'critical' | 'replace'
  axle:      string
}

// ── LS keys ───────────────────────────────────────────────────────────────────

const LS_ALERTS = '3b-fleet-alerts'
const LS_ACKS   = '3b-alert-acknowledgements'
const MAX_ALERTS = 300
const MAX_ACKS   = 500

// ── Storage ───────────────────────────────────────────────────────────────────

export function readFleetAlerts(opts?: { tier?: AlertTier; category?: AlertCategory; active?: boolean }): FleetAlert[] {
  try {
    let all: FleetAlert[] = JSON.parse(localStorage.getItem(LS_ALERTS) ?? '[]')
    if (opts?.tier)     all = all.filter(a => a.tier === opts.tier)
    if (opts?.category) all = all.filter(a => a.category === opts.category)
    if (opts?.active)   all = all.filter(a => !a.dismissed && !a.acked)
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch { return [] }
}

export function saveFleetAlert(alert: FleetAlert): void {
  try {
    const all = readFleetAlerts()
    const idx = all.findIndex(a => a.id === alert.id)
    if (idx >= 0) all[idx] = alert
    else all.unshift(alert)
    localStorage.setItem(LS_ALERTS, JSON.stringify(all.slice(0, MAX_ALERTS)))
  } catch { /* storage full */ }
}

export function acknowledgeAlert(id: string, ackedBy: string, note?: string): void {
  try {
    const all = readFleetAlerts()
    const idx = all.findIndex(a => a.id === id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], acked: true, ackedBy, ackedAt: new Date().toISOString() }
      localStorage.setItem(LS_ALERTS, JSON.stringify(all.slice(0, MAX_ALERTS)))
    }
    const acks: AlertAck[] = JSON.parse(localStorage.getItem(LS_ACKS) ?? '[]')
    acks.unshift({ alertId: id, ackedBy, ackedAt: new Date().toISOString(), note })
    localStorage.setItem(LS_ACKS, JSON.stringify(acks.slice(0, MAX_ACKS)))
  } catch { /* ignore */ }
}

export function dismissAlert(id: string): void {
  try {
    const all = readFleetAlerts()
    const idx = all.findIndex(a => a.id === id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], dismissed: true }
      localStorage.setItem(LS_ALERTS, JSON.stringify(all.slice(0, MAX_ALERTS)))
    }
  } catch { /* ignore */ }
}

// ── Alert factory ─────────────────────────────────────────────────────────────

export function createAlert(partial: Omit<FleetAlert, 'id' | 'createdAt' | 'acked' | 'dismissed'>): FleetAlert {
  const alert: FleetAlert = {
    ...partial,
    id:        crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    acked:     false,
    dismissed: false,
  }
  saveFleetAlert(alert)
  return alert
}

// ── Tire trend analysis ───────────────────────────────────────────────────────

/** DOT minimums: 2/32 steer, 2/32 other (but 4/32 is the safe-action threshold) */
const TIRE_DOT_MIN_STEER  = 2   // 32nds — replace threshold (legal minimum steer)
const TIRE_DOT_MIN_OTHER  = 2   // 32nds — replace threshold
const TIRE_WARN_STEER     = 4   // 32nds — urgent warning
const TIRE_WARN_OTHER     = 4   // 32nds — urgent warning
const TIRE_PREVENTATIVE   = 6   // 32nds — plan replacement soon

export function analyzeTireTrend(readings: TireReading[]): FleetAlert[] {
  if (readings.length < 2) return []
  const alerts: FleetAlert[] = []

  // Group by position
  const byPosition = new Map<string, TireReading[]>()
  for (const r of readings) {
    if (!byPosition.has(r.position)) byPosition.set(r.position, [])
    byPosition.get(r.position)!.push(r)
  }

  for (const [position, history] of byPosition) {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted[sorted.length - 1]
    const isSteer = position.startsWith('LF') || position.startsWith('RF')
    const minDepth = isSteer ? TIRE_DOT_MIN_STEER : TIRE_DOT_MIN_OTHER
    const warnDepth = isSteer ? TIRE_WARN_STEER : TIRE_WARN_OTHER

    // Critical: below DOT legal limit
    if (latest.depth32 <= minDepth) {
      alerts.push(createAlert({
        tier:        'critical',
        category:    'tire',
        title:       `🚨 Tire ${position} — Below DOT Legal Tread`,
        body:        `${position} reads ${latest.depth32}/32″. DOT minimum is ${minDepth}/32″. Vehicle must not be dispatched.`,
        detail:      'Replace immediately. Operating with illegal tread depth is a federal violation and safety risk.',
        ackRequired: true,
        source:      'inspection',
        trailerNum:  undefined,
      }))
      continue
    }

    // Urgent: approaching limit
    if (latest.depth32 <= warnDepth) {
      alerts.push(createAlert({
        tier:        'urgent',
        category:    'tire',
        title:       `⚠️ Tire ${position} — Near DOT Minimum`,
        body:        `${position} reads ${latest.depth32}/32″. Approaching the ${minDepth}/32″ DOT limit.`,
        detail:      'Schedule replacement before next long haul. Monitor at every pre-trip.',
        ackRequired: true,
        source:      'inspection',
      }))
      continue
    }

    // Trend analysis: calculate wear rate if 2+ readings
    if (sorted.length >= 2) {
      const first  = sorted[0]
      const days   = Math.max(1, (new Date(latest.date).getTime() - new Date(first.date).getTime()) / 86400000)
      const worn   = first.depth32 - latest.depth32
      if (worn > 0) {
        const wearPerDay    = worn / days
        const daysToWarn    = warnDepth < latest.depth32 ? Math.round((latest.depth32 - warnDepth) / wearPerDay) : 0
        const daysToReplace = minDepth < latest.depth32  ? Math.round((latest.depth32 - minDepth)  / wearPerDay) : 0
        const confidence    = Math.min(95, 50 + sorted.length * 12)  // more readings = higher confidence

        // Accelerated wear (worn more than 1/32 per week)
        if (wearPerDay > 1/7 && latest.depth32 > warnDepth) {
          alerts.push(createAlert({
            tier:        'preventative',
            category:    'tire',
            title:       `⚠️ Tire ${position} — Accelerated Wear Detected`,
            body:        `Wear rate ${(wearPerDay * 7).toFixed(2)}/32″ per week. Estimated replacement in ~${daysToReplace} days.`,
            detail:      `At current rate, ${position} will reach DOT minimum in approximately ${daysToReplace} days. Inspect for alignment, inflation, or overloading issues.`,
            ackRequired: false,
            confidence,
            daysUntil:   daysToReplace,
            source:      'system',
          }))
        } else if (latest.depth32 <= TIRE_PREVENTATIVE && latest.depth32 > warnDepth) {
          // Preventative: in the "plan replacement" zone
          alerts.push(createAlert({
            tier:        'preventative',
            category:    'tire',
            title:       `🔶 Tire ${position} — Schedule Replacement`,
            body:        `${position} at ${latest.depth32}/32″. Est. ${daysToWarn > 0 ? `${daysToWarn} days` : 'soon'} until warning threshold.`,
            detail:      `Plan tire replacement. At current wear rate, this tire will reach the urgent threshold in ~${daysToWarn} days.`,
            ackRequired: false,
            confidence,
            daysUntil:   daysToWarn,
            source:      'system',
          }))
        }
      }
    }
  }

  return alerts
}

// ── HOS risk alerts ───────────────────────────────────────────────────────────

export function analyzeHosRisk(hos: {
  driveRemaining: number;  // hours
  shiftRemaining: number;
  cycleRemaining: number;
  mileageRemaining?: number;
}): FleetAlert[] {
  const alerts: FleetAlert[] = []
  const { driveRemaining, shiftRemaining, cycleRemaining, mileageRemaining } = hos

  // Estimate hours to complete (rough 58 mph)
  const hoursNeeded = mileageRemaining ? mileageRemaining / 58 : null

  if (driveRemaining <= 1) {
    alerts.push(createAlert({
      tier:        'critical',
      category:    'hos',
      title:       '🚨 HOS — Driving Limit Imminent',
      body:        `Only ${(driveRemaining * 60).toFixed(0)} minutes of drive time remaining. Driver must stop soon.`,
      ackRequired: true,
      source:      'system',
    }))
  } else if (driveRemaining <= 2) {
    alerts.push(createAlert({
      tier:        'urgent',
      category:    'hos',
      title:       '⚠️ HOS — 2 Hours Drive Remaining',
      body:        `Driver has ${driveRemaining.toFixed(1)}h drive time left.${hoursNeeded ? ` Est. ${hoursNeeded.toFixed(1)}h to destination.` : ''} Plan rest stop.`,
      ackRequired: true,
      source:      'system',
    }))
  } else if (hoursNeeded && hoursNeeded > driveRemaining) {
    alerts.push(createAlert({
      tier:        'warning',
      category:    'hos',
      title:       '⚠️ HOS — Drive Time Insufficient for Route',
      body:        `Route requires ~${hoursNeeded.toFixed(1)}h drive, but only ${driveRemaining.toFixed(1)}h available. 10-hour rest required en route.`,
      ackRequired: true,
      source:      'system',
    }))
  }

  if (cycleRemaining <= 4) {
    alerts.push(createAlert({
      tier:        'urgent',
      category:    'hos',
      title:       '⚠️ HOS — 70-Hour Cycle Running Low',
      body:        `Only ${cycleRemaining.toFixed(1)}h left in 8-day cycle. Plan 34-hour restart soon.`,
      ackRequired: false,
      source:      'system',
    }))
  }

  return alerts
}

// ── Detention alerts ──────────────────────────────────────────────────────────

export function analyzeDetention(detentionStartISO: string, loadNumber: string): FleetAlert | null {
  const mins = Math.floor((Date.now() - new Date(detentionStartISO).getTime()) / 60000)
  if (mins < 90) return null

  const tier: AlertTier = mins >= 180 ? 'urgent' : 'warning'
  return createAlert({
    tier,
    category:   'detention',
    loadNumber,
    title:      `🕐 Detention — ${Math.floor(mins / 60)}h ${mins % 60}m and counting`,
    body:       `Load #${loadNumber} has been at facility for ${Math.floor(mins / 60)}h ${mins % 60}m. Detention clock running. Notify dispatch and broker.`,
    detail:     'Standard detention starts at 2 hours. Document all wait times. Contact broker if exceeding 3 hours.',
    ackRequired: tier === 'urgent',
    source:     'system',
  })
}

// ── Inspection expiry ─────────────────────────────────────────────────────────

export function analyzeInspectionExpiry(opts: {
  annualInspectionDue: string;   // ISO date
  trailerNum?: string;
}): FleetAlert[] {
  const alerts: FleetAlert[] = []
  const days = Math.floor((new Date(opts.annualInspectionDue).getTime() - Date.now()) / 86400000)

  if (days <= 0) {
    alerts.push(createAlert({
      tier:        'critical',
      category:    'inspection',
      trailerNum:  opts.trailerNum,
      title:       '🚨 Annual Inspection EXPIRED',
      body:        `Trailer ${opts.trailerNum ?? ''} annual inspection expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago. Vehicle must not be dispatched.`,
      ackRequired: true,
      source:      'inspection',
    }))
  } else if (days <= 14) {
    alerts.push(createAlert({
      tier:        'urgent',
      category:    'inspection',
      trailerNum:  opts.trailerNum,
      title:       `⚠️ Annual Inspection Due in ${days} Days`,
      body:        `Trailer ${opts.trailerNum ?? ''} annual inspection expires ${new Date(opts.annualInspectionDue).toLocaleDateString()}. Schedule immediately.`,
      ackRequired: false,
      source:      'inspection',
      daysUntil:   days,
    }))
  } else if (days <= 45) {
    alerts.push(createAlert({
      tier:        'preventative',
      category:    'inspection',
      trailerNum:  opts.trailerNum,
      title:       `🔶 Annual Inspection Due in ${days} Days`,
      body:        `Plan trailer ${opts.trailerNum ?? ''} annual inspection. Expires ${new Date(opts.annualInspectionDue).toLocaleDateString()}.`,
      ackRequired: false,
      source:      'system',
      daysUntil:   days,
    }))
  }

  return alerts
}

// ── Fuel risk ─────────────────────────────────────────────────────────────────

export function analyzeFuelRisk(opts: {
  currentGallons: number;
  tankCapacity: number;
  mpg: number;
  milesRemaining: number;
}): FleetAlert | null {
  const { currentGallons, tankCapacity, mpg, milesRemaining } = opts
  const rangeMiles  = currentGallons * mpg
  const pctFull     = currentGallons / tankCapacity

  if (rangeMiles < milesRemaining && pctFull < 0.25) {
    return createAlert({
      tier:        'urgent',
      category:    'fuel',
      title:       '⛽ Fuel Range Critical',
      body:        `Estimated range ${Math.round(rangeMiles)} mi. Destination requires ${Math.round(milesRemaining)} mi. Refuel immediately.`,
      ackRequired: true,
      source:      'system',
    })
  }

  if (pctFull < 0.20) {
    return createAlert({
      tier:        'warning',
      category:    'fuel',
      title:       '⛽ Fuel Below 20%',
      body:        `Tank at ~${Math.round(pctFull * 100)}% (${currentGallons.toFixed(0)} gal). Plan fuel stop soon — ${Math.round(rangeMiles)} mi range.`,
      ackRequired: false,
      source:      'system',
    })
  }

  return null
}

// ── Alert metadata ────────────────────────────────────────────────────────────

export const TIER_META: Record<AlertTier, {
  label: string; color: string; bg: string; border: string; emoji: string
}> = {
  info:         { label: 'Info',         color: 'var(--primary)',  bg: 'rgba(0,232,176,.05)',   border: 'rgba(0,232,176,.18)',  emoji: 'ℹ️' },
  preventative: { label: 'Preventative', color: 'var(--warn)',     bg: 'rgba(245,194,0,.06)',   border: 'rgba(245,194,0,.2)',   emoji: '🔶' },
  warning:      { label: 'Warning',      color: 'var(--warn)',     bg: 'rgba(245,194,0,.08)',   border: 'rgba(245,194,0,.25)',  emoji: '⚠️' },
  urgent:       { label: 'Urgent',       color: 'var(--error)',    bg: 'rgba(232,64,0,.07)',    border: 'rgba(232,64,0,.22)',   emoji: '🚨' },
  critical:     { label: 'Critical',     color: 'var(--error)',    bg: 'rgba(232,64,0,.1)',     border: 'rgba(232,64,0,.35)',   emoji: '🚨' },
}

export const CATEGORY_META: Record<AlertCategory, { label: string; emoji: string }> = {
  tire:        { label: 'Tire',        emoji: '🛞' },
  brake:       { label: 'Brake',       emoji: '🔴' },
  inspection:  { label: 'Inspection',  emoji: '📋' },
  hos:         { label: 'HOS',         emoji: '⏱️' },
  detention:   { label: 'Detention',   emoji: '🕐' },
  fuel:        { label: 'Fuel',        emoji: '⛽' },
  reefer:      { label: 'Reefer',      emoji: '❄️' },
  cargo:       { label: 'Cargo',       emoji: '📦' },
  driver:      { label: 'Driver',      emoji: '👤' },
  appointment: { label: 'Appointment', emoji: '📅' },
  system:      { label: 'System',      emoji: '⚙️' },
}

// ── Active alert summary ──────────────────────────────────────────────────────

export interface AlertSummary {
  critical:     number
  urgent:       number
  warning:      number
  preventative: number
  info:         number
  total:        number
  highest:      AlertTier | null
}

export function getAlertSummary(alerts?: FleetAlert[]): AlertSummary {
  const list = alerts ?? readFleetAlerts({ active: true })
  const cnt = (tier: AlertTier) => list.filter(a => a.tier === tier).length
  const critical     = cnt('critical')
  const urgent       = cnt('urgent')
  const warning      = cnt('warning')
  const preventative = cnt('preventative')
  const info         = cnt('info')
  const total        = critical + urgent + warning + preventative + info
  const highest: AlertTier | null =
    critical > 0     ? 'critical'     :
    urgent > 0       ? 'urgent'       :
    warning > 0      ? 'warning'      :
    preventative > 0 ? 'preventative' :
    info > 0         ? 'info'         : null

  return { critical, urgent, warning, preventative, info, total, highest }
}
