'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase as legacySupabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'
import { scoreLoad, getMpgDefault, fuelIntel } from '@/lib/scoreLoad'
import type { LoadMission, SyncState, MissionStop, TripReview } from '@/lib/dashboard/types'
import { parseMission, parseFleetMission, missionToRow, insertStop } from '@/lib/dashboard/helpers'
import { getFleetIdentity } from '@/lib/identity'
import { opLog } from '@/lib/logger'
import { validateMission, isScoreResultSafe, isFuelResultSafe } from '@/lib/guards'
import { logTimelineEvent } from '@/lib/timeline'

// Auth-aware browser client for fleet_active_missions
const db = createClient()

// ── Tier-ordered fetch ────────────────────────────────────────────────────────
// 0. fleet_active_missions (single-row JSONB snapshot — source of truth)
// 1. fleet_missions         (multi-column history table)
// 2. loads table            (legacy META-encoded records)
// 3. localStorage           '3b-latest-load'
async function fetchActiveMission(): Promise<{ mission: LoadMission | null; tier: string }> {
  // Tier 0 — fleet_active_missions (auth-aware, one row per user)
  try {
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (user) {
      const { data: row, error } = await db
        .from('fleet_active_missions')
        .select('mission, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (!error && row?.mission) {
        const m = row.mission as LoadMission
        opLog.mission('Loaded from fleet_active_missions (Tier 0)', { id: m.id, loadNumber: m.loadNumber })
        // Sync to localStorage for offline fallback
        try { localStorage.setItem('3b-latest-load', JSON.stringify(m)) } catch { /* ignore */ }
        return { mission: m, tier: 'fleet_active_missions' }
      }
    }
  } catch { /* not signed in or network — fall through */ }

  if (!legacySupabase) {
    const m = readLocalMission()
    opLog.mission(m ? 'Loaded from localStorage (no Supabase)' : 'No mission found (localStorage)', { id: m?.id })
    return { mission: m, tier: 'localStorage' }
  }

  // Tier 1 — fleet_missions
  try {
    const { data: fm, error: fmErr } = await legacySupabase
      .from('fleet_missions')
      .select('*')
      .in('mission_status', ['active', 'planned'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!fmErr && fm) {
      const m = parseFleetMission(fm)
      opLog.mission('Loaded from fleet_missions (Tier 1)', { id: m.id, loadNumber: m.loadNumber })
      return { mission: m, tier: 'fleet_missions' }
    }
  } catch { /* table may not exist yet */ }

  // Tier 2 — loads (legacy META-encoded)
  try {
    const { data: load, error: loadErr } = await legacySupabase
      .from('loads')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (!loadErr && load) {
      const { data: archived } = await legacySupabase
        .from('fleet_missions')
        .select('id')
        .eq('id', load.id)
        .eq('mission_status', 'completed')
        .maybeSingle()

      if (!archived) {
        const m = parseMission(load)
        opLog.mission('Loaded from loads (Tier 2, legacy)', { id: m.id })
        return { mission: m, tier: 'loads' }
      }
      opLog.mission('Loads tier skipped — already completed', { id: load.id })
    }
  } catch { /* ignore */ }

  // Tier 3 — localStorage
  const m = readLocalMission()
  opLog.mission(m ? 'Loaded from localStorage (Tier 3)' : 'No mission found', { id: m?.id })
  return { mission: m, tier: 'localStorage' }
}

function readLocalMission(): LoadMission | null {
  try {
    const raw = localStorage.getItem('3b-latest-load')
    if (raw) return JSON.parse(raw) as LoadMission
  } catch { /* ignore */ }
  return null
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useMission() {
  const [mission,          setMission]          = useState<LoadMission | null>(null)
  const [missionSaveError, setMissionSaveError] = useState<string | null>(null)
  const [syncState,        setSyncState]        = useState<SyncState>(() => legacySupabase ? 'idle' : 'local_only')

  // Debounce + concurrency guards
  const lastSaveMs      = useRef<number>(0)
  const saveInProgress  = useRef<boolean>(false)

  // Initial load
  useEffect(() => {
    fetchActiveMission().then(({ mission: m, tier }) => {
      if (m) {
        setMission(m)
        void logTimelineEvent('mission_restored', 'mission_loader', {
          tier,
          loadNumber: m.loadNumber,
          origin:     m.origin,
          destination: m.destination,
        }, m.id ?? m.loadNumber)
      }
    })
  }, [])

  // ── Save a new active mission ─────────────────────────────────────────────
  // localStorage first (instant, offline-safe) → optimistic UI → Supabase async.
  // Debounced: skips if called within 500ms of last call.
  // Guards against NaN values and missing required fields.
  const saveMission = async (m: LoadMission): Promise<void> => {
    const now = Date.now()

    // Debounce — prevent rapid double-submits
    if (now - lastSaveMs.current < 500) {
      opLog.guard('saveMission debounced — called within 500ms', { loadNumber: m.loadNumber })
      return
    }
    lastSaveMs.current = now

    // Concurrent save guard
    if (saveInProgress.current) {
      opLog.guard('saveMission skipped — save already in progress', { loadNumber: m.loadNumber })
      return
    }
    saveInProgress.current = true

    try {
      setMissionSaveError(null)

      // Runtime validation — log warnings but do not block (driver data takes priority)
      const errors = validateMission(m)
      if (errors.length > 0) {
        opLog.guard('Mission validation warnings', { errors, loadNumber: m.loadNumber })
      }

      // 1. localStorage — immediate, offline-safe
      try { localStorage.setItem('3b-latest-load', JSON.stringify(m)) } catch { /* ignore */ }

      // 2. Optimistic UI
      setMission(m)
      opLog.mission('Mission saved locally', { loadNumber: m.loadNumber, origin: m.origin, dest: m.destination })
      void logTimelineEvent('mission_saved', 'mission_loader', {
        loadNumber:  m.loadNumber,
        origin:      m.origin,
        destination: m.destination,
        grossRate:   m.grossRate,
      }, m.id ?? m.loadNumber)

      if (!legacySupabase) {
        setSyncState('local_only')
        return
      }

      // 3. Supabase — fleet_active_missions (Tier 0) + fleet_missions (history)
      setSyncState('saving')
      const { userId, businessId } = await getFleetIdentity()

      // 3a. fleet_active_missions — single JSONB row, always up to date
      try {
        const { data: { user } } = await createAuthClient().auth.getUser()
        if (user) {
          const { error: amErr } = await db
            .from('fleet_active_missions')
            .upsert({
              user_id:      user.id,
              business_id:  businessId ?? null,
              load_id:      m.id ?? null,
              mission:      m,
              status:       'active',
              last_seen_at: new Date().toISOString(),
              updated_at:   new Date().toISOString(),
            }, { onConflict: 'user_id' })
          if (amErr) opLog.syncErr('fleet_active_missions upsert failed', { error: amErr.message })
          else opLog.sync('fleet_active_missions upsert OK', { loadNumber: m.loadNumber })
        }
      } catch { /* non-blocking */ }

      // 3b. fleet_missions — historical record
      const row = missionToRow(m, { userId, businessId })
      const { error } = await legacySupabase
        .from('fleet_missions')
        .upsert(row, { onConflict: 'id' })

      if (error) {
        setSyncState('failed')
        setMissionSaveError(error.message)
        opLog.syncErr('fleet_missions upsert failed', { error: error.message, loadNumber: m.loadNumber })
      } else {
        setSyncState('saved')
        opLog.sync('fleet_missions upsert OK', { loadNumber: m.loadNumber })
        setTimeout(() => setSyncState('idle'), 3000)
      }
    } finally {
      saveInProgress.current = false
    }
  }

  // ── Derived: score ────────────────────────────────────────────────────────
  const missionScore = useMemo(() => {
    if (!mission || (!mission.dispatchMiles && !mission.grossRate)) return null
    try {
      const result = scoreLoad({
        loadedMiles:         mission.dispatchMiles,
        deadheadMiles:       mission.deadheadMiles,
        loadType:            mission.loadType,
        waitHours:           mission.waitHours,
        reloadKnown:         mission.reloadKnown,
        reloadAreaStrength:  mission.reloadAreaStrength,
        hasOvernightParking: mission.hasOvernightParking,
        grossRate:           mission.grossRate,
        mpg:                 getMpgDefault(mission.rigType),
        fuelPrice:           mission.fuelPrice,
        rigType:             mission.rigType,
      })
      if (!isScoreResultSafe(result)) {
        opLog.guard('NaN in scoreLoad result', { loadNumber: mission.loadNumber, score: result.score, netRpm: result.netRpm })
        return null
      }
      return result
    } catch (err) {
      opLog.error('fuel', 'scoreLoad threw an exception', err)
      return null
    }
  }, [mission])

  // ── Derived: fuel ─────────────────────────────────────────────────────────
  const missionFuel = useMemo(() => {
    if (!mission || (!mission.dispatchMiles && !mission.deadheadMiles)) return null
    try {
      const result = fuelIntel({
        origin:        mission.origin        || '',
        destination:   mission.destination   || '',
        loadedMiles:   mission.dispatchMiles || 0,
        deadheadMiles: mission.deadheadMiles || 0,
        rigType:       mission.rigType       || 'semi-solo',
        mpg:           getMpgDefault(mission.rigType || 'semi-solo'),
        fuelPrice:     mission.fuelPrice     || undefined,
        grossRate:     mission.grossRate     || undefined,
      })
      if (!isFuelResultSafe(result)) {
        opLog.guard('NaN in fuelIntel result', { loadNumber: mission.loadNumber })
        return null
      }
      opLog.fuel('Fuel calc OK', { miles: result.totalMiles, gallons: result.gallonsNeeded, cost: result.fuelCostTotal })
      return result
    } catch (err) {
      opLog.error('fuel', 'fuelIntel threw an exception', err)
      return null
    }
  }, [mission])

  // ── Update a single stop (mark arrived / complete / delayed) ─────────────────
  // Merges partial updates into the stop, then saves the full mission.
  const updateStop = async (stopId: string, updates: Partial<MissionStop>): Promise<void> => {
    if (!mission) return
    const stops = (mission.stops ?? []).map(s =>
      s.id === stopId ? { ...s, ...updates } : s,
    )
    await saveMission({ ...mission, stops })
  }

  // ── Insert a new stop into the active mission ─────────────────────────────
  // Uses insertStop helper for splice + re-sequence, then persists via saveMission.
  const addStop = async (
    stop: MissionStop,
    position: 'after_current' | 'before_final' | 'end' | number = 'end',
  ): Promise<void> => {
    if (!mission) return
    const updated = insertStop(mission, stop, position)
    await saveMission(updated)
  }

  // ── Complete the active mission + persist trip review ───────────────────────
  // Flow:
  //   1. Append minimal record to 3b-completed-missions (localStorage archive, max 50)
  //   2. Remove 3b-latest-load — dashboard clears immediately
  //   3. Null out mission state — ActiveMissionCard goes idle
  //   4. Upsert to fleet_missions with status='completed' + tripReview in metadata
  const completeMission = async (review: TripReview): Promise<void> => {
    if (!mission) return

    const completed: LoadMission = {
      ...mission,
      status:     'completed',
      tripReview: review,
    }

    // 1. Local completed archive — fast, offline-safe
    try {
      const raw     = localStorage.getItem('3b-completed-missions')
      const archive: unknown[] = raw ? JSON.parse(raw) : []
      archive.unshift({
        id:          completed.id,
        loadNumber:  completed.loadNumber,
        origin:      completed.origin,
        destination: completed.destination,
        date:        completed.date,
        tripReview:  review,
        completedAt: review.reviewedAt,
      })
      localStorage.setItem('3b-completed-missions', JSON.stringify(archive.slice(0, 50)))
    } catch { /* ignore */ }

    // 2. Clear active mission from localStorage
    try { localStorage.removeItem('3b-latest-load') } catch { /* ignore */ }

    // 3. Clear state — dashboard goes idle immediately
    setMission(null)
    opLog.mission('Mission completed', { loadNumber: completed.loadNumber })
    void logTimelineEvent('mission_completed', 'mission_loader', {
      loadNumber:   completed.loadNumber,
      origin:       completed.origin,
      destination:  completed.destination,
      driverRating: review.driverRating,
      wouldRunAgain: review.wouldRunAgain,
    }, completed.id ?? completed.loadNumber)

    if (!legacySupabase) {
      setSyncState('local_only')
      return
    }

    // 4. Supabase — mark active mission completed + archive in fleet_missions
    setSyncState('saving')
    try {
      const { userId, businessId } = await getFleetIdentity()

      // 4a. fleet_active_missions — mark completed so it won't restore on reload
      try {
        const { data: { user } } = await createAuthClient().auth.getUser()
        if (user) {
          await db
            .from('fleet_active_missions')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
          opLog.sync('fleet_active_missions marked completed', { loadNumber: completed.loadNumber })
        }
      } catch { /* non-blocking */ }

      // 4b. fleet_missions — historical archive
      const row = missionToRow(completed, { userId, businessId })
      const { error } = await legacySupabase
        .from('fleet_missions')
        .upsert(row, { onConflict: 'id' })

      if (error) {
        setSyncState('failed')
        setMissionSaveError(error.message)
        opLog.syncErr('completeMission upsert failed', { error: error.message })
      } else {
        setSyncState('saved')
        opLog.sync('completeMission upsert OK', { loadNumber: completed.loadNumber })
        setTimeout(() => setSyncState('idle'), 3000)
      }
    } catch (err) {
      setSyncState('failed')
      opLog.error('sync', 'completeMission threw', err)
    }
  }

  return {
    mission,
    missionScore,
    missionFuel,
    saveMission,
    updateStop,
    addStop,
    completeMission,
    missionSaveError,
    syncState,
  }
}
