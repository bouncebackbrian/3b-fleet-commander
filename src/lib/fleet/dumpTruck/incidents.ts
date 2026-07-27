/**
 * fleet/dumpTruck/incidents.ts — incident quick-action service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'

export interface CreateIncidentInput {
  shiftId?: string | null
  truckId?: string | null
  jobId?: string | null
  incidentType: 'collision' | 'property_damage' | 'near_miss' | 'injury' | 'spill' | 'equipment_failure' | 'other'
  description: string
  occurredAt: string
  lat?: number | null
  lng?: number | null
  injuries: boolean
  policeReportNumber?: string | null
  policeAgency?: string | null
  otherPartyDetails?: Record<string, unknown>
  witnesses?: { name: string; phone?: string }[]
  immediateSafetyStatus: 'safe' | 'needs_assistance' | 'emergency'
}

export async function createIncident(
  businessId: string, driverId: string, email: string | null, input: CreateIncidentInput,
): Promise<{ id: string }> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_incidents')
    .insert({
      business_id: businessId,
      shift_id: input.shiftId ?? null,
      driver_id: driverId,
      truck_id: input.truckId ?? null,
      job_id: input.jobId ?? null,
      incident_type: input.incidentType,
      description: input.description,
      occurred_at: input.occurredAt,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      injuries: input.injuries,
      police_report_number: input.policeReportNumber ?? null,
      police_agency: input.policeAgency ?? null,
      other_party_details: input.otherPartyDetails ?? {},
      witnesses: input.witnesses ?? [],
      immediate_safety_status: input.immediateSafetyStatus,
    })
    .select('id')
    .single()
  if (error) throw error

  // Safety-critical incidents get flagged for immediate admin visibility.
  const isUrgent = input.injuries || input.immediateSafetyStatus !== 'safe' || input.incidentType === 'collision'
  audit.log({
    userId: driverId, email, action: 'dump_truck.incident.create', resource: 'fleet_dt_incidents',
    resourceId: data.id, metadata: { urgent: isUrgent, incidentType: input.incidentType },
  })

  return { id: data.id }
}

export interface QuickDefectInput {
  truckId: string
  trailerId?: string | null
  shiftId?: string | null
  description: string
  severity: 'monitor' | 'non_safety' | 'safety_critical' | 'out_of_service'
}

export async function reportQuickDefect(
  businessId: string, driverId: string, email: string | null, input: QuickDefectInput,
): Promise<{ id: string }> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_defects')
    .insert({
      business_id: businessId,
      truck_id: input.truckId,
      trailer_id: input.trailerId ?? null,
      shift_id: input.shiftId ?? null,
      description: input.description,
      severity: input.severity,
      reported_by: driverId,
    })
    .select('id')
    .single()
  if (error) throw error

  audit.log({ userId: driverId, email, action: 'dump_truck.defect.report', resource: 'fleet_dt_defects', resourceId: data.id, metadata: { severity: input.severity } })
  return { id: data.id }
}
