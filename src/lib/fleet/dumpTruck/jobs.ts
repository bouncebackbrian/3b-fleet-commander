/**
 * fleet/dumpTruck/jobs.ts — Dump Truck Mode dispatch job service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { createTicketInstance } from './ticketInstances'
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
    brokerId: r.broker_id,
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
    freightBillNumber: r.freight_bill_number,
    scheduledEndTime: r.scheduled_end_time,
    signedOutBy: r.signed_out_by,
    signedOutAt: r.signed_out_at,
    source: r.source,
    dispatchAcceptedBy: r.dispatch_accepted_by,
    dispatchAcceptedAt: r.dispatch_accepted_at,
  }
}

export async function getJobById(businessId: string, jobId: string): Promise<DumpTruckJob | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
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
  brokerId?: string | null
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
  freightBillNumber?: string | null
  scheduledEndTime?: string | null
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
      broker_id: input.brokerId ?? null,
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
      freight_bill_number: input.freightBillNumber ?? null,
      scheduled_end_time: input.scheduledEndTime ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const job = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.job.create', resource: 'fleet_dt_jobs', resourceId: job.id, after: job })
  if (job.driverId) await createTicketInstance(businessId, job.id, job.driverId, job.brokerId)
  return job
}

/**
 * Jobs relevant to the Broker portal desk (/broker) — either a broker name
 * is on file (dispatch assigned an external broker to the deal) or the
 * broker portal itself originated the deal via proposeJob(), regardless of
 * whether a broker_name label was filled in.
 */
export async function listBrokerJobs(businessId: string): Promise<DumpTruckJob[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('*')
    .eq('business_id', businessId)
    .or('broker_name.not.is.null,source.eq.broker')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface ProposeJobInput {
  customerName?: string | null
  brokerName?: string | null
  brokerId?: string | null
  material?: string | null
  estQuantity?: number | null
  quantityUnit?: DumpTruckJob['quantityUnit']
  pickupSiteId?: string | null
  dumpSiteId?: string | null
  fuelSurcharge?: number | null
  pricePerHour?: number | null
  pricePerTon?: number | null
  materialCost?: number | null
  instructions?: string | null
}

/**
 * A Broker-portal user originates a deal — no driver/truck yet, status
 * 'proposed'. Dispatch picks up the deal from there via acceptJob(). Job
 * number is server-generated (brokers don't know dispatch's numbering).
 */
export async function proposeJob(
  businessId: string,
  input: ProposeJobInput,
  brokerUserId: string,
  email: string | null,
): Promise<DumpTruckJob> {
  const jobNumber = `BRK-${Date.now().toString(36).toUpperCase()}`

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .insert({
      business_id: businessId,
      job_number: jobNumber,
      customer_name: input.customerName ?? null,
      broker_name: input.brokerName ?? null,
      broker_id: input.brokerId ?? null,
      material: input.material ?? null,
      est_quantity: input.estQuantity ?? null,
      quantity_unit: input.quantityUnit ?? 'loads',
      pickup_site_id: input.pickupSiteId ?? null,
      dump_site_id: input.dumpSiteId ?? null,
      fuel_surcharge: input.fuelSurcharge ?? null,
      price_per_hour: input.pricePerHour ?? null,
      price_per_ton: input.pricePerTon ?? null,
      material_cost: input.materialCost ?? null,
      instructions: input.instructions ?? null,
      status: 'proposed',
      source: 'broker',
      created_by: brokerUserId,
    })
    .select('*')
    .single()
  if (error) throw error

  const job = fromRow(data)
  audit.log({ userId: brokerUserId, email, action: 'dump_truck.job.broker_propose', resource: 'fleet_dt_jobs', resourceId: job.id, after: job })
  return job
}

/** Every proposed (broker-originated, not yet dispatch-accepted) job — powers the dispatch "Pending Broker Deals" queue. */
export async function listProposedJobs(businessId: string): Promise<DumpTruckJob[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'proposed')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/**
 * Dispatch accepts a broker-proposed deal in one action: picks driver/truck,
 * the job goes 'proposed' -> 'scheduled'. Guards against double-accept
 * (409-equivalent thrown error) the same way team/accept guards against
 * re-accepting an already-used invite.
 */
export async function acceptJob(
  businessId: string,
  jobId: string,
  driverId: string,
  truckId: string,
  trailerId: string | null,
  dispatcherId: string,
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
  if (before.status !== 'proposed') throw new Error('Job is not awaiting acceptance')

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .update({
      status: 'scheduled',
      driver_id: driverId,
      truck_id: truckId,
      trailer_id: trailerId,
      dispatch_accepted_by: dispatcherId,
      dispatch_accepted_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('business_id', businessId)
    .select('*')
    .single()
  if (error) throw error

  const job = fromRow(data)
  audit.log({
    userId: dispatcherId, email, action: 'dump_truck.job.dispatch_accept', resource: 'fleet_dt_jobs', resourceId: job.id,
    before: fromRow(before), after: job,
  })
  await createTicketInstance(businessId, job.id, job.driverId, job.brokerId)
  return job
}

export interface BrokerJobEditInput {
  brokerName?: string | null
  pricePerHour?: number | null
  pricePerTon?: number | null
  fuelSurcharge?: number | null
  materialCost?: number | null
}

/** Broker-editable job fields only — broker name and the rate fields. Manage-level Broker portal access required (checked by the route). */
export async function updateJobBrokerFields(
  businessId: string,
  jobId: string,
  input: BrokerJobEditInput,
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
  if (input.brokerName !== undefined) patch.broker_name = input.brokerName
  if (input.pricePerHour !== undefined) patch.price_per_hour = input.pricePerHour
  if (input.pricePerTon !== undefined) patch.price_per_ton = input.pricePerTon
  if (input.fuelSurcharge !== undefined) patch.fuel_surcharge = input.fuelSurcharge
  if (input.materialCost !== undefined) patch.material_cost = input.materialCost

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
    userId, email, action: 'dump_truck.job.broker_edit', resource: 'fleet_dt_jobs', resourceId: job.id,
    before: fromRow(before), after: job,
  })
  return job
}

export interface DriverJobEditInput {
  material?: string | null
  pickupSiteId?: string | null
  dumpSiteId?: string | null
  truckType?: string | null
  /** Driver-written estimate on the paper ticket, e.g. "3:15 PM incl. drive to yard". */
  scheduledEndTime?: string | null
  /** Name of the customer/job-site rep who formally released the driver. */
  signedOutBy?: string | null
  signedOutAt?: string | null
}

/**
 * Driver-editable job fields only — material, pickup/dump site, truck
 * configuration, and the paper-ticket sign-out fields (scheduled end time as
 * written on paper, plus who/when the job site actually signed the driver
 * out — distinct from the app's own clock_out, which is the driver's own
 * action, not the customer's). Dispatch frequently changes material/site/
 * truck-type verbally mid-shift; drivers need to correct the record
 * themselves rather than wait for an admin. Any active business member may
 * call this (not gated by canManage) — same "record physical reality"
 * rationale as site GPS pinning. Callers should also log a visible timeline
 * note so dispatch sees what changed and by whom.
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
  if (input.truckType !== undefined) patch.truck_type = input.truckType
  if (input.scheduledEndTime !== undefined) patch.scheduled_end_time = input.scheduledEndTime
  if (input.signedOutBy !== undefined) patch.signed_out_by = input.signedOutBy
  if (input.signedOutAt !== undefined) patch.signed_out_at = input.signedOutAt

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
