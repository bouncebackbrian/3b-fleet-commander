'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { LoadMission, OperationalEvent, EventType, EventSeverity } from '@/lib/dashboard/types'
import { opLog } from '@/lib/logger'
import { toast } from '@/hooks/useToast'

// ── Normalise origin/destination for lane matching ────────────────────────────
function normLane(s: string): string {
  return s.split(',')[0].trim().toLowerCase()
}

// ── LocalStorage key ─────────────────────────────────────────────────────────
const LS_KEY = '3b-op-events'

function readLocalEvents(): OperationalEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as OperationalEvent[]) : []
  } catch { return [] }
}

function writeLocalEvents(events: OperationalEvent[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(events.slice(0, 200))) } catch { /* ignore */ }
}

// ── Row → OperationalEvent ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEvent(r: any): OperationalEvent {
  return {
    id:          r.id,
    missionId:   r.mission_id  ?? null,
    loadNumber:  r.load_number ?? '',
    origin:      r.origin      ?? '',
    destination: r.destination ?? '',
    eventType:   r.event_type  as EventType,
    severity:    r.severity    as EventSeverity,
    notes:       r.notes       ?? null,
    location:    r.location    ?? null,
    createdBy:   r.created_by  ?? null,
    createdAt:   r.created_at,
  }
}

