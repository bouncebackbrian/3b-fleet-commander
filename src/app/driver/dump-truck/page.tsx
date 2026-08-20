'use client'
import { useMemo, useState } from 'react'
import { useDumpTruckDriver } from '@/hooks/useDumpTruckDriver'
import { useWeather } from '@/hooks/useWeather'
import { canDispatchWithDefects } from '@/lib/dumpTruck/inspections'
import { siteAwareActionLabel } from '@/lib/dumpTruck/actionLabels'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import type { DumpTruckSite } from '@/lib/dumpTruck/types'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

import TopStatusBar from '@/components/dumpTruck/TopStatusBar'
import LeftRail from '@/components/dumpTruck/LeftRail'
import CenterAction from '@/components/dumpTruck/CenterAction'
import DefectOverridePanel from '@/components/dumpTruck/DefectOverridePanel'
import RightRail from '@/components/dumpTruck/RightRail'
import ClockInSheet from '@/components/dumpTruck/ClockInSheet'
import OdometerSheet from '@/components/dumpTruck/OdometerSheet'
import InspectionSheet from '@/components/dumpTruck/InspectionSheet'
import DelaySheet from '@/components/dumpTruck/DelaySheet'
import NoteSheet from '@/components/dumpTruck/NoteSheet'
import DefectQuickSheet from '@/components/dumpTruck/DefectQuickSheet'
import IncidentQuickSheet from '@/components/dumpTruck/IncidentQuickSheet'
import PhotoTicketSheet from '@/components/dumpTruck/PhotoTicketSheet'
import NavigateSheet from '@/components/dumpTruck/NavigateSheet'
import SubmitDaySheet from '@/components/dumpTruck/SubmitDaySheet'
import FuelSheet from '@/components/dumpTruck/FuelSheet'
import LoadTicketSheet from '@/components/dumpTruck/LoadTicketSheet'
import NewSiteSheet from '@/components/dumpTruck/NewSiteSheet'
import FullLogSheet from '@/components/dumpTruck/FullLogSheet'
import EditJobSheet from '@/components/dumpTruck/EditJobSheet'
import TicketSheet from '@/components/dumpTruck/TicketSheet'
import DispatchCard from '@/components/dumpTruck/DispatchCard'
import TruckProblemSheet from '@/components/dumpTruck/TruckProblemSheet'
import ChangeProblemSheet, { type ChangeProblemRoute } from '@/components/dumpTruck/ChangeProblemSheet'
import SafetySheet from '@/components/dumpTruck/SafetySheet'

type SheetKey =
  | 'clock_in' | 'odometer_pickup' | 'odometer_dropoff' | 'pretrip' | 'posttrip'
  | 'delay' | 'note' | 'defect' | 'incident' | 'photo' | 'ticket' | 'fuel' | 'new_site' | 'submit' | 'full_log' | 'edit_job' | 'dispatch_ticket' | 'truck_problem' | 'change_problem' | 'safety' | null

