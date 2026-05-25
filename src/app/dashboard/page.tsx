'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import TopBar     from '@/components/layout/TopBar'
import CcSidebar  from '@/components/dashboard/CcSidebar'

// ── Types
import type { EldMode, VehicleSetup, HOSData, SamsaraData, ActiveTrip, MissionStop } from '@/lib/dashboard/types'
// ── Observability
import { opLog } from '@/lib/logger'
import { validateHOS } from '@/lib/guards'
import { toast } from '@/hooks/useToast'
import { logTimelineEvent } from '@/lib/timeline'
import { computeRouteRisk } from '@/lib/dashboard/routePreference'
import type { RoutePreference } from '@/lib/dashboard/types'

// ── Hooks
import { useWeather }            from '@/hooks/useWeather'
import { useBreakTimer }         from '@/hooks/useBreakTimer'
import { useMission }            from '@/hooks/useMission'
import { useStopEvents }         from '@/hooks/useStopEvents'
import { useLaneIntelligence }   from '@/hooks/useLaneIntelligence'
import { useOperationalMemory }  from '@/hooks/useOperationalMemory'
import { useOnlineStatus }       from '@/hooks/useOnlineStatus'
import { useMovementDetector }   from '@/hooks/useMovementDetector'
import { useAutosave }           from '@/hooks/useAutosave'
import { useResetEngine }        from '@/hooks/useResetEngine'
import { useSpotify }            from '@/hooks/useSpotify'

// ── Overlays
import EmergencySheet    from '@/components/dashboard/overlays/EmergencySheet'
import BreakTimerModal   from '@/components/dashboard/overlays/BreakTimerModal'
import DrivingModeOverlay from '@/components/dashboard/overlays/DrivingModeOverlay'
import IncidentSheet        from '@/components/incidents/IncidentSheet'
import ComplianceProofModal  from '@/components/incidents/ComplianceProofModal'
import TrailerHookSheet       from '@/components/trailer/TrailerHookSheet'
import TrailerHistoryPanel    from '@/components/trailer/TrailerHistoryPanel'
import ComplianceEventSheet   from '@/components/compliance/ComplianceEventSheet'
import DriverUpdateSheet      from '@/components/dispatch/DriverUpdateSheet'

// ── Sheets
import NewLoadSheet      from '@/components/dashboard/sheets/NewLoadSheet'
import FuelPlanSheet     from '@/components/dashboard/sheets/FuelPlanSheet'
import HosDetailSheet    from '@/components/dashboard/sheets/HosDetailSheet'
import DocsSheet         from '@/components/dashboard/sheets/DocsSheet'
import VoicePanel        from '@/components/dashboard/sheets/VoicePanel'
import LogEventSheet      from '@/components/dashboard/sheets/LogEventSheet'
import MissionHistoryPanel from '@/components/dashboard/panels/MissionHistoryPanel'
import AddStopSheet         from '@/components/dashboard/sheets/AddStopSheet'
import StopLifecyclePanel  from '@/components/dashboard/sheets/StopLifecyclePanel'
import TripReviewSheet     from '@/components/dashboard/sheets/TripReviewSheet'
import CompletedTripsPanel from '@/components/dashboard/panels/CompletedTripsPanel'
import MusicPanel              from '@/components/dashboard/panels/MusicPanel'
import GymFinderPanel          from '@/components/dashboard/panels/GymFinderPanel'
import LaneIntelligencePanel   from '@/components/dashboard/panels/LaneIntelligencePanel'
import SettlementPanel         from '@/components/dashboard/panels/SettlementPanel'
import OrderTimelinePanel      from '@/components/dashboard/panels/OrderTimelinePanel'
import ResetPanel              from '@/components/dashboard/panels/ResetPanel'
import ReceiverIntelPanel      from '@/components/dashboard/panels/ReceiverIntelPanel'
import ToastContainer      from '@/components/shared/ToastContainer'
import OfflineBanner       from '@/components/shared/OfflineBanner'
import DebugPanel          from '@/components/debug/DebugPanel'

// ── Maintenance
import PMStatusCard from '@/components/maintenance/PMStatusCard'
import PMSchedulerSheet from '@/components/maintenance/PMSchedulerSheet'
import {
  PM_CONFIG,
  getActivePMTasks,
  getNearestServiceLocation,
  getMaintenanceContext,
  type PMTask,
  type PMSchedule,
} from '@/lib/maintenanceEngine'

// ── Cards
import ActiveMissionCard from '@/components/dashboard/cards/ActiveMissionCard'
import ActiveTripCard    from '@/components/dashboard/cards/ActiveTripCard'
import AlertsCard        from '@/components/dashboard/cards/AlertsCard'
import HosCard           from '@/components/dashboard/cards/HosCard'
import FuelWeatherRow    from '@/components/dashboard/cards/FuelWeatherRow'
import ExpensesCard      from '@/components/dashboard/cards/ExpensesCard'
import QuickNavCard            from '@/components/dashboard/cards/QuickNavCard'
import NavigationSnapshotCard from '@/components/dashboard/cards/NavigationSnapshotCard'
import MovementAlert     from '@/components/dashboard/cards/MovementAlert'
import LocationBar       from '@/components/dashboard/cards/LocationBar'

