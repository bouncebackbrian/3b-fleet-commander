/**
 * fleet/equipment.ts — full equipment (trucks/trailers) registry service
 *
 * Extends the minimal fleet_equipment table (src/lib/fleet/dumpTruck/equipment.ts
 * covers just the Dump Truck Mode dropdown) with the real CRUD + compliance/
 * maintenance/mileage fields added in 20260729_fleet_equipment_compliance.sql.
 * Shared by both the OTR and Dump Truck Mode sides of the app — one truck
 * record, not two.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'

export interface EquipmentRecord {
  id: string
  businessId: string
  unitNumber: string
  equipmentType: string
  status: string
  vin: string | null
  licensePlate: string | null
  make: string | null
  model: string | null
  year: number | null
  dotNumber: string | null
  mcNumber: string | null
  registrationExp: string | null
  insuranceExp: string | null
  inspectionExp: string | null
  currentOdometer: number | null
  lastOdometerUpdate: string | null
  nextServiceDueDate: string | null
  nextServiceDueMiles: number | null
  notes: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): EquipmentRecord {
  return {
    id: r.id,
    businessId: r.business_id,
    unitNumber: r.unit_number,
    equipmentType: r.equipment_type,
    status: r.status,
    vin: r.vin,
    licensePlate: r.license_plate,
    make: r.make,
    model: r.model,
    year: r.year,
    dotNumber: r.dot_number,
    mcNumber: r.mc_number,
    registrationExp: r.registration_exp,
    insuranceExp: r.insurance_exp,
    inspectionExp: r.inspection_exp,
    currentOdometer: r.current_odometer,
    lastOdometerUpdate: r.last_odometer_update,
    nextServiceDueDate: r.next_service_due_date,
    nextServiceDueMiles: r.next_service_due_miles,
    notes: r.notes,
  }
}

export async function listEquipment(businessId: string): Promise<EquipmentRecord[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .select('*')
    .eq('business_id', businessId)
    .order('unit_number', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface EquipmentInput {
  unitNumber: string
  equipmentType: string
  status?: string
  vin?: string | null
  licensePlate?: string | null
  make?: string | null
  model?: string | null
  year?: number | null
  dotNumber?: string | null
  mcNumber?: string | null
  registrationExp?: string | null
  insuranceExp?: string | null
  inspectionExp?: string | null
  currentOdometer?: number | null
  nextServiceDueDate?: string | null
  nextServiceDueMiles?: number | null
  notes?: string | null
}

function toRow(input: EquipmentInput): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (input.unitNumber !== undefined) row.unit_number = input.unitNumber
  if (input.equipmentType !== undefined) row.equipment_type = input.equipmentType
  if (input.status !== undefined) row.status = input.status
  if (input.vin !== undefined) row.vin = input.vin
  if (input.licensePlate !== undefined) row.license_plate = input.licensePlate
  if (input.make !== undefined) row.make = input.make
  if (input.model !== undefined) row.model = input.model
  if (input.year !== undefined) row.year = input.year
  if (input.dotNumber !== undefined) row.dot_number = input.dotNumber
  if (input.mcNumber !== undefined) row.mc_number = input.mcNumber
  if (input.registrationExp !== undefined) row.registration_exp = input.registrationExp
  if (input.insuranceExp !== undefined) row.insurance_exp = input.insuranceExp
  if (input.inspectionExp !== undefined) row.inspection_exp = input.inspectionExp
  if (input.notes !== undefined) row.notes = input.notes
  if (input.nextServiceDueDate !== undefined) row.next_service_due_date = input.nextServiceDueDate
  if (input.nextServiceDueMiles !== undefined) row.next_service_due_miles = input.nextServiceDueMiles
  if (input.currentOdometer !== undefined) {
    row.current_odometer = input.currentOdometer
    row.last_odometer_update = new Date().toISOString()
  }
  return row
}

export async function createEquipment(
  businessId: string, input: EquipmentInput, userId: string, email: string | null,
): Promise<EquipmentRecord> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .insert({ business_id: businessId, ...toRow(input), created_by: userId })
    .select('*')
    .single()
  if (error) throw error
  const equipment = fromRow(data)
  audit.log({ userId, email, action: 'fleet.equipment.create', resource: 'fleet_equipment', resourceId: equipment.id, after: equipment })
  return equipment
}

export async function updateEquipment(
  businessId: string, equipmentId: string, input: EquipmentInput, userId: string, email: string | null,
): Promise<EquipmentRecord> {
  const { data: before, error: beforeError } = await fleetServiceClient
    .from('fleet_equipment').select('*').eq('id', equipmentId).eq('business_id', businessId).maybeSingle()
  if (beforeError) throw beforeError
  if (!before) throw new Error('Equipment not found')

  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .update(toRow(input))
    .eq('id', equipmentId)
    .eq('business_id', businessId)
    .select('*')
    .single()
  if (error) throw error

  const equipment = fromRow(data)
  audit.log({ userId, email, action: 'fleet.equipment.update', resource: 'fleet_equipment', resourceId: equipment.id, before: fromRow(before), after: equipment })
  return equipment
}

// ── Service records ─────────────────────────────────────────────────────────

export interface ServiceRecord {
  id: string
  businessId: string
  equipmentId: string
  serviceType: string
  performedAt: string
  odometer: number | null
  cost: number | null
  vendorName: string | null
  notes: string | null
  docId: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serviceRecordFromRow(r: any): ServiceRecord {
  return {
    id: r.id, businessId: r.business_id, equipmentId: r.equipment_id,
    serviceType: r.service_type, performedAt: r.performed_at, odometer: r.odometer,
    cost: r.cost != null ? Number(r.cost) : null, vendorName: r.vendor_name, notes: r.notes, docId: r.doc_id,
  }
}

export async function listServiceRecords(businessId: string, equipmentId: string): Promise<ServiceRecord[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment_service_records')
    .select('*')
    .eq('business_id', businessId)
    .eq('equipment_id', equipmentId)
    .order('performed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(serviceRecordFromRow)
}

export interface ServiceRecordInput {
  serviceType: string
  performedAt: string
  odometer?: number | null
  cost?: number | null
  vendorName?: string | null
  notes?: string | null
  docId?: string | null
}

/** Also bumps fleet_equipment.current_odometer when this record's reading is newer/higher. */
export async function createServiceRecord(
  businessId: string, equipmentId: string, input: ServiceRecordInput, userId: string, email: string | null,
): Promise<ServiceRecord> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment_service_records')
    .insert({
      business_id: businessId, equipment_id: equipmentId,
      service_type: input.serviceType, performed_at: input.performedAt,
      odometer: input.odometer ?? null, cost: input.cost ?? null,
      vendor_name: input.vendorName ?? null, notes: input.notes ?? null, doc_id: input.docId ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error

  if (input.odometer != null) {
    const { data: equipment } = await fleetServiceClient
      .from('fleet_equipment').select('current_odometer').eq('id', equipmentId).eq('business_id', businessId).maybeSingle()
    if (equipment && (equipment.current_odometer == null || input.odometer > equipment.current_odometer)) {
      await fleetServiceClient
        .from('fleet_equipment')
        .update({ current_odometer: input.odometer, last_odometer_update: new Date().toISOString() })
        .eq('id', equipmentId).eq('business_id', businessId)
    }
  }

  const record = serviceRecordFromRow(data)
  audit.log({ userId, email, action: 'fleet.equipment.service_record.create', resource: 'fleet_equipment_service_records', resourceId: record.id, after: record })
  return record
}
