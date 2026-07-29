/**
 * fleet/dumpTruck/brokers.ts — broker contact directory
 *
 * Replaces the free-text fleet_dt_jobs.broker_name with a real, reusable
 * record (2026-07-29 — driver-requested, first real row backfilled from a
 * live job was "Penny Knight Trucking"). broker_name stays on jobs as a
 * legacy display fallback for rows never linked to a directory entry.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'

export interface Broker {
  id: string
  businessId: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): Broker {
  return {
    id: r.id, businessId: r.business_id, name: r.name,
    contactName: r.contact_name, phone: r.phone, email: r.email, notes: r.notes, active: r.active,
  }
}

export async function listBrokers(businessId: string): Promise<Broker[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_brokers')
    .select('*')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface CreateBrokerInput {
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export async function createBroker(
  businessId: string, input: CreateBrokerInput, userId: string, email: string | null,
): Promise<Broker> {
  // A broker quick-added twice under the same name reuses the existing
  // record instead of erroring on the unique constraint — and does NOT
  // overwrite any contact details already on file with blanks from a
  // bare "+ Add new broker, name only" quick-create.
  const { data: existing } = await fleetServiceClient
    .from('fleet_brokers')
    .select('*')
    .eq('business_id', businessId)
    .eq('name', input.name)
    .maybeSingle()
  if (existing) return fromRow(existing)

  const { data, error } = await fleetServiceClient
    .from('fleet_brokers')
    .insert({
      business_id: businessId,
      name: input.name,
      contact_name: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error

  const broker = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.broker.create', resource: 'fleet_brokers', resourceId: broker.id, after: broker })
  return broker
}