// ── Actions
import StatusBar from '@/components/dashboard/actions/StatusBar'

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  // ── Clock
  const [liveClock, setLiveClock] = useState('')
  const [liveDate,  setLiveDate]  = useState('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setLiveClock(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setLiveDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── LocalStorage: settings + vehicle + active trip
  const [driverMode, setDriverMode] = useState(false)
  const [vehicle,    setVehicle]    = useState<VehicleSetup | null>(null)
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('3b-fleet-settings')
      if (raw) { const parsed = JSON.parse(raw); setDriverMode(!!parsed.driverMode) }
    } catch { /* ignore */ }
    try { const v = localStorage.getItem('3b-vehicle');     if (v) setVehicle(JSON.parse(v)) }    catch { /* ignore */ }
    try { const t = localStorage.getItem('3b-active-trip'); if (t) setActiveTrip(JSON.parse(t)) } catch { /* ignore */ }
  }, [])

  // ── HOS state (tightly coupled to scan handler — stays here)
  const [hos,         setHos]         = useState<HOSData | null>(null)
  const [hosScanning, setHosScanning] = useState(false)
  const [hosError,    setHosError]    = useState('')
  const [eldMode,     setEldMode]     = useState<EldMode>('screenshot')
  const [samsara,     setSamsara]     = useState<SamsaraData | null>(null)
  const hosInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { const h = localStorage.getItem('3b-hos-data');  if (h) setHos(JSON.parse(h)) }       catch { /* ignore */ }
    try { const m = localStorage.getItem('3b-eld-mode') as EldMode | null; if (m) setEldMode(m) } catch { /* ignore */ }
  }, [])

  // ── Samsara polling
  useEffect(() => {
    if (eldMode !== 'samsara') return
    const poll = async () => {
      try {
        const tok = localStorage.getItem('samsara-api-token') ?? ''
        const headers: HeadersInit = tok ? { 'x-samsara-token': tok } : {}
        const res = await fetch('/api/samsara', { headers })
        setSamsara(await res.json())
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [eldMode])

  const handleScanHos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setHosScanning(true); setHosError('')
    opLog.hos('HOS scan started', { fileName: file.name })
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/extract-hos', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const data: HOSData = await res.json()
      data.scannedAt = new Date().toISOString()
      // Runtime HOS validation
      const hosErrors = validateHOS(data)
      if (hosErrors.length > 0) opLog.guard('HOS parse warnings', { errors: hosErrors })
      localStorage.setItem('3b-hos-data', JSON.stringify(data))
      setHos(data)
      opLog.hos('HOS scan complete', { driveRem: data.driveRemainingHrs, shiftRem: data.shiftRemainingHrs })
      toast.success('HOS data updated')
      void logTimelineEvent('hos_scanned', 'hos_scanner', {
        driveRem:  data.driveRemainingHrs,
        shiftRem:  data.shiftRemainingHrs,
        source:    eldMode,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      setHosError(msg)
      opLog.error('hos', 'HOS scan failed', err)
      toast.error(`HOS scan failed: ${msg.slice(0, 60)}`)
    } finally {
      setHosScanning(false)
      if (hosInputRef.current) hosInputRef.current.value = ''
    }
  }

  // ── Render timing guard (dev only) ──────────────────────────────────────────
  const _renderTs = useRef<number>(0)
  _renderTs.current = performance.now()
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const ms = performance.now() - _renderTs.current
      if (ms > 100) opLog.render(`Dashboard slow render: ${ms.toFixed(1)}ms`, { ms })
    }
  }) // no deps — fires after every render

  // ── Hooks
  const { weather, weatherLoading, wx, lastUpdated: weatherUpdated, refresh: refreshWeather } = useWeather()
  const { mission, missionScore, missionFuel, saveMission, updateStop, addStop, completeMission, missionSaveError, syncState } = useMission()
  const { advanceLifecycle } = useStopEvents()
  const { metrics: laneMetrics, loading: laneLoading } = useLaneIntelligence(
    mission?.origin,
    mission?.destination,
  )
  const {
    breakActive, breakSecs, showBreakModal, setShowBreakModal,
    handleStartBreak, handleEndBreak, BREAK_TARGET, fmtBreak,
  } = useBreakTimer()
  const {
    events: opEvents, history: opHistory, insights: opInsights,
    aiInsight, insightLoading, logEvent, generateInsight,
  } = useOperationalMemory(mission)
  const isOnline = useOnlineStatus()

  // ── Autosave mission versions ────────────────────────────────────────────────
  const { saveVersion } = useAutosave('3b-latest-load', mission)

  // ── Reset engine (10h / 34h / 30-min) ───────────────────────────────────────
  const resetEngine = useResetEngine({ mission })

  // ── Route risk (deterministic, zero cost) ───────────────────────────────────
  const routeRisk = mission
    ? computeRouteRisk(mission.routeNotes, mission.routePreference ?? 'main_corridors')
    : null

  const changeRoutePreference = (pref: RoutePreference) => {
    if (!mission) return
    saveMission({ ...mission, routePreference: pref })
  }

  // ── Stop completion handlers ─────────────────────────────────────────────────
  const handleCompleteStop = (stopId: string) =>
    updateStop(stopId, { completed: true, completedAt: new Date().toISOString() })
  const handleUndoStop = (stopId: string) =>
    updateStop(stopId, { completed: false, completedAt: undefined })

  // ── Quick Arrive / Leave handlers (Phase 4K) ─────────────────────────────────
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  // Derive current active stop in one place — same logic as ActiveMissionCard
  const currentActiveStop = useMemo(() => {
    if (!mission?.stops) return null
    return [...mission.stops].sort((a, b) => a.sequence - b.sequence).find(s => !s.completed) ?? null
  }, [mission?.stops])

  // Format dwell time for toast
  const fmtDwell = (minutes: number): string => {
    if (minutes < 1) return '< 1m'
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const handleQuickArrive = useCallback(async () => {
    if (!currentActiveStop) return
    setQuickSubmitting(true)
    try {
      await advanceLifecycle(currentActiveStop, 'arrived')
      opLog.event('quick_arrived', {
        stopId:       currentActiveStop.id,
        stopSequence: currentActiveStop.sequence,
        dwellMinutes: 0,
        detentionMinutes: 0,
      })
      toast.success(`📍 Arrived at ${currentActiveStop.name || `Stop ${currentActiveStop.sequence}`}`)
    } finally {
      setQuickSubmitting(false)
    }
  }, [currentActiveStop, advanceLifecycle])

  const handleQuickLeave = useCallback(async (forceArriveNow: boolean) => {
    if (!currentActiveStop) return
    setQuickSubmitting(true)
    try {
      // If no arrival recorded and user confirmed, log an arrived event first
      // (stop state may not have updated yet — advanceLifecycle('departed') reads
      //  lifecycleTimestamps.arrived from the stop object we pass, so compute arrivedAt here)
      let arrivedAt = currentActiveStop.lifecycleTimestamps?.arrived ?? null
      if (!arrivedAt && forceArriveNow) {
        arrivedAt = new Date().toISOString()
        // Manually set arrived first so the departed call can compute detention
        await advanceLifecycle(
          { ...currentActiveStop, lifecycleTimestamps: { ...currentActiveStop.lifecycleTimestamps, arrived: arrivedAt } },
          'arrived',
        )
      }

      const departedAt    = new Date().toISOString()
      const dwellMs       = arrivedAt ? Math.max(0, new Date(departedAt).getTime() - new Date(arrivedAt).getTime()) : 0
      const dwellMinutes  = Math.round(dwellMs / 60000)
      const detMins       = Math.max(0, dwellMinutes - 120)
      const detAmount     = parseFloat(((detMins / 60) * 50).toFixed(2))

      // Pass the stop with arrivedAt already in it so advanceLifecycle computes detention correctly
      const stopForDepart = arrivedAt
        ? { ...currentActiveStop, lifecycleTimestamps: { ...(currentActiveStop.lifecycleTimestamps ?? {}), arrived: arrivedAt } }
        : currentActiveStop

      await advanceLifecycle(stopForDepart, 'departed')

      opLog.event('quick_departed', {
        stopId:          currentActiveStop.id,
        stopSequence:    currentActiveStop.sequence,
        dwellMinutes,
        detentionMinutes: detMins,
      })

      const detStr = detMins > 0
        ? driverMode
          ? ` · ⏱ ${detMins}m detention`
          : ` · ⏱ $${detAmount.toFixed(2)} detention`
        : ''

      toast.success(`🚛 Departed Stop ${currentActiveStop.sequence} · ${fmtDwell(dwellMinutes)}${detStr}`)
    } finally {
      setQuickSubmitting(false)
    }
  }, [currentActiveStop, advanceLifecycle, driverMode])

  // ── Online/offline transition toasts ────────────────────────────────────────
  const prevOnline = useRef<boolean>(true)
  useEffect(() => {
    if (!isOnline && prevOnline.current) {
      toast.offline('Offline Mode — changes saving locally')
      opLog.warn('sync', 'Network went offline')
    } else if (isOnline && !prevOnline.current) {
      toast.success('Back online — syncing to cloud')
      opLog.sync('Network restored')
    }
    prevOnline.current = isOnline
  }, [isOnline])

  // ── PM task loader
  useEffect(() => {
    const ctx   = getMaintenanceContext()
    const tasks = getActivePMTasks(ctx.truckNumber || undefined)
    setPmTasks(tasks)
    if (tasks.length > 0) {
      setPmNearestLoc(getNearestServiceLocation(40.0, -112.0))
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          setPmGpsLat(pos.coords.latitude)
          setPmGpsLng(pos.coords.longitude)
          setPmNearestLoc(getNearestServiceLocation(pos.coords.latitude, pos.coords.longitude))
        }, () => { /* no gps */ })
      }
    }
  }, [])

  // ── Panel toggles
  const [drivingMode,       setDrivingMode]       = useState(false)
  // ── Spotify — active polling (5s) during driving mode, background (30s) otherwise
  const spotify = useSpotify(drivingMode)

  const [showNewLoadSheet,  setShowNewLoadSheet]  = useState(false)
  const [showHosDetail,     setShowHosDetail]     = useState(false)
  const [showFuelSheet,     setShowFuelSheet]     = useState(false)
  const [showDocsSheet,     setShowDocsSheet]     = useState(false)
  const [showEmergency,     setShowEmergency]     = useState(false)
  const [showVoicePanel,    setShowVoicePanel]    = useState(false)
  const [showLogEvent,      setShowLogEvent]      = useState(false)
  const [showHistoryPanel,  setShowHistoryPanel]  = useState(false)
  const [showAddStop,       setShowAddStop]       = useState(false)
  const [showTripReview,    setShowTripReview]    = useState(false)
  const [showCompletedTrips,setShowCompletedTrips] = useState(false)
  const [selectedStop,      setSelectedStop]      = useState<MissionStop | null>(null)
  const [showMusicPanel,      setShowMusicPanel]      = useState(false)
  const [showGymFinder,       setShowGymFinder]       = useState(false)
  const [showLanePanel,       setShowLanePanel]       = useState(false)
  const [showSettlementPanel, setShowSettlementPanel] = useState(false)
  const [showTimeline,        setShowTimeline]        = useState(false)
  const [showReceiverIntel,   setShowReceiverIntel]   = useState(false)
  const [showIncidentSheet,   setShowIncidentSheet]   = useState(false)
  const [showComplianceProof, setShowComplianceProof] = useState(false)
  const [showTrailerHook,     setShowTrailerHook]     = useState(false)
  const [showTrailerHistory,  setShowTrailerHistory]  = useState(false)
  const [trailerHookType,     setTrailerHookType]     = useState<'empty_hook' | 'loaded_hook' | 'empty_drop' | 'loaded_drop'>('empty_hook')
  const [showComplianceEvent,  setShowComplianceEvent]  = useState(false)
  const [showDriverUpdate,     setShowDriverUpdate]     = useState(false)

  // ── PM state
  const [pmTasks,       setPmTasks]       = useState<PMTask[]>([])
  const [pmNearestLoc,  setPmNearestLoc]  = useState<ReturnType<typeof getNearestServiceLocation>>(null)
  const [showPMSheet,   setShowPMSheet]   = useState(false)
  const [pmSheetTask,   setPmSheetTask]   = useState<PMTask | null>(null)
  const [pmGpsLat,      setPmGpsLat]      = useState<number | undefined>()
  const [pmGpsLng,      setPmGpsLng]      = useState<number | undefined>()

  // Movement detector — only active when driving mode is on
  const movement = useMovementDetector(drivingMode)

  // ── Derived HOS display
  const hosDisplay = (() => {
    if (eldMode === 'samsara' && samsara?.hos) {
      const h = samsara.hos
      return { driveUsed: Math.max(0, 11 - h.driveRemainingHrs), driveRem: h.driveRemainingHrs, shiftUsed: Math.max(0, 14 - h.shiftRemainingHrs), shiftRem: h.shiftRemainingHrs, cycleRem: h.cycleRemainingHrs, breakIn: h.breakInHrs, status: h.status, source: 'samsara' as const }
    }
    if (hos) {
      const driveUsed = hos.driveUsedHrs ?? Math.max(0, 11 - (hos.driveRemainingHrs ?? 11))
      const shiftUsed = hos.onDutyUsedHrs ?? Math.max(0, 14 - (hos.shiftRemainingHrs ?? 14))
      return { driveUsed, driveRem: hos.driveRemainingHrs ?? Math.max(0, 11 - driveUsed), shiftUsed, shiftRem: hos.shiftRemainingHrs ?? Math.max(0, 14 - shiftUsed), cycleRem: hos.cycleRemainingHrs, breakIn: hos.breakInHrs, status: hos.status, source: 'screenshot' as const }
    }
    return null
  })()

  const driveColor = !hosDisplay ? 'var(--primary)' : hosDisplay.driveRem <= 2 ? 'var(--error)' : hosDisplay.driveRem <= 4 ? 'var(--warn)' : 'var(--primary)'
  const shiftColor = !hosDisplay ? '#6c9bd2'        : hosDisplay.shiftRem <= 2 ? 'var(--error)' : hosDisplay.shiftRem <= 4 ? 'var(--warn)' : '#6c9bd2'

  const statusMap: Record<string, string>      = { Driving: 'var(--primary)', driving: 'var(--primary)', 'Off Duty': 'var(--muted)', offDuty: 'var(--muted)', 'On Duty': 'var(--warn)', onDutyNotDriving: 'var(--warn)', 'Sleeper Berth': 'var(--muted)', sleeperBed: 'var(--muted)' }
  const statusLabelMap: Record<string, string> = { driving: 'Driving', offDuty: 'Off Duty', onDutyNotDriving: 'On Duty', sleeperBed: 'Sleeper Berth' }
  const statusLabel = hosDisplay?.status ? (statusLabelMap[hosDisplay.status] ?? hosDisplay.status) : null
  const statusColor = hosDisplay?.status ? (statusMap[hosDisplay.status] ?? 'var(--text)') : 'var(--muted)'

  // ── Operational alert priorities
  const operationalAlerts = useMemo(() => {
    const high: string[] = []
    const low:  string[] = []
    if (hosDisplay) {
      if (hosDisplay.driveRem <= 2)      high.push(`🛑 HOS CRITICAL — ${hosDisplay.driveRem.toFixed(1)}h drive remaining. Mandatory stop approaching.`)
      else if (hosDisplay.driveRem <= 4) low.push(`⏱ Drive time: ${hosDisplay.driveRem.toFixed(1)}h remaining`)
      if (hosDisplay.shiftRem <= 2)      high.push(`⏰ 14-hr window: ${hosDisplay.shiftRem.toFixed(1)}h left`)
      if (hosDisplay.breakIn != null && hosDisplay.breakIn < 1) high.push(`⏸ 30-min break required in ${Math.ceil(hosDisplay.breakIn * 60)} min`)
    }
    if (wx?.severe)                                                  high.push(`${wx.emoji} ${wx.label} — hazardous driving conditions`)
    else if (weather?.windSpeed != null && weather.windSpeed >= 40)  high.push(`💨 High wind ${weather.windSpeed} mph — reduce speed`)
    else if (weather?.windSpeed != null && weather.windSpeed >= 25)  low.push(`💨 Wind ${weather.windSpeed} mph — monitor conditions`)
    if (missionFuel && missionFuel.totalMiles > 0) {
      const hr = missionFuel.risks.find(r => r.level === 'HIGH')
      const mr = missionFuel.risks.find(r => r.level === 'MODERATE')
      if (hr) high.push(`⛽ ${hr.message}`)
      else if (mr) low.push(`⛽ ${mr.message}`)
    }
    if (!driverMode && missionScore?.marginFlag === 'REJECT') high.push(`💰 Load margin REJECT — below minimum RPM threshold`)
    return { high, low }
  }, [hosDisplay, wx, weather, missionFuel, missionScore])

  // ── Active trip derived
  const now      = Date.now()
  const nextStop = activeTrip?.stops.find(s => new Date(s.eta).getTime() > now)

  // ── Mark arrived handler
  const handleMarkArrived = () => {
    try { localStorage.setItem('3b-mark-arrived', JSON.stringify({ at: new Date().toISOString(), loadNumber: activeTrip?.loadNumber ?? mission?.loadNumber ?? '' })) } catch { /* ignore */ }
    setShowVoicePanel(false)
  }

  return (
    <>
      {/* ── Movement alert — fires on start moving (ELD check) and stop (ELD verify) ── */}
      {movement.showAlert && (
        <MovementAlert
          alertType={movement.alertType}
          speedMph={movement.speedMph}
          hosStatus={statusLabel}
          onDismiss={movement.acknowledge}
        />
      )}

      {/* ── Global observability layer ── */}
      <OfflineBanner isOnline={isOnline} />
      <ToastContainer />
      <DebugPanel
        mission={mission}
        syncState={syncState}
        isOnline={isOnline}
        breakActive={breakActive}
        breakSecs={breakSecs}
        opEvents={opEvents}
        missionFuel={missionFuel}
      />

      {/* Hidden HOS file input */}
      <input ref={hosInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleScanHos} />

      {/* ── Overlays */}
      <EmergencySheet
        open={showEmergency}
        onClose={() => setShowEmergency(false)}
        loadNumber={mission?.loadNumber}
      />
      <BreakTimerModal
        open={showBreakModal}
        breakSecs={breakSecs}
        BREAK_TARGET={BREAK_TARGET}
        fmtBreak={fmtBreak}
        onEnd={handleEndBreak}
        onMinimize={() => setShowBreakModal(false)}
      />
      {drivingMode && (
        <DrivingModeOverlay
          liveClock={liveClock}
          mission={mission}
          vehicle={vehicle}
          nextStop={nextStop}
          hosDisplay={hosDisplay}
          driveColor={driveColor}
          missionFuel={missionFuel}
          weather={weather}
          wx={wx}
          weatherLastUpdated={weatherUpdated}
          spotifyTrack={spotify.track}
          spotifyStatus={spotify.status}
          spotifyTrackSaved={spotify.trackSaved}
          onSpotifyToggle={spotify.toggle}
          onSpotifyNext={spotify.next}
          onSpotifyPrev={spotify.previous}
          onSpotifyLike={spotify.toggleLike}
          onEmergency={() => setShowEmergency(true)}
          onExit={() => {
            setDrivingMode(false)
            void logTimelineEvent('driving_mode_ended', 'dashboard', {
              loadNumber: mission?.loadNumber,
            }, mission?.id ?? mission?.loadNumber)
          }}
          onStartBreak={handleStartBreak}
          onShowFuel={() => setShowFuelSheet(true)}
          onDocumentEvent={() => setShowIncidentSheet(true)}
          onComplianceProof={() => setShowComplianceProof(true)}
          onTrailerHook={() => { setTrailerHookType('empty_hook'); setShowTrailerHook(true) }}
          onTrailerDrop={() => { setTrailerHookType('empty_drop'); setShowTrailerHook(true) }}
          onSendUpdate={() => setShowDriverUpdate(true)}
          onShowPM={() => { if (pmTasks[0]) { setPmSheetTask(pmTasks[0]); setShowPMSheet(true) } }}
          pmAlert={pmTasks.length > 0 ? {
            label:      PM_CONFIG[pmTasks[0].pmType]?.label ?? 'PM',
            milesUntil: Math.abs(pmTasks[0].milesUntilDue),
            isOverdue:  pmTasks[0].status === 'overdue',
          } : null}
        />
      )}

      {/* ── Incident / Compliance */}
      <IncidentSheet
        open={showIncidentSheet}
        onClose={() => setShowIncidentSheet(false)}
        mission={mission}
      />
      <ComplianceProofModal
        open={showComplianceProof}
        onClose={() => setShowComplianceProof(false)}
        mission={mission}
      />

      {/* ── Compliance Event Sheet */}
      <ComplianceEventSheet
        open={showComplianceEvent}
        onClose={() => setShowComplianceEvent(false)}
        mission={mission}
      />

      {/* ── Driver Update Sheet — accessible from Cab Mode and dashboard */}
      <DriverUpdateSheet
        open={showDriverUpdate}
        onClose={() => setShowDriverUpdate(false)}
        loadNumber={mission?.loadNumber ?? activeTrip?.loadNumber ?? undefined}
      />

      {/* ── PM Scheduler */}
      <PMSchedulerSheet
        open={showPMSheet}
        onClose={() => setShowPMSheet(false)}
        onSaved={(_s: PMSchedule) => { setShowPMSheet(false) }}
        task={pmSheetTask}
        currentLat={pmGpsLat}
        currentLng={pmGpsLng}
      />

      {/* ── Trailer Lifecycle */}
      <TrailerHookSheet
        open={showTrailerHook}
        onClose={() => setShowTrailerHook(false)}
        mission={mission}
        defaultType={trailerHookType}
      />
      <TrailerHistoryPanel
        open={showTrailerHistory}
        onClose={() => setShowTrailerHistory(false)}
        trailerNumber={mission?.trailerNum}
      />

      {/* ── Sheets */}
      {/* Supabase save error — non-blocking toast */}
      {missionSaveError && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 250, background: 'rgba(232,64,0,.95)', color: '#fff', padding: '.6rem 1.2rem', borderRadius: 10, fontSize: '.82rem', fontWeight: 700, boxShadow: 'var(--shadow-md)', maxWidth: 'calc(100vw - 2rem)', textAlign: 'center' }}>
          ⚠️ Saved locally — cloud sync failed: {missionSaveError}
        </div>
      )}

      <NewLoadSheet
        open={showNewLoadSheet}
        onClose={() => setShowNewLoadSheet(false)}
        onSave={(m) => {
          // Snapshot current mission before overwriting
          if (mission) saveVersion('before_overwrite')
          return saveMission(m)
        }}
      />
      <FuelPlanSheet
        open={showFuelSheet}
        onClose={() => setShowFuelSheet(false)}
        missionFuel={missionFuel}
        mission={mission}
        onChangePreference={mission ? changeRoutePreference : undefined}
      />
      <HosDetailSheet
        open={showHosDetail}
        onClose={() => setShowHosDetail(false)}
        hosDisplay={hosDisplay}
        statusLabel={statusLabel}
        statusColor={statusColor}
        driveColor={driveColor}
        shiftColor={shiftColor}
        hosScanning={hosScanning}
        eldMode={eldMode}
        onScanClick={() => hosInputRef.current?.click()}
        onStartBreak={handleStartBreak}
      />
      <DocsSheet
        open={showDocsSheet}
        onClose={() => setShowDocsSheet(false)}
      />
      <VoicePanel
        open={showVoicePanel}
        onClose={() => setShowVoicePanel(false)}
        missionDestination={mission?.destination ?? ''}
        onMarkArrived={handleMarkArrived}
        onStartBreak={handleStartBreak}
      />
      <LogEventSheet
        open={showLogEvent}
        onClose={() => setShowLogEvent(false)}
        mission={mission}
        onLog={logEvent}
      />
      <MissionHistoryPanel
        open={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        events={opEvents}
        history={opHistory}
        insights={opInsights}
        aiInsight={aiInsight}
        insightLoading={insightLoading}
        onGenerateInsight={generateInsight}
      />
      <AddStopSheet
        open={showAddStop}
        onClose={() => setShowAddStop(false)}
        driverMode={driverMode}
        onAdd={(stop, position) => addStop(stop, position)}
      />
      {selectedStop && (
        <StopLifecyclePanel
          stop={selectedStop}
          open={selectedStop !== null}
          onClose={() => setSelectedStop(null)}
          driverMode={driverMode}
          onAdvance={async (status, notes) => {
            await advanceLifecycle(selectedStop, status, notes)
            // Refresh selectedStop from mission so the panel shows updated timestamps
            if (mission?.stops) {
              const updated = mission.stops.find(s => s.id === selectedStop.id)
              if (updated) setSelectedStop(updated)
            }
          }}
        />
      )}
      <TripReviewSheet
        open={showTripReview}
        onClose={() => setShowTripReview(false)}
        mission={mission}
        onSubmit={completeMission}
      />
      <CompletedTripsPanel
        open={showCompletedTrips}
        onClose={() => setShowCompletedTrips(false)}
      />
      <MusicPanel
        open={showMusicPanel}
        onClose={() => setShowMusicPanel(false)}
        spotifyTrack={spotify.track}
        spotifyStatus={spotify.status}
        spotifyTrackSaved={spotify.trackSaved}
        onSpotifyToggle={spotify.toggle}
        onSpotifyNext={spotify.next}
        onSpotifyPrev={spotify.previous}
        onSpotifyLike={spotify.toggleLike}
        drivingMode={drivingMode}
      />
      <GymFinderPanel
        open={showGymFinder}
        onClose={() => setShowGymFinder(false)}
        drivingMode={drivingMode}
      />
      <LaneIntelligencePanel
        open={showLanePanel}
        onClose={() => setShowLanePanel(false)}
        metrics={laneMetrics}
        loading={laneLoading}
        driverMode={driverMode}
      />
      <SettlementPanel
        open={showSettlementPanel}
        onClose={() => setShowSettlementPanel(false)}
        driverMode={driverMode}
      />
      <OrderTimelinePanel
        open={showTimeline}
        onClose={() => setShowTimeline(false)}
        mission={mission ?? null}
        events={opEvents}
        driverMode={driverMode}
      />
      <ResetPanel
        open={resetEngine.showResetPanel}
        onClose={() => resetEngine.setShowResetPanel(false)}
        resetActive={resetEngine.resetActive}
        activeReset={resetEngine.activeReset}
        resetType={resetEngine.resetType}
        elapsedSecs={resetEngine.elapsedSecs}
        remainingSecs={resetEngine.remainingSecs}
        targetSecs={resetEngine.targetSecs}
        progress={resetEngine.progress}
        isComplete={resetEngine.isComplete}
        startReset={resetEngine.startReset}
        endReset={resetEngine.endReset}
        fmt={resetEngine.fmt}
        RESET_LABELS={resetEngine.RESET_LABELS}
        RESET_EMOJIS={resetEngine.RESET_EMOJIS}
        RESET_TARGETS={resetEngine.RESET_TARGETS}
      />
      <ReceiverIntelPanel
        open={showReceiverIntel}
        onClose={() => setShowReceiverIntel(false)}
        placeName={mission?.destination}
        city={mission?.stops?.find(s => !s.completed)?.city}
        state={mission?.stops?.find(s => !s.completed)?.state}
      />

      {/* ═══ COMMAND CENTER SHELL ════════════════════════════════════════════ */}
      <div className="cc-main" style={{ display: drivingMode ? 'none' : undefined }}>

        {/* Mobile TopBar — hidden ≥900px */}
        <div className="cc-portrait-topbar">
          <TopBar title="Command Center" module="mis" subtitle={liveDate} />
        </div>

        {/* Status bar — iPad landscape only */}
        <StatusBar
          liveClock={liveClock}
          liveDate={liveDate}
          vehicle={vehicle}
          hosDisplay={hosDisplay}
          driveColor={driveColor}
          shiftColor={shiftColor}
          breakActive={breakActive}
          breakSecs={breakSecs}
          fmtBreak={fmtBreak}
          resetActive={resetEngine.resetActive}
          onNewLoad={() => setShowNewLoadSheet(true)}
          onStartBreak={handleStartBreak}
          onShowHos={() => setShowHosDetail(true)}
          onShowFuel={() => setShowFuelSheet(true)}
          onShowDocs={() => setShowDocsSheet(true)}
          onShowReset={() => resetEngine.setShowResetPanel(true)}
          onEmergency={() => setShowEmergency(true)}
        />

        {/* ── Body: sidebar + center + right ── */}
        <div className="cc-body">

          {/* Left navigation sidebar — iPad landscape only */}
          <CcSidebar
            hasMission={!!mission}
            resetActive={resetEngine.resetActive}
            onNewLoad={() => setShowNewLoadSheet(true)}
            onReset={() => resetEngine.setShowResetPanel(true)}
            onMusic={() => setShowMusicPanel(true)}
            onGym={() => setShowGymFinder(true)}
            onSettlement={() => setShowSettlementPanel(true)}
            onTimeline={mission ? () => setShowTimeline(true) : undefined}
            onReceiverIntel={mission ? () => setShowReceiverIntel(true) : undefined}
            onEmergency={() => setShowEmergency(true)}
          />

          {/* Content grid: center column + right panel */}
          <div className="cc-grid">

            {/* ══ CENTER / LEFT COLUMN ══ */}
            <div className="cc-col-left">
              <LocationBar mission={mission} />
              <ActiveMissionCard
                mission={mission}
                missionScore={missionScore}
                missionFuel={missionFuel}
                insights={opInsights}
                syncState={syncState}
                routeRisk={routeRisk}
                driverMode={driverMode}
                laneSummary={mission ? laneMetrics : undefined}
                laneLoading={mission ? laneLoading : undefined}
                onLogEvent={mission ? () => setShowLogEvent(true) : undefined}
                onShowHistory={mission ? () => setShowHistoryPanel(true) : undefined}
                onDocumentEvent={() => setShowIncidentSheet(true)}
                onTrailerHook={() => { setTrailerHookType('empty_hook'); setShowTrailerHook(true) }}
                onTrailerHistory={() => setShowTrailerHistory(true)}
                onCompleteStop={handleCompleteStop}
                onUndoStop={handleUndoStop}
                onAddStop={mission ? () => setShowAddStop(true) : undefined}
                onTapStop={mission ? (stop) => setSelectedStop(stop) : undefined}
                onTapLane={mission ? () => setShowLanePanel(true) : undefined}
                onQuickArrive={mission && currentActiveStop ? handleQuickArrive : undefined}
                onQuickLeave={mission && currentActiveStop ? handleQuickLeave : undefined}
                quickSubmitting={quickSubmitting}
                onCompleteTrip={mission ? () => setShowTripReview(true) : undefined}
                onShowCompleted={() => setShowCompletedTrips(true)}
              />
              {activeTrip && (
                <ActiveTripCard
                  activeTrip={activeTrip}
                  nextStop={nextStop}
                  onClear={() => { localStorage.removeItem('3b-active-trip'); setActiveTrip(null) }}
                />
              )}
              <AlertsCard operationalAlerts={operationalAlerts} onOpenHos={() => setShowHosDetail(true)} />

              <NavigationSnapshotCard mission={mission} />

              {/* ── Quick links — horizontal scroll, 3-tier hierarchy ── */}
              {/* Tier 1 (primary): Send Update — only when a load is active          */}
              {/* Tier 2 (secondary): Vault, Trailer — always visible                  */}
              {/* Tier 3 (roadside): Inspection, Load Docs, Repairs — doc shortcuts    */}
              <div className="cc-quicklinks">

                {/* ── Tier 1: primary action ── */}
                {(mission || activeTrip) && (
                  <>
                    <button
                      onClick={() => setShowDriverUpdate(true)}
                      style={{
                        flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                        padding: '.3rem .55rem', borderRadius: 7,
                        fontSize: '.76rem', fontWeight: 800, color: 'var(--primary)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ fontSize: '.8rem' }}>📡</span> Send Update
                    </button>
                    {/* tier divider */}
                    <span style={{ flexShrink: 0, width: 1, height: 14, background: 'var(--border)', margin: '0 6px' }} />
                  </>
                )}

                {/* ── Tier 2: secondary navigation ── */}
                {([
                  { href: '/vault',        label: 'Vault',        emoji: '🗄️' },
                  { href: '/compliance',  label: 'Compliance',   emoji: '⚖️' },
                  { href: '/trailer',     label: 'Trailer',      emoji: '🚚' },
                  { href: '/maintenance', label: 'Maintenance',  emoji: '🔧' },
                ] as const).map((item, i, arr) => (
                  <span key={item.href} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <a href={item.href} style={{
                      padding: '.3rem .55rem', fontSize: '.76rem', fontWeight: 700,
                      color: 'var(--text)', textDecoration: 'none', borderRadius: 7,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span style={{ fontSize: '.8rem' }}>{item.emoji}</span> {item.label}
                    </a>
                    {i < arr.length - 1 && (
                      <span style={{ color: 'rgba(255,255,255,.15)', fontSize: '.7rem', padding: '0 1px' }}>·</span>
                    )}
                  </span>
                ))}

                {/* tier divider */}
                <span style={{ flexShrink: 0, width: 1, height: 14, background: 'var(--border)', margin: '0 6px' }} />

                {/* ── Tier 3: roadside doc shortcuts ── */}
                <span style={{ flexShrink: 0, fontSize: '.58rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', paddingRight: 4 }}>Roadside</span>
                {([
                  { href: '/vault?group=inspection', label: 'Inspection', emoji: '🔍' },
                  { href: '/vault?group=load',        label: 'Load Docs',  emoji: '📦' },
                  { href: '/vault?group=repair',      label: 'Repairs',    emoji: '🔧' },
                ] as const).map((item, i, arr) => (
                  <span key={item.href} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <a href={item.href} style={{
                      padding: '.3rem .5rem', fontSize: '.73rem', fontWeight: 600,
                      color: 'var(--muted)', textDecoration: 'none', borderRadius: 7,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      <span style={{ fontSize: '.78rem' }}>{item.emoji}</span> {item.label}
                    </a>
                    {i < arr.length - 1 && (
                      <span style={{ color: 'rgba(255,255,255,.12)', fontSize: '.7rem' }}>·</span>
                    )}
                  </span>
                ))}
              </div>

              {/* QuickNavCard — phone only (sidebar replaces on iPad) */}
              <div className="cc-phone-only">
                <QuickNavCard
                  onMusic={() => setShowMusicPanel(true)}
                  onGym={() => setShowGymFinder(true)}
                  onSettlement={() => setShowSettlementPanel(true)}
                  onTimeline={mission ? () => setShowTimeline(true) : undefined}
                />
              </div>
            </div>

            {/* ══ RIGHT STATUS PANEL ══ */}
            <div className="cc-col-right">
              <HosCard
                hosDisplay={hosDisplay}
                hosError={hosError}
                hosScanning={hosScanning}
                eldMode={eldMode}
                setEldMode={setEldMode}
                driveColor={driveColor}
                shiftColor={shiftColor}
                statusLabel={statusLabel}
                statusColor={statusColor}
                samsara={samsara}
                onScanClick={() => hosInputRef.current?.click()}
                onClearHos={() => { localStorage.removeItem('3b-hos-data'); setHos(null); setSamsara(null) }}
              />
              <FuelWeatherRow missionFuel={missionFuel} weather={weather} wx={wx} weatherLoading={weatherLoading} lastUpdated={weatherUpdated} onRefresh={refreshWeather} />
              {!driverMode && <ExpensesCard />}

              {/* PM Due Soon alert — shown in all modes when tasks exist */}
              {pmTasks.length > 0 && (
                <PMStatusCard
                  tasks={pmTasks}
                  nearestLocation={pmNearestLoc}
                  onSchedule={(task) => { setPmSheetTask(task); setShowPMSheet(true) }}
                  compact
                />
              )}

              {/* MIS footer — owner-operator only */}
              {!driverMode && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.6rem .85rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 5px var(--primary)' }} />
                    <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '.07em' }}>MIS ACTIVE</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Link href="/mis"   style={{ fontSize: '.7rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>📊 MIS →</Link>
                    <Link href="/audit" style={{ fontSize: '.7rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>📋 Audit →</Link>
                  </div>
                </div>
              )}
            </div>

          </div>{/* /cc-grid */}
        </div>{/* /cc-body */}

        {/* ── Bottom persistent bar ── */}
        <div className="cc-bottom-bar">
          <button className="cc-bottom-btn" onClick={() => setShowVoicePanel(true)}
            style={{ background: 'rgba(0,232,176,.06)', borderColor: 'rgba(0,232,176,.2)', color: 'var(--primary)' }}>
            <span style={{ fontSize: '1.35rem' }}>🎙</span>
            <span style={{ fontSize: '1rem', fontWeight: 900 }}>Voice</span>
          </button>
          <button className="cc-bottom-btn cc-bottom-btn-primary" onClick={() => {
            setDrivingMode(true)
            void logTimelineEvent('driving_mode_started', 'dashboard', {
              loadNumber: mission?.loadNumber,
            }, mission?.id ?? mission?.loadNumber)
          }}>
            <span style={{ fontSize: '1.5rem' }}>🚛</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '.03em' }}>I&apos;M DRIVING</span>
            <span style={{ fontSize: '.78rem', color: 'rgba(6,18,16,.65)', fontWeight: 700 }}>Hands-free mode</span>
          </button>
          <Link href="/dispatch" className="cc-bottom-btn"
            style={{ background: 'rgba(74,196,255,.06)', borderColor: 'rgba(74,196,255,.2)', color: 'var(--blue)', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.35rem' }}>📞</span>
            <span style={{ fontSize: '1rem', fontWeight: 900 }}>Dispatch</span>
          </Link>
        </div>

      </div>

      <style>{`
        @keyframes spin            { to { transform: rotate(360deg) } }
        @keyframes pulse           { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        @keyframes countdownPulse  { 0%,100% { box-shadow: 0 0 0 0 rgba(232,64,0,.0) } 50% { box-shadow: 0 0 0 4px rgba(232,64,0,.18) } }
      `}</style>
    </>
  )
}