export default function DumpTruckDriverPage() {
  const {
    loading, context, flowState, primaryAction, timeline,
    activeJobId, setActiveJobId, isOnline, queueSummary, fuelQueueSummary,
    driverName, businessName, truckUnitNumber, truckHoldStatus, truckHoldReason,
    preferredLanguage, setLanguage,
    fireEvent, clockIn, submitDay, queueFuelEntry, refetch,
  } = useDumpTruckDriver()
  const { wx, weather, weatherLoading } = useWeather()

  const [sheet, setSheet] = useState<SheetKey>(null)
  const [navigateSite, setNavigateSite] = useState<DumpTruckSite | null>(null)
  /** Set when the driver continues past a defect block via DefectOverridePanel
   *  — attached as the fired event's notes so the override is documented on
   *  the record, not just used to unlock the button client-side. */
  const [overrideReportText, setOverrideReportText] = useState<string | null>(null)
  const [overrideBusy, setOverrideBusy] = useState(false)

  const delayActive = useMemo(() => {
    let open = false
    for (const t of timeline) {
      if (t.eventType === 'delay_started') open = true
      if (t.eventType === 'delay_ended') open = false
    }
    return open
  }, [timeline])

  const activeJob = context?.jobs.find(j => j.id === activeJobId) ?? null
  const pickupSite = context?.sites.find(s => s.id === activeJob?.pickupSiteId)
  const dumpSite = context?.sites.find(s => s.id === activeJob?.dumpSiteId)
  const yardSite = context?.sites.find(s => s.siteType === 'yard')

  /** ADR-010 — dispatch-set daily load goal, only meaningful when the job's quantity is tracked in loads. */
  const dailyLoadGoal = activeJob?.quantityUnit === 'loads' ? activeJob.estQuantity : null
  const loadCount = context?.shift?.loadCount ?? 0
  /** Proactive closing nudge: shown once the goal is met, right when the driver is deciding
   *  between another load and heading back to the yard — never blocks the primary action. */
  const showClosingAlert = !!dailyLoadGoal && loadCount >= dailyLoadGoal && flowState === 'driving_to_next'

  const siteLabelCtx = { pickupSiteName: pickupSite?.name, dumpSiteName: dumpSite?.name, yardSiteName: yardSite?.name, material: activeJob?.material }
  const displayAction = {
    ...primaryAction,
    label: siteAwareActionLabel(primaryAction.eventType, primaryAction.label, siteLabelCtx),
    secondary: primaryAction.secondary
      ? { ...primaryAction.secondary, label: siteAwareActionLabel(primaryAction.secondary.eventType, primaryAction.secondary.label, siteLabelCtx) }
      : undefined,
  }

  /** Dispatch-authorized hold (spec §5.1) — a hard stop, no driver override.
   *  Checked client-side before the event is even enqueued because fireEvent
   *  writes to an offline-first queue and returns success optimistically; a
   *  server-only check (also present in events.ts) would otherwise fail
   *  silently in the background sync instead of blocking the tap. Takes
   *  priority over the documented-override defect flow below — that flow is
   *  for defects that haven't been escalated to a formal hold. */
  const truckHoldBlockReason = (() => {
    if (truckHoldStatus !== 'on_hold') return null
    if (primaryAction.eventType !== 'truck_picked_up' && primaryAction.eventType !== 'depart_yard') return null
    return `Truck is on a dispatch hold${truckHoldReason ? `: ${truckHoldReason}` : ''}. Contact dispatch for release — this cannot be overridden from the driver app.`
  })()

  const blockingDefectReason = (() => {
    if (!context?.openDefects.length) return null
    if (primaryAction.eventType !== 'truck_picked_up' && primaryAction.eventType !== 'depart_yard') return null
    const ok = canDispatchWithDefects(
      context.openDefects.map(d => ({ severity: d.severity as never, status: 'open' })),
      null,
    )
    return ok ? null : `Truck has an open safety-critical/out-of-service defect: ${context.openDefects[0].description}`
  })()

  const needsJobReason = (() => {
    if (!context?.jobs.length && (primaryAction.eventType === 'arrive_pickup')) {
      return 'No job assigned — ask dispatch to assign this shift to a job before starting a load.'
    }
    return null
  })()

  const disabledReason = truckHoldBlockReason ?? blockingDefectReason ?? needsJobReason

  const handlePrimary = async () => {
    if (truckHoldBlockReason) { toast.error('Truck is on a dispatch hold — contact dispatch'); return }
    if (primaryAction.opensSubmit) { setSheet('submit'); return }
    if (primaryAction.opensChecklist === 'pretrip') { setSheet('pretrip'); return }
    if (primaryAction.opensChecklist === 'posttrip') { setSheet('posttrip'); return }
    if (primaryAction.eventType === 'clock_in') { setSheet('clock_in'); return }
    if (primaryAction.eventType === 'truck_picked_up') { setSheet('odometer_pickup'); return }
    if (primaryAction.eventType === 'truck_dropped_off') { setSheet('odometer_dropoff'); return }
    if (primaryAction.eventType) {
      const result = await fireEvent(primaryAction.eventType, { notes: overrideReportText ?? undefined })
      if (result.ok) { toast.success(result.siteLabel ? `Saved at ${result.siteLabel}` : 'Saved'); setOverrideReportText(null) }
    }
  }

  const handleSecondary = async () => {
    if (!primaryAction.secondary) return
    const result = await fireEvent(primaryAction.secondary.eventType, { notes: overrideReportText ?? undefined })
    if (result.ok) { toast.success(result.siteLabel ? `Saved at ${result.siteLabel}` : 'Saved'); setOverrideReportText(null) }
  }

  /** DefectOverridePanel's "Continue Anyway" — documents the override (report
   *  text becomes the fired event's notes) then runs the exact same primary
   *  action routing as a normal tap (still goes through the odometer sheet
   *  for truck_picked_up, etc.) rather than firing a different, unaudited path. */
  const handleOverrideContinue = async (reportText: string) => {
    setOverrideBusy(true)
    setOverrideReportText(reportText)
    try {
      await handlePrimary()
    } finally {
      setOverrideBusy(false)
    }
  }

  const handlePinLocation = async (site: DumpTruckSite) => {
    const geo = await captureGeolocation()
    if (geo.lat == null || geo.lng == null) {
      toast.error('Could not get your GPS location — check location permissions and try again')
      return
    }
    try {
      const res = await fetch(`/api/fleet/dump-truck/sites/${site.id}/location`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: geo.lat, lng: geo.lng }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save location')
      toast.success(`Pinned ${site.name} to your current location`)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save location')
    }
  }

  /** Progressive disclosure (spec §"Dashboard Complexity Rule") — the first 3
   *  are what a driver actually needs mid-shift; delay/defect/truck-problem/
   *  incident/report-issue are consolidated into one "Change / Problem" entry
   *  point (ChangeProblemSheet) instead of 5 separate always-visible buttons. */
  const quickActions = [
    { key: 'ticket', icon: '🎫', label: 'Scan Ticket', enabled: !!context?.shift && (context?.loadCycles.length ?? 0) > 0 },
    { key: delayActive ? 'delay' : 'change_problem', icon: delayActive ? '⏸️' : '🚨', label: delayActive ? 'End Delay' : 'Change / Problem', enabled: !!context?.shift },
    { key: 'photo', icon: '📷', label: 'Photo', enabled: !!context?.shift },
    { key: 'log_location', icon: '📍', label: 'Log Time/Location', enabled: !!context?.shift },
    { key: 'fuel', icon: '⛽', label: 'Add Fuel', enabled: !!context?.shift?.truckId },
    { key: 'note', icon: '📝', label: 'Note', enabled: !!context?.shift },
    { key: 'new_site', icon: '📍', label: 'New Site', enabled: true },
    { key: 'correction', icon: '↩️', label: 'Report Issue', enabled: !!context?.shift },
  ]

  if (loading) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading…</div>
  }

  return (
    <div className="dt-shell">
      <TopStatusBar
        isOnline={isOnline}
        pendingCount={queueSummary.pending + queueSummary.syncing + fuelQueueSummary.pending + fuelQueueSummary.syncing}
        failedCount={queueSummary.failed + fuelQueueSummary.failed}
        gpsPermission={null}
        wx={wx}
        weather={weather}
        weatherLoading={weatherLoading}
        businessName={businessName}
        driverName={driverName}
        flowState={flowState}
        preferredLanguage={preferredLanguage}
        onLanguageChange={setLanguage}
        onSafety={() => setSheet('safety')}
      />

      <div style={{ padding: '0 1rem' }}>
        <DispatchCard
          truckUnitNumber={truckUnitNumber}
          onStartDispatch={jobId => {
            setActiveJobId(jobId)
            toast.success("Today's dispatch loaded — verify truck and odometer, then start pre-trip")
          }}
        />
      </div>

      <div className="dt-body">
        <div className="dt-left">
          <LeftRail
            flowState={flowState}
            clockInAt={context?.shift ? (timeline.find(t => t.eventType === 'clock_in')?.effectiveAt ?? null) : null}
            truckUnit={truckUnitNumber}
            trailerUnit={null}
            jobs={context?.jobs ?? []}
            activeJobId={activeJobId}
            onChangeJob={setActiveJobId}
            sites={context?.sites ?? []}
            loadCount={context?.shift?.loadCount ?? 0}
            onNavigate={setNavigateSite}
            onPinLocation={handlePinLocation}
            onEditJob={() => setSheet('edit_job')}
            onViewTicket={() => setSheet('dispatch_ticket')}
          />
        </div>

        <div className="dt-center">
          {truckHoldBlockReason ? (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '.6rem', width: '100%', maxWidth: 480,
              background: 'rgba(220,38,38,.08)', border: '1px solid var(--error)', borderRadius: 12, padding: '1.25rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.5rem' }}>🚫</div>
              <div style={{ fontWeight: 800, color: 'var(--error)' }}>Truck {truckUnitNumber ?? ''} is on hold</div>
              <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{truckHoldReason ?? 'Dispatch has placed this truck on hold.'}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Contact dispatch — only they can release the hold. This cannot be worked around from here.</div>
            </div>
          ) : blockingDefectReason ? (
            <DefectOverridePanel
              truckUnitNumber={truckUnitNumber}
              driverName={driverName}
              defects={(context?.openDefects ?? []).map(d => ({ description: d.description, severity: d.severity }))}
              busy={overrideBusy}
              onContinue={handleOverrideContinue}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', width: '100%', alignItems: 'center' }}>
              {showClosingAlert && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '.35rem', width: '100%', maxWidth: 480,
                  background: 'rgba(11,78,162,.08)', border: '1px solid var(--primary)', borderRadius: 12, padding: '.85rem 1rem',
                  textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 800, color: 'var(--primary)' }}>🎯 Daily goal reached — {loadCount} of {dailyLoadGoal} loads</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                    Add another load if dispatch wants more, or head back to the yard to close out the day.
                  </div>
                </div>
              )}
              <CenterAction
                action={displayAction}
                busy={false}
                disabledReason={disabledReason}
                onPrimary={handlePrimary}
                onSecondary={handleSecondary}
              />
            </div>
          )}
        </div>

        <div className="dt-right">
          <RightRail
            timeline={timeline}
            loadCount={context?.shift?.loadCount ?? 0}
            quickActions={quickActions}
            labelCtx={siteLabelCtx}
            onViewFullLog={() => setSheet('full_log')}
            onQuickAction={key => {
              if (key === 'correction') {
                fireEvent('correction_requested', { notes: 'Driver requested a correction — see timeline for context.' })
                  .then(r => { if (r.ok) toast.success('Correction requested — dispatch will follow up') })
                return
              }
              if (key === 'log_location') {
                fireEvent('location_logged')
                  .then(r => { if (r.ok) toast.success(r.siteLabel ? `Logged at ${r.siteLabel}` : 'Time and location logged') })
                return
              }
              if (key === 'change_problem') { setSheet('change_problem'); return }
              setSheet(key as SheetKey)
            }}
          />
        </div>
      </div>

      {sheet === 'clock_in' && (
        <ClockInSheet
          sites={context?.sites ?? []}
          onClose={() => setSheet(null)}
          onConfirm={async input => clockIn(input)}
        />
      )}

      {sheet === 'odometer_pickup' && (
        <OdometerSheet
          title="Truck Picked Up"
          isDropOff={false}
          onClose={() => setSheet(null)}
          onConfirm={async odometer => {
            const r = await fireEvent('truck_picked_up', { odometer, notes: overrideReportText ?? undefined })
            if (r.ok) { toast.success('Custody started'); setOverrideReportText(null) }
          }}
        />
      )}

      {sheet === 'odometer_dropoff' && (
        <OdometerSheet
          title="Truck Dropped Off"
          isDropOff
          onClose={() => setSheet(null)}
          onConfirm={async (odometer, extra) => {
            const r = await fireEvent('truck_dropped_off', { odometer, deviceMetadata: extra })
            if (r.ok) toast.success('Custody ended')
          }}
        />
      )}

      {sheet === 'pretrip' && context?.shift && (
        <InspectionSheet
          shiftId={context.shift.id}
          inspectionType="pretrip"
          onClose={() => { setSheet(null); refetch() }}
          onComplete={hasBlockingDefects => {
            if (hasBlockingDefects) toast.error('Safety-critical defect logged — dispatch approval required before departure')
          }}
        />
      )}

      {sheet === 'posttrip' && context?.shift && (
        <InspectionSheet
          shiftId={context.shift.id}
          inspectionType="posttrip"
          onClose={() => { setSheet(null); refetch() }}
          onComplete={() => {}}
        />
      )}

      {sheet === 'delay' && (
        <DelaySheet
          delayActive={delayActive}
          onClose={() => setSheet(null)}
          onStart={async (reason, billable, notes) => {
            await fireEvent('delay_started', { notes: `${reason}${notes ? ` — ${notes}` : ''}`, deviceMetadata: { billable } })
          }}
          onEnd={async () => { await fireEvent('delay_ended') }}
        />
      )}

      {sheet === 'note' && (
        <NoteSheet onClose={() => setSheet(null)} onSave={async notes => { await fireEvent('note', { notes }) }} />
      )}

      {sheet === 'photo' && context?.shift && (
        <PhotoTicketSheet shiftId={context.shift.id} docType="inspection_photo" title="Photo" onClose={() => setSheet(null)} onUploaded={() => fireEvent('photo_captured')} />
      )}

      {sheet === 'ticket' && context?.shift && (
        <LoadTicketSheet
          shiftId={context.shift.id}
          loadCycles={[...context.loadCycles].sort((a, b) => b.sequence - a.sequence)}
          onClose={() => setSheet(null)}
          onSaved={() => { fireEvent('ticket_captured'); refetch() }}
        />
      )}

      {sheet === 'fuel' && context?.shift?.truckId && (
        <FuelSheet
          shiftId={context.shift.id}
          vehicleId={context.shift.truckId}
          jobId={activeJobId}
          isOnline={isOnline}
          onClose={() => setSheet(null)}
          onSaved={refetch}
          onQueueOffline={queueFuelEntry}
        />
      )}

      {sheet === 'new_site' && (
        <NewSiteSheet onClose={() => setSheet(null)} onSaved={refetch} />
      )}

      {sheet === 'safety' && (
        <SafetySheet
          onClose={() => setSheet(null)}
          onReportIncident={() => setSheet('incident')}
          onTruckProblem={() => setSheet('truck_problem')}
        />
      )}

      {sheet === 'change_problem' && (
        <ChangeProblemSheet
          hasActiveJob={!!activeJob}
          hasTruck={!!context?.shift?.truckId}
          onClose={() => setSheet(null)}
          onSelect={(route: ChangeProblemRoute) => setSheet(route)}
        />
      )}

      {sheet === 'truck_problem' && context?.shift?.truckId && (
        <TruckProblemSheet
          shiftId={context.shift.id}
          truckId={context.shift.truckId}
          jobId={activeJobId}
          onClose={() => setSheet(null)}
          onChanged={refetch}
        />
      )}

      {sheet === 'defect' && context?.shift?.truckId && (
        <DefectQuickSheet
          truckId={context.shift.truckId}
          trailerId={context.shift.trailerId}
          shiftId={context.shift.id}
          onClose={() => setSheet(null)}
          onSaved={refetch}
        />
      )}

      {sheet === 'incident' && context?.shift && (
        <IncidentQuickSheet
          shiftId={context.shift.id}
          truckId={context.shift.truckId}
          jobId={activeJobId}
          onClose={() => setSheet(null)}
          onSaved={refetch}
        />
      )}

      {sheet === 'submit' && context?.shift && (
        <SubmitDaySheet loadCount={context.shift.loadCount} onClose={() => setSheet(null)} onConfirm={submitDay} />
      )}

      {sheet === 'full_log' && (
        <FullLogSheet timeline={timeline} labelCtx={siteLabelCtx} onClose={() => setSheet(null)} />
      )}

      {sheet === 'dispatch_ticket' && activeJob && (
        <TicketSheet
          job={activeJob}
          driverDisplayName={driverName ?? '—'}
          truckUnit={context?.shift?.truckId ?? null}
          canSign="driver"
          shiftId={context?.shift?.id ?? null}
          timeline={timeline}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'edit_job' && activeJob && (
        <EditJobSheet
          job={activeJob}
          sites={context?.sites ?? []}
          onClose={() => setSheet(null)}
          onSaved={summary => { fireEvent('note', { notes: summary }); refetch() }}
        />
      )}

      {navigateSite && (
        <NavigateSheet
          site={navigateSite}
          onClose={() => setNavigateSite(null)}
          onLaunch={() => {}}
        />
      )}

      <ToastContainer />
    </div>
  )
}
