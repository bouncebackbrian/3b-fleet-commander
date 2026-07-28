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
 * Drivers (fleet_business_members.role='driver') available to assign a job to.
 *
 * SCHEMA NOTE (2026-07-28): live `profiles` has a single `full_name` column,
 * not `first_name`/`last_name` — see docs/SCHEMA_RECONCILIATION.md.
 */
export async function listDrivers(businessId: string): Promise<DriverOption[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_business_members')
    .select('user_id, profiles(full_name, three_b_id)')
    .eq('business_id', businessId)
    .eq('role', 'driver')
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
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const job = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.job.create', resource: 'fleet_dt_jobs', resourceId: job.id, after: job })
  return job
}
