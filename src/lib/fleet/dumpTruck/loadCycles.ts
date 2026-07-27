/**
 * fleet/dumpTruck/loadCycles.ts — load ticket attachment (spec §7, §9)
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'

export interface LoadCycleSummary {
  id: string
  sequence: number
  jobId: string
  pickupSiteId: string | null
  dumpSiteId: string | null
  ticketNumber: string | null
  scaleTicketDocId: string | null
  deliveryTicketDocId: string | null
  dumpDepartEventId: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): LoadCycleSummary {
  return {
    id: r.id, sequence: r.sequence, jobId: r.job_id,
    pickupSiteId: r.pickup_site_id, dumpSiteId: r.dump_site_id,
    ticketNumber: r.ticket_number,
    scaleTicketDocId: r.scale_ticket_doc_id, deliveryTicketDocId: r.delivery_ticket_doc_id,
    dumpDepartEventId: r.dump_depart_event_id,
  }
}

export async function listLoadCyclesForShift(businessId: string, shiftId: string): Promise<LoadCycleSummary[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_load_cycles')
    .select('id, sequence, job_id, pickup_site_id, dump_site_id, ticket_number, scale_ticket_doc_id, delivery_ticket_doc_id, dump_depart_event_id')
    .eq('business_id', businessId)
    .eq('shift_id', shiftId)
    .order('sequence', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export type TicketType = 'scale' | 'delivery'

export async function attachLoadTicket(
  businessId: string, loadCycleId: string, ticketType: TicketType,
  docId: string, ticketNumber: string | null, userId: string, email: string | null,
): Promise<void> {
  const { data: loadCycle } = await fleetServiceClient
    .from('fleet_dt_load_cycles')
    .select('id, business_id')
    .eq('id', loadCycleId)
    .maybeSingle()
  if (!loadCycle || loadCycle.business_id !== businessId) throw new DumpTruckError('Load cycle not found', 404)

  const update: Record<string, unknown> = ticketType === 'scale'
    ? { scale_ticket_doc_id: docId }
    : { delivery_ticket_doc_id: docId }
  if (ticketNumber) update.ticket_number = ticketNumber

  const { error } = await fleetServiceClient.from('fleet_dt_load_cycles').update(update).eq('id', loadCycleId)
  if (error) throw error

  audit.log({
    userId, email, action: `dump_truck.load_cycle.ticket.${ticketType}`,
    resource: 'fleet_dt_load_cycles', resourceId: loadCycleId, metadata: { docId, ticketNumber },
  })
}
