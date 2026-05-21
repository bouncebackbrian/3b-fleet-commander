'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const MOVING_MPH_THRESHOLD  = 8    // below this = stopped (parking lots, slow traffic)
const STOPPED_MPH_THRESHOLD = 3    // hysteresis — must drop below this to reset "moving" state
const SNOOZE_MS             = 15 * 60 * 1000  // 15 min snooze after dismiss
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:            10_000,
  maximumAge:         3_000,   // very fresh for speed accuracy
}

export type MovementState = 'unknown' | 'stopped' | 'moving'

export type MovementData = {
  speedMph:      number | null    // current GPS speed
  movementState: MovementState    // derived state
  showAlert:     boolean          // true → render the popup
  snooze:        () => void       // call on dismiss — suppresses for 15 min
  acknowledge:   () => void       // call on "Got it" — same as snooze
}

function mpsToMph(mps: number): number {
  return mps * 2.23694
}

export function useMovementDetector(enabled: boolean): MovementData {
  const [speedMph,      setSpeedMph]      = useState<number | null>(null)
  const [movementState, setMovementState] = useState<MovementState>('unknown')
  const [showAlert,     setShowAlert]     = useState(false)

  const snoozeUntil  = useRef<number>(0)
  const watchId      = useRef<number | null>(null)
  const wasMoving    = useRef(false)  // tracks previous state for edge-trigger

  const snooze = useCallback(() => {
    snoozeUntil.current = Date.now() + SNOOZE_MS
    setShowAlert(false)
  }, [])

  const acknowledge = useCallback(() => {
    snoozeUntil.current = Date.now() + SNOOZE_MS
    setShowAlert(false)
  }, [])

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      // Clear state when driving mode is off
      setSpeedMph(null)
      setMovementState('unknown')
      setShowAlert(false)
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      return
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const raw = pos.coords.speed   // m/s or null
        if (raw == null || raw < 0) return

        const mph = mpsToMph(raw)
        setSpeedMph(Math.round(mph))

        const nowMoving = mph >= MOVING_MPH_THRESHOLD

        // Hysteresis: only reset wasMoving when fully stopped
        if (mph < STOPPED_MPH_THRESHOLD) {
          wasMoving.current = false
          setMovementState('stopped')
          setShowAlert(false)   // clear alert when stopped
          return
        }

        if (nowMoving) {
          setMovementState('moving')

          // Edge-trigger: only fire alert on transition from stopped → moving
          // (not on every position update while already moving)
          const snoozed = Date.now() < snoozeUntil.current
          if (!wasMoving.current && !snoozed) {
            setShowAlert(true)
          }
          wasMoving.current = true
        }
      },
      () => { /* GPS error — silent, don't block app */ },
      WATCH_OPTIONS,
    )

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
    }
  }, [enabled])

  return { speedMph, movementState, showAlert, snooze, acknowledge }
}
