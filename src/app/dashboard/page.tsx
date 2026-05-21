'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'

// ── Types
import type { EldMode, VehicleSetup, HOSData, SamsaraData, ActiveTrip, MissionStop } from '@/lib/dashboard/types'
// ── Observability
import { opLog } from '@/lib/logger'
import { validateHOS } from '@/lib/guards'
import { toast } from '@/hooks/useToast'
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

// ── Overlays
import EmergencySheet    from '@/components/dashboard/overlays/EmergencySheet'
import BreakTimerModal   from '@/components/dashboard/overlays/BreakTimerModal'
import DrivingModeOverlay from '@/components/dashboard/overlays/DrivingModeOverlay'

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
import ToastContainer      from '@/components/shared/ToastContainer'
import OfflineBanner       from '@/components/shared/OfflineBanner'
import DebugPanel          from '@/components/debug/DebugPanel'

// ── Cards
import ActiveMissionCard from '@/components/dashboard/cards/ActiveMissionCard'
import ActiveTripCard    from '@/components/dashboard/cards/ActiveTripCard'
import AlertsCard        from '@/components/dashboard/cards/AlertsCard'
import HosCard           from '@/components/dashboard/cards/HosCard'
import FuelWeatherRow    from '@/components/dashboard/cards/FuelWeatherRow'
import ExpensesCard      from '@/components/dashboard/cards/ExpensesCard'
import QuickNavCard      from '@/components/dashboard/cards/QuickNavCard'
import MovementAlert     from '@/components/dashboard/cards/MovementAlert'

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

  // ── Panel toggles
  const [drivingMode,       setDrivingMode]       = useState(false)
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
  const [showMusicPanel,    setShowMusicPanel]    = useState(false)
  const [showGymFinder,     setShowGymFinder]     = useState(false)
  const [showLanePanel,     setShowLanePanel]     = useState(false)

  // ── Movement detector — only active when driving mode is on
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
          nextStop={nextStop}
          hosDisplay={hosDisplay}
          driveColor={driveColor}
          missionFuel={missionFuel}
          weather={weather}
          wx={wx}
          onEmergency={() => setShowEmergency(true)}
          onExit={() => setDrivingMode(false)}
        />
      )}

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
        onSave={saveMission}
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

      {/* ═══ COMMAND CENTER SHELL ════════════════════════════════════════════ */}
      <div className="cc-main" style={{ display: drivingMode ? 'none' : undefined }}>

        {/* Mobile TopBar — hidden ≥900px */}
        <div className="cc-portrait-topbar">
          <TopBar title="Command Center" module="mis" subtitle={liveDate} />
        </div>

        {/* Landscape status bar */}
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
          onNewLoad={() => setShowNewLoadSheet(true)}
          onStartBreak={handleStartBreak}
          onShowHos={() => setShowHosDetail(true)}
          onShowFuel={() => setShowFuelSheet(true)}
          onShowDocs={() => setShowDocsSheet(true)}
          onEmergency={() => setShowEmergency(true)}
        />

        {/* Content grid */}
        <div className="cc-grid">

          {/* ══ LEFT COLUMN ══ */}
          <div className="cc-col-left">
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
              onCompleteStop={handleCompleteStop}
              onUndoStop={handleUndoStop}
              onAddStop={mission ? () => setShowAddStop(true) : undefined}
              onTapStop={mission ? (stop) => setSelectedStop(stop) : undefined}
              onTapLane={mission ? () => setShowLanePanel(true) : undefined}
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
            <QuickNavCard
              onMusic={() => setShowMusicPanel(true)}
              onGym={() => setShowGymFinder(true)}
            />
          </div>

          {/* ══ RIGHT COLUMN ══ */}
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

            {/* MIS footer — owner-operator only */}
            {!driverMode && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem .75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 5px var(--primary)' }} />
                  <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '.07em' }}>MIS ACTIVE</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Link href="/mis"   style={{ fontSize: '.65rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>📊 MIS →</Link>
                  <Link href="/audit" style={{ fontSize: '.65rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>📋 Audit →</Link>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Bottom persistent bar */}
        <div className="cc-bottom-bar">
          <button className="cc-bottom-btn" onClick={() => setShowVoicePanel(true)}
            style={{ background: 'rgba(0,232,176,.06)', borderColor: 'rgba(0,232,176,.2)', color: 'var(--primary)' }}>
            <span style={{ fontSize: '1.2rem' }}>🎙</span>
            <span>Voice</span>
          </button>
          <button className="cc-bottom-btn cc-bottom-btn-primary" onClick={() => setDrivingMode(true)}>
            <span style={{ fontSize: '1.3rem' }}>🚛</span>
            <span>I&apos;M DRIVING</span>
            <span style={{ fontSize: '.7rem', color: 'rgba(6,18,16,.65)', fontWeight: 600 }}>Hands-free mode</span>
          </button>
          <Link href="/dispatch" className="cc-bottom-btn"
            style={{ background: 'rgba(74,196,255,.06)', borderColor: 'rgba(74,196,255,.2)', color: 'var(--blue)', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.2rem' }}>📞</span>
            <span>Dispatch</span>
          </Link>
        </div>

      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
      `}</style>
    </>
  )
}
