import { fleetServiceClient } from '@/lib/fleet-service-client'

export type DayNeedInput = { category?: string; description: string }

type InspectionReportInput = {
  businessId: string
  driverId: string
  inspectionId: string
  inspectionType: 'pretrip' | 'posttrip'
  dayNeeds?: DayNeedInput[]
  driverDayNote?: string | null
}

const SEVERITY_RANK: Record<string, number> = {
  monitor: 1,
  non_safety: 2,
  safety_critical: 3,
  out_of_service: 4,
}

function worstSeverity(items: { severity: string | null }[]) {
  return items.reduce<string | null>((worst, item) => {
    if (!item.severity) return worst
    if (!worst || (SEVERITY_RANK[item.severity] ?? 0) > (SEVERITY_RANK[worst] ?? 0)) return item.severity
    return worst
  }, null)
}

function readinessFor(severity: string | null, hasNeeds: boolean) {
  if (severity === 'out_of_service') return 'out_of_service'
  if (severity === 'safety_critical') return 'critical'
  if (severity === 'non_safety') return 'attention'
  if (hasNeeds) return 'ready_with_needs'
  return 'ready'
}

function compact(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(' | ')
}

export async function syncShiftReportFromInspection(input: InspectionReportInput) {
  const { data: inspection, error } = await fleetServiceClient
    .from('fleet_dt_inspections')
    .select('id, shift_id, truck_id, trailer_id, inspection_type, odometer, started_at, completed_at')
    .eq('id', input.inspectionId)
    .eq('business_id', input.businessId)
    .eq('driver_id', input.driverId)
    .single()
  if (error || !inspection) throw error ?? new Error('Inspection not found')

  if (input.inspectionType === 'pretrip') {
    await fleetServiceClient
      .from('fleet_dt_inspections')
      .update({
        day_needs: input.dayNeeds ?? [],
        driver_day_note: input.driverDayNote ?? null,
      })
      .eq('id', input.inspectionId)
  }

  const [{ data: items }, { data: events }, { data: docs }, { data: truck }, { data: driver }] = await Promise.all([
    fleetServiceClient
      .from('fleet_dt_inspection_items')
      .select('item_label, result, severity, notes')
      .eq('inspection_id', input.inspectionId),
    fleetServiceClient
      .from('fleet_dt_events')
      .select('event_type, effective_at, lat, lng, odometer')
      .eq('shift_id', inspection.shift_id)
      .order('effective_at', { ascending: true }),
    fleetServiceClient
      .from('fleet_dt_documents')
      .select('id, doc_type, file_name, storage_path, captured_at')
      .eq('shift_id', inspection.shift_id)
      .order('captured_at', { ascending: true }),
    inspection.truck_id
      ? fleetServiceClient.from('fleet_equipment').select('unit_number').eq('id', inspection.truck_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fleetServiceClient.from('profiles').select('full_name').eq('id', input.driverId).maybeSingle(),
  ])

  const defects = (items ?? []).filter(i => i.result === 'defect')
  const severity = worstSeverity(defects)
  const needs = (input.dayNeeds ?? []).filter(n => n.description.trim())
  const readiness = readinessFor(severity, needs.length > 0)

  const eventOf = (type: string) => (events ?? []).find(e => e.event_type === type) ?? null
  const clockIn = eventOf('clock_in')
  const clockOut = eventOf('clock_out')
  const preStart = eventOf('pretrip_started')
  const preComplete = eventOf('pretrip_completed')
  const postStart = eventOf('posttrip_started')
  const postComplete = eventOf('posttrip_completed')

  const issueText = defects.length
    ? defects.slice(0, 3).map(d => `${d.item_label}${d.notes ? `: ${d.notes}` : ''}`).join('; ')
    : 'No defects'
  const needsText = needs.length ? needs.slice(0, 3).map(n => n.description).join(', ') : 'Nothing requested'
  const statusLabel = readiness.replaceAll('_', ' ').toUpperCase()
  const driverName = driver?.full_name || 'Driver'
  const unit = truck?.unit_number ? `Truck ${truck.unit_number}` : 'Assigned truck'

  const dispatchSummary = compact([
    `${unit} — ${driverName} — ${statusLabel}`,
    defects.length ? `Issues: ${issueText}` : 'Pre/Post-trip: clear',
    needs.length ? `Needed: ${needsText}` : null,
  ])
  const quickTextSummary = compact([
    `${unit}: ${statusLabel}`,
    defects.length ? issueText : null,
    needs.length ? `Need: ${needsText}` : null,
  ])

  const base = {
    business_id: input.businessId,
    shift_id: inspection.shift_id,
    driver_id: input.driverId,
    truck_id: inspection.truck_id,
    trailer_id: inspection.trailer_id,
    mode_id: 'dump-truck',
    clock_in_at: clockIn?.effective_at ?? null,
    clock_out_at: clockOut?.effective_at ?? null,
    pretrip_started_at: preStart?.effective_at ?? null,
    pretrip_completed_at: preComplete?.effective_at ?? null,
    posttrip_started_at: postStart?.effective_at ?? null,
    posttrip_completed_at: postComplete?.effective_at ?? null,
    paperwork: docs ?? [],
    dispatch_summary: dispatchSummary,
    quick_text_summary: quickTextSummary,
  }

  if (input.inspectionType === 'pretrip') {
    const reportPayload = {
      ...base,
      start_inspection_id: input.inspectionId,
      start_odometer: inspection.odometer,
      start_lat: preComplete?.lat ?? preStart?.lat ?? null,
      start_lng: preComplete?.lng ?? preStart?.lng ?? null,
      readiness_status: readiness,
      report_status: 'start_submitted',
      paperwork_status: 'pending',
      start_summary: {
        defects,
        needs,
        driverNote: input.driverDayNote ?? null,
        submittedAt: inspection.completed_at,
      },
    }

    const { data: report, error: reportError } = await fleetServiceClient
      .from('fleet_dt_shift_reports')
      .upsert(reportPayload, { onConflict: 'business_id,shift_id' })
      .select('id')
      .single()
    if (reportError) throw reportError

    if (needs.length) {
      await fleetServiceClient.from('fleet_dt_shift_needs').insert(
        needs.map(n => ({
          business_id: input.businessId,
          shift_id: inspection.shift_id,
          report_id: report.id,
          driver_id: input.driverId,
          truck_id: inspection.truck_id,
          category: n.category ?? 'other',
          description: n.description.trim(),
        })),
      )
    }

    return { reportId: report.id, readinessStatus: readiness, dispatchSummary, quickTextSummary }
  }

  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_shift_reports')
    .select('id, start_odometer')
    .eq('business_id', input.businessId)
    .eq('shift_id', inspection.shift_id)
    .maybeSingle()

  const endSummary = {
    defects,
    driverNote: input.driverDayNote ?? null,
    submittedAt: inspection.completed_at,
    paperworkCount: (docs ?? []).length,
  }

  if (existing) {
    const { error: updateError } = await fleetServiceClient
      .from('fleet_dt_shift_reports')
      .update({
        ...base,
        end_inspection_id: input.inspectionId,
        end_odometer: inspection.odometer,
        end_lat: postComplete?.lat ?? postStart?.lat ?? null,
        end_lng: postComplete?.lng ?? postStart?.lng ?? null,
        report_status: 'end_submitted',
        paperwork_status: 'pending',
        end_summary: endSummary,
      })
      .eq('id', existing.id)
    if (updateError) throw updateError
    return { reportId: existing.id, readinessStatus: readiness, dispatchSummary, quickTextSummary }
  }

  const { data: created, error: createError } = await fleetServiceClient
    .from('fleet_dt_shift_reports')
    .insert({
      ...base,
      end_inspection_id: input.inspectionId,
      end_odometer: inspection.odometer,
      end_lat: postComplete?.lat ?? postStart?.lat ?? null,
      end_lng: postComplete?.lng ?? postStart?.lng ?? null,
      readiness_status: readiness,
      report_status: 'end_submitted',
      paperwork_status: 'pending',
      end_summary: endSummary,
    })
    .select('id')
    .single()
  if (createError) throw createError
  return { reportId: created.id, readinessStatus: readiness, dispatchSummary, quickTextSummary }
}
