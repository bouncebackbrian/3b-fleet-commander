'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { parseFleetMission } from '@/lib/dashboard/helpers'
import type { LoadMission, TripReview } from '@/lib/dashboard/types'

// ── Lane key normalization ────────────────────────────────────────────────────
// "Amargosa Valley, NV, USA" → "amargosa valley|nv→las vegas|nv"
// Takes city (part[0]) + state (part[1]) only — ignores country suffix.
function normSeg(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function laneKey(origin: string, destination: string): string {
  const oParts = origin.split(',')
  const dParts = destination.split(',')
  const oCity  = normSeg(oParts[0] ?? '')
  const oState = normSeg(oParts[1] ?? '')
  const dCity  = normSeg(dParts[0] ?? '')
  const dState = normSeg(dParts[1] ?? '')
  return `${oCity}|${oState}→${dCity}|${dState}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type LaneRiskLevel = 'LOW' | 'MODERATE' | 'HIGH'
export type LaneConfidence = 'low' | 'medium' | 'high'

export type KnownRiskyStop = {
  name:                  string
  city?:                 string
  state?:                string
  detentionCount:        number
  avgDetentionMinutes:   number
}

export type LaneMetrics = {
  laneKey:             string
  origin:              string
  destination:         string
  totalRuns:           number
  reviewedRuns:        number
  // Ratings
  avgRating:           number | null
  wouldRunAgainPct:    number | null
  // Issue frequencies (0–100 pct)
  detentionFreq:       number
  avgDetentionMinutes: number
  parkingIssueFreq:    number
  routeIssueFreq:      number
  weatherDelayFreq:    number
  receiverDelayFreq:   number
  fuelIssueFreq:       number
  // Risk
  riskLevel:           LaneRiskLevel
  riskReasons:         string[]
  confidence:          LaneConfidence
  // Stop intelligence
  knownRiskyStops:     KnownRiskyStop[]
  lastRun:             string | null
}

// ── Minimal shape from 3b-completed-missions localStorage ────────────────────
type LocalArchiveEntry = {
  id:          string
  loadNumber:  string
  origin:      string
  destination: string
  date:        string
  tripReview?: TripReview
  completedAt?: string
}

// ── Convert a minimal local archive entry into a LoadMission stub ─────────────
function archiveToMission(entry: LocalArchiveEntry): LoadMission {
  return {
    id:                  entry.id,
    loadNumber:          entry.loadNumber,
    origin:              entry.origin,
    destination:         entry.destination,
    date:                entry.date,
    dispatchMiles:       0,
    deadheadMiles:       0,
    grossRate:           0,
    fuelPrice:           0,
    rigType:             'semi-solo',
    waitHours:           0,
    reloadKnown:         false,
    reloadAreaStrength:  2,
    hasOvernightParking: false,
    loadType:            'FTL',
    status:              'completed',
    tripReview:          entry.tripReview,
  }
}

// ── Core aggregation ──────────────────────────────────────────────────────────
// Pure function — no side effects, testable independently.
export function aggregateLane(
  missions:    LoadMission[],
  origin:      string,
  destination: string,
): LaneMetrics {
  const key = laneKey(origin, destination)

  // Filter to completed missions on this exact lane
  const relevant = missions.filter(
    m => m.status === 'completed' && laneKey(m.origin, m.destination) === key,
  )

  const totalRuns    = relevant.length
  const reviewed     = relevant.filter(m => m.tripReview != null)
  const reviewedRuns = reviewed.length

  // ── Ratings ──
  const avgRating = reviewedRuns > 0
    ? reviewed.reduce((sum, m) => sum + (m.tripReview!.driverRating ?? 0), 0) / reviewedRuns
    : null

  const wouldRunAgainPct = reviewedRuns > 0
    ? (reviewed.filter(m => m.tripReview!.wouldRunAgain).length / reviewedRuns) * 100
    : null

  // ── Issue frequencies ──
  const flag = (pred: (r: TripReview) => boolean): number =>
    reviewedRuns > 0
      ? (reviewed.filter(m => pred(m.tripReview!)).length / reviewedRuns) * 100
      : 0

  const detentionFreq     = flag(r => r.detention)
  const parkingIssueFreq  = flag(r => r.parkingIssue)
  const routeIssueFreq    = flag(r => r.routeProblem)
  const weatherDelayFreq  = flag(r => r.weatherDelay)
  const receiverDelayFreq = flag(r => r.receiverDelay)
  const fuelIssueFreq     = flag(r => r.fuelIssue)

  // ── Average detention minutes from stop records ──
  const detentionMinutesList: number[] = []
  for (const m of relevant) {
    for (const stop of m.stops ?? []) {
      const dm = stop.detentionSummary?.detentionMinutes ?? 0
      if (dm > 0) detentionMinutesList.push(dm)
    }
  }
  const avgDetentionMinutes = detentionMinutesList.length > 0
    ? Math.round(detentionMinutesList.reduce((a, b) => a + b, 0) / detentionMinutesList.length)
    : 0

  // ── Known risky stops ──
  // Key by name + city so the same facility accumulates across runs
  const stopAccum = new Map<
    string,
    { name: string; city?: string; state?: string; minutes: number[] }
  >()
  for (const m of relevant) {
    for (const stop of m.stops ?? []) {
      const dm = stop.detentionSummary?.detentionMinutes ?? 0
      if (dm <= 0) continue
      const stopKey = `${stop.name}|${stop.city ?? ''}`.toLowerCase()
      const existing = stopAccum.get(stopKey) ?? { name: stop.name, city: stop.city, state: stop.state, minutes: [] }
      existing.minutes.push(dm)
      stopAccum.set(stopKey, existing)
    }
  }
  const knownRiskyStops: KnownRiskyStop[] = Array.from(stopAccum.values())
    .sort((a, b) => b.minutes.length - a.minutes.length)
    .slice(0, 5)
    .map(s => ({
      name:                s.name,
      city:                s.city,
      state:               s.state,
      detentionCount:      s.minutes.length,
      avgDetentionMinutes: Math.round(s.minutes.reduce((a, b) => a + b, 0) / s.minutes.length),
    }))

  // ── Last run ──
  const lastRun = relevant
    .map(m => m.date)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null

  // ── Risk level ──
  const riskReasons: string[] = []
  let riskLevel: LaneRiskLevel = 'LOW'

  if (reviewedRuns >= 2) {
    if (detentionFreq >= 50)    riskReasons.push(`Detention on ${Math.round(detentionFreq)}% of runs`)
    else if (detentionFreq >= 30) riskReasons.push(`Detention on ${Math.round(detentionFreq)}% of runs`)

    if (receiverDelayFreq >= 50) riskReasons.push(`Receiver delays ${Math.round(receiverDelayFreq)}% of runs`)
    else if (receiverDelayFreq >= 30) riskReasons.push(`Receiver delays ${Math.round(receiverDelayFreq)}% of runs`)

    if (parkingIssueFreq >= 40)  riskReasons.push(`Parking issues ${Math.round(parkingIssueFreq)}% of runs`)
    else if (parkingIssueFreq >= 25) riskReasons.push(`Parking issues ${Math.round(parkingIssueFreq)}% of runs`)

    if (routeIssueFreq >= 40)    riskReasons.push(`Route problems ${Math.round(routeIssueFreq)}% of runs`)
    if (weatherDelayFreq >= 40)  riskReasons.push(`Weather delays ${Math.round(weatherDelayFreq)}% of runs`)
    if (fuelIssueFreq >= 40)     riskReasons.push(`Fuel issues ${Math.round(fuelIssueFreq)}% of runs`)

    if (avgRating != null && avgRating <= 2.5 && reviewedRuns >= 3)
      riskReasons.push(`Low avg rating ${avgRating.toFixed(1)}★`)
    if (wouldRunAgainPct != null && wouldRunAgainPct <= 40 && reviewedRuns >= 3)
      riskReasons.push(`Only ${Math.round(wouldRunAgainPct)}% would run again`)

    const highIssues = [
      detentionFreq    >= 40,
      parkingIssueFreq >= 30,
      routeIssueFreq   >= 30,
      receiverDelayFreq >= 40,
    ].filter(Boolean).length

    if (
      detentionFreq    >= 50 ||
      highIssues       >= 2  ||
      (avgRating != null && avgRating <= 2 && reviewedRuns >= 3)
    ) {
      riskLevel = 'HIGH'
    } else if (
      detentionFreq    >= 30 ||
      parkingIssueFreq >= 30 ||
      routeIssueFreq   >= 30 ||
      receiverDelayFreq >= 40 ||
      highIssues       >= 1  ||
      (avgRating != null && avgRating <= 3.2 && reviewedRuns >= 3)
    ) {
      riskLevel = 'MODERATE'
    }
  }

  const confidence: LaneConfidence =
    totalRuns >= 8 ? 'high' : totalRuns >= 3 ? 'medium' : 'low'

  return {
    laneKey:             key,
    origin,
    destination,
    totalRuns,
    reviewedRuns,
    avgRating,
    wouldRunAgainPct,
    detentionFreq,
    avgDetentionMinutes,
    parkingIssueFreq,
    routeIssueFreq,
    weatherDelayFreq,
    receiverDelayFreq,
    fuelIssueFreq,
    riskLevel,
    riskReasons,
    confidence,
    knownRiskyStops,
    lastRun,
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
// Reads completed missions from Supabase + localStorage, aggregates lane stats.
// Pure read — no writes, no new schema.
export function useLaneIntelligence(origin?: string, destination?: string) {
  const [metrics, setMetrics] = useState<LaneMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  const compute = useCallback(async (orig: string, dest: string) => {
    setLoading(true)
    try {
      const all: LoadMission[] = []
      const seen = new Set<string>()

      // 1. Supabase — full metadata (stops, tripReview, detentionSummary all present)
      if (supabase) {
        try {
          const { data } = await supabase
            .from('fleet_missions')
            .select('*')
            .eq('status', 'completed')
            .order('date', { ascending: false })
            .limit(200)
          if (data) {
            for (const row of data) {
              const m = parseFleetMission(row)
              if (!seen.has(m.id)) {
                seen.add(m.id)
                all.push(m)
              }
            }
          }
        } catch { /* silent — local fallback covers us */ }
      }

      // 2. localStorage archive — minimal (no stops data, but has tripReview flags)
      //    Only add entries not already fetched from Supabase
      try {
        const raw = localStorage.getItem('3b-completed-missions')
        if (raw) {
          const entries = JSON.parse(raw) as LocalArchiveEntry[]
          for (const entry of entries) {
            if (!seen.has(entry.id)) {
              seen.add(entry.id)
              all.push(archiveToMission(entry))
            }
          }
        }
      } catch { /* ignore */ }

      setMetrics(aggregateLane(all, orig, dest))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (origin && destination) {
      compute(origin, destination)
    } else {
      setMetrics(null)
    }
  }, [origin, destination, compute])

  const refresh = useCallback(() => {
    if (origin && destination) compute(origin, destination)
  }, [origin, destination, compute])

  return { metrics, loading, refresh }
}
