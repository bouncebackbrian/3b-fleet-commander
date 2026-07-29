'use client'
import { useMemo, useState } from 'react'
import { useDumpTruckDriver } from '@/hooks/useDumpTruckDriver'
import { canDispatchWithDefects } from '@/lib/dumpTruck/inspections'
import { siteAwareActionLabel } from '@/lib/dumpTruck/actionLabels'
import type { DumpTruckSite } from '@/lib/dumpTruck/types'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

import TopStatusBar from '@/components/dumpTruck/TopStatusBar'
import LeftRail from '@/components/dumpTruck/LeftRail'
import CenterAction from '@/components/dumpTruck/CenterAction'
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

type SheetKey =
  | 'clock_in' | 'odometer_pickup' | 'odometer_dropoff' | 'pretrip' | 'posttrip'
  | 'delay' | 'note' | 'defect' | 'incident' | 'photo' | 'ticket' | 'fuel' | 'submit' | null

export default function DumpTruckDriverPage() {
  const {
    loading, context, flowState, primaryAction, timeline,
    activeJobId, setActiveJobId, isOnline, queueSummary,
    fireEvent, clockIn, submitDay, refetch,
  } = useDumpTruckDriver()

  const [sheet, setSheet] = useState<SheetKey>(null)
  const [navigateSite, setNavigateSite] = useState<DumpTruckSite | null>(null)

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

  const siteLabelCtx = { pickupSiteName: pickupSite?.name, dumpSiteName: dumpSite?.name, yardSiteName: yardSite?.name }
  const displayAction = {
    ...primaryAction,
    label: siteAwareActionLabel(primaryAction.eventType, primaryAction.label, siteLabelCtx),
    secondary: primaryAction.secondary
      ? { ...primaryAction.secondary, label: siteAwareActionLabel(primaryAction.secondary.eventType, primaryAction.secondary.label, siteLabelCtx) }
      : undefined,
  }

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

  const disabledReason = blockingDefectReason ?? needsJobReason

  const handlePrimary = async () => {
    if (primaryAction.opensSubmit) { setSheet('submit'); return }
    if (primaryAction.opensChecklist === 'pretrip') { setSheet('pretrip'); return }
    if (primaryAction.opensChecklist === 'posttrip') { setSheet('posttrip'); return }
    if (primaryAction.eventType === 'clock_in') { setSheet('clock_in'); return }
    if (primaryAction.eventType === 'truck_picked_up') { setSheet('odometer_pickup'); return }
    if (primaryAction.eventType === 'truck_dropped_off') { setSheet('odometer_dropoff'); return }
    if (primaryAction.eventType) {
      const result = await fireEvent(primaryAction.eventType)
      if (result.ok) toast.success(result.siteLabel ? `Saved at ${result.siteLabel}` : 'Saved')
    }
  }

  const handleSecondary = async () => {
    if (!primaryAction.secondary) return
    const result = await fireEvent(primaryAction.secondary.eventType)
    if (result.ok) toast.success(result.siteLabel ? `Saved at ${result.siteLabel}` : 'Saved')
  }

  const quickActions = [
    { key: 'delay', icon: delayActive ? '⏸️' : '⏱️', label: delayActive ? 'End Delay' : 'Delay', enabled: !!context?.shift },
    { key: 'note', icon: '📝', label: 'Note', enabled: !!context?.shift },
    { key: 'photo', icon: '📷', label: 'Photo', enabled: !!context?.shift },
    { key: 'ticket', icon: '🎫', label: 'Load Ticket', enabled: !!context?.shift && (context?.loadCycles.length ?? 0) > 0 },
    { key: 'defect', icon: '🔧', label: 'Defect', enabled: !!context?.shift?.truckId },
    { key: 'incident', icon: '🚨', label: 'Incident', enabled: !!context?.shift },
    { key: 'fuel', icon: '⛽', label: 'Add Fuel', enabled: !!context?.shift?.truckId },
    { key: 'correction', icon: '↩️', label: 'Report Issue', enabled: !!context?.shift },
  ]

  if (loading) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading…</div>
  }

  return (
    <div className="dt-shell">
      <TopStatusBar
        isOnline={isOnline}
        pendingCount={queueSummary.pending + queueSummary.syncing}
        failedCount={queueSummary.failed}
        gpsPermission={null}
      />

      <div className="dt-body">
        <div className="dt-left">
          <LeftRail
            flowState={flowState}
            clockInAt={context?.shift ? (timeline.find(t => t.eventType === 'clock_in')?.effectiveAt ?? null) : null}
            truckUnit={context?.shift?.truckId ? context.shift.truckId : null}
            trailerUnit={null}
            jobs={context?.jobs ?? []}
            activeJobId={activeJobId}
            onChangeJob={setActiveJobId}
            sites={context?.sites ?? []}
            loadCount={context?.shift?.loadCount ?? 0}
            onNavigate={setNavigateSite}
          />
        </div>

        <div className="dt-center">
          <CenterAction
            action={displayAction}
            busy={false}
            disabledReason={disabledReason}
            onPrimary={handlePrimary}
            onSecondary={handleSecondary}
          />
        </div>

        <div className="dt-right">
          <RightRail
            timeline={timeline}
            loadCount={context?.shift?.loadCount ?? 0}
            quickActions={quickActions}
            onQuickAction={key => {
              if (key === 'correction') {
                fireEvent('correction_requested', { notes: 'Driver requested a correction — see timeline for context.' })
                  .then(r => { if (r.ok) toast.success('Correction requested — dispatch will follow up') })
                return
              }
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
            const r = await fireEvent('truck_picked_up', { odometer })
            if (r.ok) toast.success('Custody started')
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
          onClose={() => setSheet(null)}
          onSaved={refetch}
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
