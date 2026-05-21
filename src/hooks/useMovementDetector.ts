'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const MOVING_MPH_THRESHOLD  = 8     // must exceed this to count as "moving"
const STOPPED_MPH_THRESHOLD = 3     // hysteresis — must drop below this to count as "stopped"
const STOPPED_DEBOUNCE_MS   = 60_000 // wait 60s at low speed before firing "just stopped" alert
                                      // avoids red-light / toll-booth false positives
const SNOOZE_MOVING_MS      = 15 * 60 * 1000  // 15 min snooze for started_moving
const SNOOZE_STOPPED_MS     =  5 * 60 * 1000  //  5 min snooze for just_stopped (more urgent)

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:            10_000,
  maximumAge:         3_000,   // very fresh for speed accuracy
}

export type MovementState = 'unknown' | 'stopped' | 'moving'
export type AlertType     = 'started_moving' | 'just_stopped' | null

export type MovementData = {
  speedMph:      number | null   // current GPS speed (rounded mph)
  movementState: MovementState
  alertType:     AlertType       // what triggered the current alert
  showAlert:     boolean
  acknowledge:   () => void      // dismiss + snooze
}

function mpsToMph(mps: number): number {
  return mps * 2.23694
}

export function useMovementDetector(enabled: boolean): MovementData {
  const [speedMph,      setSpeedMph]      = useState<number | null>(null)
  const [movementState, setMovementState] = useState<MovementState>('unknown')
  const [alertType,     setAlertType]     = useState<AlertType>(null)
  const [showAlert,     setShowAlert]     = useState(false)

  const snoozeUntil      = useRef<number>(0)
  const watchId          = useRef<number | null>(null)
  const stoppedTimerId   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasMoving        = useRef(false)   // edge-trigger: stopped → moving
  const currentAlertType = useRef<AlertType>(null)

  const acknowledge = useCallback(() => {
    const snoozeMs = currentAlertType.current === 'just_stopped'
      ? SNOOZE_STOPPED_MS
      : SNOOZE_MOVING_MS
    snoozeUntil.current = Date.now() + snoozeMs
    setShowAlert(false)
    setAlertType(null)
    currentAlertType.current = null
  }, [])

  const fireAlert = useCallback((type: AlertType) => {
    if (Date.now() < snoozeUntil.current) return
    currentAlertType.current = type
    setAlertType(type)
    setShowAlert(true)
  }, [])

  const clearStoppedTimer = () => {
    if (stoppedTimerId.current !== null) {
      clearTimeout(stoppedTimerId.current)
      stoppedTimerId.current = null
    }
  }

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setSpeedMph(null)
      setMovementState('unknown')
      setShowAlert(false)
      setAlertType(null)
      currentAlertType.current = null
      clearStoppedTimer()
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      return
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const raw = pos.coords.speed   // m/s or null on some devices
        if (raw == null || raw < 0) return

        const mph = mpsToMph(raw)
        setSpeedMph(Math.round(mph))

        // ── Truck is moving ───────────────────────────────────────────────────
        if (mph >= MOVING_MPH_THRESHOLD) {
          clearStoppedTimer()           // cancel any pending stopped debounce
          setMovementState('moving')

          // Dismiss any active stopped alert — we're moving again
          if (currentAlertType.current === 'just_stopped') {
            setShowAlert(false)
            setAlertType(null)
            currentAlertType.current = null
          }

          // Edge-trigger: fire only on transition stopped → moving
          if (!wasMoving.current) {
            fireAlert('started_moving')
          }
          wasMoving.current = true
          return
        }

        // ── Truck is in low-speed zone (may be stopping) ──────────────────────
        if (mph < STOPPED_MPH_THRESHOLD) {
          setMovementState('stopped')

          // Edge-trigger: fire only on transition moving → stopped
          if (wasMoving.current) {
            wasMoving.current = false

            // Dismiss started_moving alert immediately on stop
            if (currentAlertType.current === 'started_moving') {
              setShowAlert(false)
              setAlertType(null)
              currentAlertType.current = null
            }

            // Debounce: only fire "just stopped" after 60s of staying stopped
            // This ignores red lights, toll booths, brief pauses
            clearStoppedTimer()
            stoppedTimerId.current = setTimeout(() => {
              fireAlert('just_stopped')
            }, STOPPED_DEBOUNCE_MS)
          }
        }
      },
      () => { /* GPS error — silent */ },
      WATCH_OPTIONS,
    )

    return () => {
      clearStoppedTimer()
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
    }
  }, [enabled, fireAlert])

  return { speedMph, movementState, alertType, showAlert, acknowledge }
}