// ── Deterministic insight computation ────────────────────────────────────────
export function computeInsights(
  history: OperationalEvent[],
  currentEvents: OperationalEvent[],
): string[] {
  const all = [...currentEvents, ...history]
  if (all.length === 0) return []

  const insights: string[] = []
  const count = (type: EventType) => all.filter(e => e.eventType === type).length

  const receiverDelays = count('receiver_delay')
  const parkingIssues  = count('parking_issue')
  const detentions     = count('detention')
  const weatherDelays  = count('weather_delay')
  const breakdowns     = count('breakdown')
  const scaleIssues    = count('scale_issue')
  const trafficDelays  = count('traffic_delay')
  const successes      = count('successful_delivery')
  const fuelIssues     = count('fuel_issue')

  if (receiverDelays >= 3)
    insights.push(`⚠️ Receiver delayed ${receiverDelays} of last ${all.length} visits — build buffer`)
  else if (receiverDelays >= 2)
    insights.push(`📦 Receiver delay logged ${receiverDelays}x on this lane`)

  if (detentions >= 2)
    insights.push(`⏱ Detention logged ${detentions}x — document wait time from arrival`)

  if (parkingIssues >= 2)
    insights.push(`🅿️ Parking difficult ${parkingIssues}x — book truck stop in advance`)
  else if (parkingIssues === 1)
    insights.push(`🅿️ Parking issue reported on this lane — arrive early`)

  if (weatherDelays >= 2)
    insights.push(`🌧️ Weather delays ${weatherDelays}x — check NOAA before departure`)

  if (breakdowns >= 1)
    insights.push(`🔧 Breakdown/mechanical issue on record — inspect before dispatch`)

  if (scaleIssues >= 1)
    insights.push(`⚖️ Scale backup reported ${scaleIssues}x — add 30-min buffer`)

  if (trafficDelays >= 2)
    insights.push(`🚦 Heavy traffic ${trafficDelays}x — check Waze before entry window`)

  if (fuelIssues >= 1)
    insights.push(`⛽ Reefer/fuel issue logged — pre-fuel at last Love's before delivery`)

  if (successes >= 3 && receiverDelays === 0 && detentions === 0 && breakdowns === 0)
    insights.push(`✅ Strong lane — ${successes} clean deliveries, no issues on record`)

  return insights
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useOperationalMemory(mission: LoadMission | null) {
  const [events,          setEvents]          = useState<OperationalEvent[]>([])
  const [history,         setHistory]         = useState<OperationalEvent[]>([])
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [aiInsight,       setAiInsight]       = useState<string | null>(null)
  const [insightLoading,  setInsightLoading]  = useState(false)

  // Duplicate-event guard: track last logged event type + timestamp
  const lastEventRef = useRef<{ type: string; ms: number } | null>(null)

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!mission) return
    setLoading(true)
    setError(null)

    if (!supabase) {
      const local = readLocalEvents()
      setEvents(local.filter(e => e.missionId === mission.id || e.loadNumber === mission.loadNumber))
      const orig = normLane(mission.origin)
      const dest = normLane(mission.destination)
      setHistory(local.filter(e =>
        e.missionId !== mission.id
        && normLane(e.origin) === orig
        && normLane(e.destination) === dest,
      ).slice(0, 50))
      setLoading(false)
      return
    }

    const missionFilter = mission.id
      ? supabase.from('operational_events').select('*').eq('mission_id', mission.id).order('created_at', { ascending: false }).limit(30)
      : supabase.from('operational_events').select('*').eq('load_number', mission.loadNumber).order('created_at', { ascending: false }).limit(30)

    const orig = normLane(mission.origin)
    const dest = normLane(mission.destination)
    const historyQuery = supabase
      .from('operational_events').select('*')
      .neq('mission_id', mission.id ?? '')
      .ilike('origin', `${orig}%`)
      .ilike('destination', `${dest}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    const [evRes, histRes] = await Promise.all([missionFilter, historyQuery])

    if (evRes.error)    setError(evRes.error.message)
    else                setEvents((evRes.data ?? []).map(parseEvent))

    if (!histRes.error) setHistory((histRes.data ?? []).map(parseEvent))

    setLoading(false)
  }, [mission])

  useEffect(() => { refresh() }, [refresh])

  // ── Log a new event ─────────────────────────────────────────────────────────
  const logEvent = useCallback(async (
    eventType: EventType,
    severity:  EventSeverity,
    notes?:    string,
    location?: string,
  ): Promise<{ error: string | null }> => {
    if (!mission) return { error: 'No active mission' }

    // Duplicate-event guard — reject same type within 3 seconds
    const now  = Date.now()
    const last = lastEventRef.current
    if (last && last.type === eventType && now - last.ms < 3000) {
      opLog.guard(`Duplicate event rejected: ${eventType}`, { msSinceLast: now - last.ms })
      return { error: 'Duplicate event — please wait a moment before logging again' }
    }
    lastEventRef.current = { type: eventType, ms: now }

    const ev: OperationalEvent = {
      id:          crypto.randomUUID(),
      missionId:   mission.id,
      loadNumber:  mission.loadNumber,
      origin:      normLane(mission.origin),
      destination: normLane(mission.destination),
      eventType,
      severity,
      notes:       notes?.trim() || null,
      location:    location?.trim() || null,
      createdBy:   null,
      createdAt:   new Date().toISOString(),
    }

    // 1. localStorage first
    const local = readLocalEvents()
    writeLocalEvents([ev, ...local])

    // 2. Optimistic UI
    setEvents(prev => [ev, ...prev])
    opLog.event(`Logged: ${eventType} [${severity}]`, { loadNumber: mission.loadNumber, location: ev.location })
    toast.success(`Event logged: ${eventType.replace(/_/g, ' ')}`)

    if (!supabase) return { error: null }

    // 3. Supabase
    const { error: sbErr } = await supabase.from('operational_events').insert({
      id:          ev.id,
      mission_id:  ev.missionId,
      load_number: ev.loadNumber,
      origin:      ev.origin,
      destination: ev.destination,
      event_type:  ev.eventType,
      severity:    ev.severity,
      notes:       ev.notes,
      location:    ev.location,
      created_by:  ev.createdBy,
    })

    if (sbErr) {
      opLog.syncErr('operational_events insert failed', { error: sbErr.message, eventType })
      setError(sbErr.message)
      return { error: sbErr.message }
    }
    opLog.sync('operational_events insert OK', { eventType })
    return { error: null }
  }, [mission])

  // ── Generate AI insight ─────────────────────────────────────────────────────
  const generateInsight = useCallback(async (): Promise<void> => {
    if (!mission) return
    setInsightLoading(true)
    setAiInsight(null)
    opLog.ai('Requesting operational insight', { loadNumber: mission.loadNumber, eventCount: events.length, historyCount: history.length })
    try {
      const res = await fetch('/api/operational-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission, events, history }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { insight } = await res.json()
      setAiInsight(insight as string)
      opLog.ai('Insight received', { chars: (insight as string).length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Insight generation failed'
      setAiInsight(`Error: ${msg}`)
      opLog.error('ai', 'Insight request failed', err)
    } finally {
      setInsightLoading(false)
    }
  }, [mission, events, history])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const insights = computeInsights(history, events)

  return {
    events,
    history,
    insights,
    aiInsight,
    loading,
    error,
    insightLoading,
    logEvent,
    generateInsight,
    refresh,
  }
}
