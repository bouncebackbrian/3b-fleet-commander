/**
 * fleet/dumpTruck/jobs.ts — Dump Truck Mode dispatch job service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import type { DumpTruckJob } from '@/lib/dumpTruck/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): DumpTruckJob {
  return {
    id: r.id,
    businessId: r.business_id,
    jobNumber: r.job_number,
    poNumber: r.po_number,
    customerName: r.customer_name,
    brokerName: r.broker_name,
    driverId: r.driver_id,
    truckId: r.truck_id,
    trailerId: r.trailer_id,
    pickupSiteId: r.pickup_site_id,
    dumpSiteId: r.dump_site_id,
    material: r.material,
    estQuantity: r.est_quantity != null ? Number(r.est_quantity) : null,
    quantityUnit: r.quantity_unit,
    status: r.status,
    loadTime: r.load_time,
    orderDate: r.order_date,
    deliveryDate: r.delivery_date,
    cosigneeName: r.cosignee_name,
    orderedBy: r.ordered_by,
    contactPhone: r.contact_phone,
    truckType: r.truck_type,
    directions: r.directions,
    travelTimeMinutes: r.travel_time_minutes != null ? Number(r.travel_time_minutes) : null,
    fuelSurcharge: r.fuel_surcharge != null ? Number(r.fuel_surcharge) : null,
    pricePerHour: r.price_per_hour != null ? Number(r.price_per_hour) : null,
    pricePerTon: r.price_per_ton != null ? Number(r.price_per_ton) : null,
    materialCost: r.material_cost != null ? Number(r.material_cost) : null,
  }
}

export async function listJobsForDriver(businessId: string, driverId: string): Promise<DumpTruckJob[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('*')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .in('status', ['scheduled', 'active'])
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface DriverOption {
  userId: string
  name: string
  threebId: string | null
}

/**
 * Active business members available to assign a job to / show in driver
 * pickers (job assignment, dispatch activity log, payroll hours).
 *
 * Not filtered to role='driver' — in a small operation the owner, an admin,
 * or a dispatcher is very often also the one behind the wheel (a solo
 * owner-operator testing this app is exactly that case), so restricting to
 * the 'driver' role silently hid them from every driver dropdown even
 * though their shifts/events were recorded correctly. Any active member can
 * appear here; only members who actually have shift/hours data show up in
 * the payroll and activity-log results themselves.
 *
 * SCHEMA NOTE (2026-07-28): live `profiles` has a single `full_name` column,
 * not `first_name`/`last_name` — see docs/SCHEMA_RECONCILIATION.md.
 */
export async function listDrivers(businessId: string): Promise<DriverOption[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_business_members')
    .select('user_id, profiles(full_name, three_b_id)')
    .eq('business_id', businessId)
    .eq('active', true)
  if (error) throw error
  return (data ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = r.profiles as any
    return { userId: r.user_id, name: profile?.full_name || 'Unnamed driver', threebId: profile?.three_b_id ?? null }
  })
}

export async function listJobs(businessId: string): Promise<DumpTruckJob[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface CreateJobInput {
  jobNumber: string
  poNumber?: string | null
  customerName?: string | null
  brokerName?: string | null
  driverId?: string | null
  truckId?: string | null
  trailerId?: string | null
  pickupSiteId?: string | null
  dumpSiteId?: string | null
  material?: string | null
  estQuantity?: number | null
  quantityUnit?: DumpTruckJob['quantityUnit']
  scheduledAt?: string | null
  instructions?: string | null
  status?: DumpTruckJob['status']
  loadTime?: string | null
  orderDate?: string | null
  deliveryDate?: string | null
  cosigneeName?: string | null
  orderedBy?: string | null
  contactPhone?: string | null
  truckType?: string | null
  directions?: string | null
  travelTimeMinutes?: number | null
  fuelSurcharge?: number | null
  pricePerHour?: number | null
  pricePerTon?: number | null
  materialCost?: number | null
}

export async function createJob(
  businessId: string,
  input: CreateJobInput,
  userId: string,
  email: string | null,
): Promise<DumpTruckJob> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .insert({
      business_id: businessId,
      job_number: input.jobNumber,
      po_number: input.poNumber ?? null,
      customer_name: input.customerName ?? null,
      broker_name: input.brokerName ?? null,
      driver_id: input.driverId ?? null,
      truck_id: input.truckId ?? null,
      trailer_id: input.trailerId ?? null,
      pickup_site_id: input.pickupSiteId ?? null,
      dump_site_id: input.dumpSiteId ?? null,
      material: input.material ?? null,
      est_quantity: input.estQuantity ?? null,
      quantity_unit: input.quantityUnit ?? 'loads',
      scheduled_at: input.scheduledAt ?? null,
      instructions: input.instructions ?? null,
      status: input.status ?? 'scheduled',
      load_time: input.loadTime ?? null,
      order_date: input.orderDate ?? null,
      delivery_date: input.deliveryDate ?? null,
      cosignee_name: input.cosigneeName ?? null,
      ordered_by: input.orderedBy ?? null,
      contact_phone: input.contactPhone ?? null,
      truck_type: input.truckType ?? null,
      directions: input.directions ?? null,
      travel_time_minutes: input.travelTimeMinutes ?? null,
      fuel_surcharge: input.fuelSurcharge ?? null,
      price_per_hour: input.pricePerHour ?? null,
      price_per_ton: input.pricePerTon ?? null,
      material_cost: input.materialCost ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const job = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.job.create', resource: 'fleet_dt_jobs', resourceId: job.id, after: job })
  return job
}

export interface DriverJobEditInput {
  material?: string | null
  pickupSiteId?: string | null
  dumpSiteId?: string | null
}

/**
 * Driver-editable job fields only — material and pickup/dump site.
 * Dispatch frequently changes these verbally mid-shift; drivers need to
 * correct the record themselves rather than wait for an admin. Any active
 * business member may call this (not gated by canWrite) — same "record
 * physical reality" rationale as site GPS pinning. Callers should also log
 * a visible timeline note so dispatch sees what changed and by whom.
 */
export async function updateJobDriverFields(
  businessId: string,
  jobId: string,
  input: DriverJobEditInput,
  userId: string,
  email: string | null,
): Promise<DumpTruckJob> {
  const { data: before, error: beforeError } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (beforeError) throw beforeError
  if (!before) throw new Error('Job not found')

  const patch: Record<string, unknown> = {}
  if (input.material !== undefined) patch.material = input.material
  if (input.pickupSiteId !== undefined) patch.pickup_site_id = input.pickupSiteId
  if (input.dumpSiteId !== undefined) patch.dump_site_id = input.dumpSiteId

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('business_id', businessId)
    .select('*')
    .single()
  if (error) throw error

  const job = fromRow(data)
  audit.log({
    userId, email, action: 'dump_truck.job.driver_edit', resource: 'fleet_dt_jobs', resourceId: job.id,
    before: fromRow(before), after: job,
  })
  return job
}
