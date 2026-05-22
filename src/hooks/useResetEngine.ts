'use client'
/**
 * useResetEngine — HOS rest / reset timer.
 *
 * Supports:
 *   30_min_break    → 30 min  (replaces useBreakTimer for the break portion)
 *   10_hour_reset   → 600 min (10 h)
 *   34_hour_restart → 2040 min (34 h)
 *   custom          → caller-specified minutes
 *
 * Persists to localStorage so a page refresh restores the active countdown.
 * Emits a RestEvent record on start/end for the timeline.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { ResetType, RestEvent, LoadMission } from '@/lib/dashboard/types'
import { opLog } from '@/lib/logger'
import { toast } from '@/hooks/useToast'

export const RESET_TARGETS: Record<ResetType, number> = {
  '30_min_break':    30,
  '10_hour_reset':   600,
  '34_hour_restart': 2040,
  'custom':          0,    // overridden by caller
}

export const RESET_LABELS: Record<ResetType, string> = {
  '30_min_break':    '30-Min Break',
  '10_hour_reset':   '10-Hour Reset',
  '34_hour_restart': '34-Hour Restart',
  'custom':          'Custom Rest',
}

export const RESET_EMOJIS: Record<ResetType, string> = {
  '30_min_break':    '☕',
  '10_hour_reset':   '🛏️',
  '34_hour_restart': '🔄',
  'custom':          '⏱',
}

interface ActiveReset {
  id:              string
  type:            ResetType
  startedAt:       string   // ISO
  targetMinutes:   number
  locationName?:   string
  city?:           string
  state?:          string
  missionId?:      string
  orderNumber?:    string
}

const LS_KEY = '3b-active-reset'

function loadActiveReset(): ActiveReset | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) as ActiveReset : null
  } catch { return null }
}

function fmt(totalSecs: number): string {
  if (totalSecs < 0) return '0:00'
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Options {
  mission?: LoadMission | null
  onRestEventCreated?: (event: RestEvent) => void
}

export function useResetEngine({ mission, onRestEventCreated }: Options = {}) {
  const [active,           setActive]          = useState<ActiveReset | null>(null)
  const [elapsedSecs,      setElapsedSecs]      = useState(0)
  const [showResetPanel,   setShowResetPanel]   = useState(false)
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Restore from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    const saved = loadActiveReset()
    if (!saved) return
    // Recompute elapsed so timer is accurate after page refresh
    const elapsed = Math.floor((Date.now() - new Date(saved.startedAt).getTime()) / 1000)
    const targetSecs = saved.targetMinutes * 60
    if (elapsed >= targetSecs) {
      // Already completed while app was closed
      localStorage.removeItem(LS_KEY)
      toast.success(`${RESET_LABELS[saved.type]} completed while you were away ✓`)
      opLog.break(`${saved.type} auto-completed on restore`, { elapsed })
    } else {
      setActive(saved)
      setElapsedSecs(elapsed)
    }
  }, [])

  // ── Tick ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) { intervalRef.current && clearInterval(intervalRef.current); return }

    intervalRef.current = setInterval(() => {
      setElapsedSecs(prev => {
        const next = prev + 1
        const targetSecs = active.targetMinutes * 60
        if (next >= targetSecs) {
          // Auto-complete
          clearInterval(intervalRef.current!)
          toast.success(`✅ ${RESET_LABELS[active.type]} complete — ${active.targetMinutes} min logged`)
          opLog.break(`${active.type} completed`, { targetMinutes: active.targetMinutes })
          localStorage.removeItem(LS_KEY)
          setActive(null)
          return 0
        }
        return next
      })
    }, 1000)

    return () => { intervalRef.current && clearInterval(intervalRef.current) }
  }, [active])

  // ── Start ─────────────────────────────────────────────────────────────────
  const startReset = useCallback((
    type: ResetType,
    opts?: { locationName?: string; city?: string; state?: string; customMinutes?: number },
  ) => {
    // Duplicate guard
    if (active) {
      opLog.guard('startReset blocked — reset already active', { activeType: active.type })
      setShowResetPanel(true)
      return
    }

    const targetMinutes = type === 'custom'
      ? (opts?.customMinutes ?? 30)
      : RESET_TARGETS[type]

    const newReset: ActiveReset = {
      id:            crypto.randomUUID(),
      type,
      startedAt:     new Date().toISOString(),
      targetMinutes,
      locationName:  opts?.locationName,
      city:          opts?.city,
      state:         opts?.state,
      missionId:     mission?.id,
      orderNumber:   mission?.orderNumber ?? mission?.loadNumber,
    }

    try { localStorage.setItem(LS_KEY, JSON.stringify(newReset)) } catch { /* ignore */ }
    setActive(newReset)
    setElapsedSecs(0)
    setShowResetPanel(true)

    opLog.break(`${type} started`, { targetMinutes, location: opts?.locationName })
    toast.success(`${RESET_EMOJIS[type]} ${RESET_LABELS[type]} started`)

    // Emit rest event record
    const restEvent: RestEvent = {
      id:                    newReset.id,
      missionId:             mission?.id ?? null,
      orderNumber:           mission?.orderNumber ?? mission?.loadNumber,
      restType:              type,
      startedAt:             newReset.startedAt,
      targetDurationMinutes: targetMinutes,
      locationName:          opts?.locationName,
      city:                  opts?.city,
      state:                 opts?.state,
      status:                'active',
      loggedAt:              new Date().toISOString(),
    }
    try {
      const raw = localStorage.getItem('3b-rest-events') ?? '[]'
      const events: RestEvent[] = JSON.parse(raw)
      events.unshift(restEvent)
      localStorage.setItem('3b-rest-events', JSON.stringify(events.slice(0, 100)))
    } catch { /* ignore */ }
    onRestEventCreated?.(restEvent)
  }, [active, mission, onRestEventCreated])

  // ── End (manual) ──────────────────────────────────────────────────────────
  const endReset = useCallback((interrupted = false) => {
    if (!active) return

    const actualMinutes = Math.round(elapsedSecs / 60)
    const targetSecs    = active.targetMinutes * 60
    const completed     = elapsedSecs >= targetSecs

    opLog.break(`${active.type} ended`, { actualMinutes, interrupted, completed })

    if (interrupted) {
      toast.warn(`⏹ ${RESET_LABELS[active.type]} ended early — ${actualMinutes} min`)
    } else if (completed) {
      toast.success(`✅ ${RESET_LABELS[active.type]} complete — ${actualMinutes} min`)
    } else {
      toast.warn(`⏹ ${RESET_LABELS[active.type]} ended — ${actualMinutes}/${active.targetMinutes} min`)
    }

    // Update rest event record
    try {
      const raw    = localStorage.getItem('3b-rest-events') ?? '[]'
      const events = JSON.parse(raw) as RestEvent[]
      const idx    = events.findIndex(e => e.id === active.id)
      if (idx !== -1) {
        events[idx] = {
          ...events[idx],
          endedAt:               new Date().toISOString(),
          actualDurationMinutes: actualMinutes,
          status:                interrupted ? 'interrupted' : 'completed',
        }
        localStorage.setItem('3b-rest-events', JSON.stringify(events))
      }
    } catch { /* ignore */ }

    localStorage.removeItem(LS_KEY)
    setActive(null)
    setElapsedSecs(0)
    setShowResetPanel(false)
  }, [active, elapsedSecs])

  // ── Derived ───────────────────────────────────────────────────────────────
  const targetSecs    = active ? active.targetMinutes * 60 : 0
  const remainingSecs = Math.max(0, targetSecs - elapsedSecs)
  const progress      = active && targetSecs > 0 ? Math.min(1, elapsedSecs / targetSecs) : 0
  const isComplete    = active ? elapsedSecs >= targetSecs : false

  return {
    resetActive:    !!active,
    activeReset:    active,
    resetType:      active?.type ?? null,
    elapsedSecs,
    remainingSecs,
    targetSecs,
    progress,
    isComplete,
    showResetPanel,
    setShowResetPanel,
    startReset,
    endReset,
    fmt,
    RESET_LABELS,
    RESET_EMOJIS,
    RESET_TARGETS,
  }
}
