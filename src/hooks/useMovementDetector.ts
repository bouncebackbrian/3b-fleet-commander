'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { opLog } from '@/lib/logger'

const MOVING_MPH_THRESHOLD  = 8
const STOPPED_MPH_THRESHOLD = 3
const STOPPED_DEBOUNCE_MS   = 60_000
const SNOOZE_MOVING_MS      = 15 * 60 * 1000
const SNOOZE_STOPPED_MS     =  5 * 60 * 1000

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:            10_000,
  maximumAge:         3_000,
}

export type MovementState = 'unknown' | 'stopped' | 'moving'
export type AlertType     = 'started_moving' | 'just_stopped' | null

export type MovementFix = {
  lat: number
  lng: number
  accuracyM: number | null
  capturedAt: string
}

export type MovementData = {
  speedMph:      number | null
  movementState: MovementState
  geo:           MovementFix | null
  alertType:     AlertType
  showAlert:     boolean
  acknowledge:   () => void
}

function mpsToMph(mps: number): number {
  return mps * 2.23694
}

export function useMovementDetector(enabled: boolean): MovementData {
  const [speedMph,      setSpeedMph]      = useState<number | null>(null)
  const [movementState, setMovementState] = useState<MovementState>('unknown')
  const [geo,           setGeo]           = useState<MovementFix | null>(null)
  const [alertType,     setAlertType]     = useState<AlertType>(null)
  const [showAlert,     setShowAlert]     = useState(false)

  const snoozeUntil      = useRef<number>(0)
  const watchId          = useRef<number | null>(null)
  const stoppedTimerId   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasMoving        = useRef(false)
  const currentAlertType = useRef<AlertType>(null)
  const latestGeo        = useRef<MovementFix | null>(null)

  const acknowledge = useCallback(() => {
    const snoozeMs = currentAlertType.current === 'just_stopped'
      ? SNOOZE_STOPPED_MS
      : SNOOZE_MOVING_MS
    snoozeUntil.current = Date.now() + snoozeMs
    setShowAlert(false)
    setAlertType(null)
    currentAlertType.current = null
  }, [])

  const fireAlert = useCallback((type: AlertType, speedAtFire: number | null = null) => {
    if (Date.now() < snoozeUntil.current) return
    currentAlertType.current = type
    setAlertType(type)
    setShowAlert(true)
    const fix = latestGeo.current
    opLog.movement(`movement_alert: ${type}`, {
      alertType: type,
      speedMph: speedAtFire,
      timestamp: new Date().toISOString(),
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracyM: fix?.accuracyM ?? null,
      gpsCapturedAt: fix?.capturedAt ?? null,
    })
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
      setGeo(null)
      latestGeo.current = null
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
        const fix: MovementFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          capturedAt: new Date(pos.timestamp).toISOString(),
        }
        latestGeo.current = fix
        setGeo(fix)

        const raw = pos.coords.speed
        if (raw == null || raw < 0) return

        const mph = mpsToMph(raw)
        setSpeedMph(Math.round(mph))

        if (mph >= MOVING_MPH_THRESHOLD) {
          clearStoppedTimer()
          setMovementState('moving')

          if (currentAlertType.current === 'just_stopped') {
            setShowAlert(false)
            setAlertType(null)
            currentAlertType.current = null
          }

          if (!wasMoving.current) {
            fireAlert('started_moving', Math.round(mph))
          }
          wasMoving.current = true
          return
        }

        if (mph < STOPPED_MPH_THRESHOLD) {
          setMovementState('stopped')

          if (wasMoving.current) {
            wasMoving.current = false

            if (currentAlertType.current === 'started_moving') {
              setShowAlert(false)
              setAlertType(null)
              currentAlertType.current = null
            }

            clearStoppedTimer()
            stoppedTimerId.current = setTimeout(() => {
              fireAlert('just_stopped', 0)
            }, STOPPED_DEBOUNCE_MS)
          }
        }
      },
      () => { /* GPS error — keep the last known evidence */ },
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

  return { speedMph, movementState, geo, alertType, showAlert, acknowledge }
}
