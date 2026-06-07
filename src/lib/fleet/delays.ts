/**
 * fleet/delays.ts — Delay entry service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit }              from '@/lib/fleet/audit'

export interface DelayEntry {
  id:                 string
  loadNumber:         string
  trailer?:           string | null
  delayType:          string
  location:           string
  totalHours:         number
  billable:           string
  detentionRate?:     number | null
  potentialPay:       number
  dispatcherNotified: boolean
  proofSaved:         boolean
  notes?:             string | null
  userId?:            string | null
  createdAt:          string
}

export interface CreateDelayInput {
  loadNumber:          string
  trailer?:            string
  delayType:           string
  location:            string
  totalHours:          number
  billable:            string
  detentionRate?:      number
  dispatcherNotified?: boolean
  notes?:              string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): DelayEntry {
  return {
    id:                 r.id,
    loadNumber:         r.load_number,
    trailer:            r.trailer,
    delayType:          r.delay_type,
    location:           r.location,
    totalHours:         Number(r.total_hours)    || 0,
    billable:           r.billable ?? 'Review',
    detentionRate:      r.detention_rate ? Number(r.detention_rate) : null,
    potentialPay:       Number(r.potential_pay)  || 0,
    dispatcherNotified: Boolean(r.dispatcher_notified),
    proofSaved:         Boolean(r.proof_saved),
    notes:              r.notes,
    userId:             r.user_id,
    createdAt:          r.created_at,
  }
}

export async function getDelays(userId: string): Promise<DelayEntry[]> {
  const { data, error } = await fleetServiceClient
    .from('delays')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function createDelay(
  input: CreateDelayInput,
  userId: string,
  email: string | null,
): Promise<DelayEntry> {
  const potentialPay = input.detentionRate
    ? input.totalHours * input.detentionRate
    : 0

  const { data, error } = await fleetServiceClient
    .from('delays')
    .insert({
      user_id:              userId,
      load_number:          input.loadNumber,
      trailer:              input.trailer,
      delay_type:           input.delayType,
      location:             input.location,
      total_hours:          input.totalHours,
      billable:             input.billable,
      detention_rate:       input.detentionRate,
      potential_pay:        potentialPay,
      dispatcher_notified:  input.dispatcherNotified ?? false,
      notes:                input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  const delay = fromRow(data)
  audit.log({ userId, email, action: 'delay.create', resource: 'delays', resourceId: delay.id, after: delay })
  return delay
}

export async function updateDelay(
  id: string,
  input: Partial<CreateDelayInput & { dispatcherNotified: boolean; proofSaved: boolean }>,
  userId: string,
  email: string | null,
): Promise<DelayEntry> {
  const { data: before } = await fleetServiceClient.from('delays').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  const updates: Record<string, unknown> = {}
  if (input.loadNumber          !== undefined) updates.load_number          = input.loadNumber
  if (input.trailer             !== undefined) updates.trailer               = input.trailer
  if (input.delayType           !== undefined) updates.delay_type            = input.delayType
  if (input.location            !== undefined) updates.location              = input.location
  if (input.totalHours          !== undefined) updates.total_hours           = input.totalHours
  if (input.billable            !== undefined) updates.billable              = input.billable
  if (input.detentionRate       !== undefined) updates.detention_rate        = input.detentionRate
  if (input.notes               !== undefined) updates.notes                 = input.notes
  if (input.dispatcherNotified  !== undefined) updates.dispatcher_notified   = input.dispatcherNotified
  if (input.proofSaved          !== undefined) updates.proof_saved           = input.proofSaved

  const { data, error } = await fleetServiceClient
    .from('delays')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  const delay = fromRow(data)
  audit.log({ userId, email, action: 'delay.update', resource: 'delays', resourceId: id, before, after: delay })
  return delay
}

export async function deleteDelay(id: string, userId: string, email: string | null): Promise<void> {
  const { data: before } = await fleetServiceClient.from('delays').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  const { error } = await fleetServiceClient.from('delays').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
  audit.log({ userId, email, action: 'delay.delete', resource: 'delays', resourceId: id, before })
}
