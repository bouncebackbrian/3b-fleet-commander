/**
 * fleet/loads.ts — Load service functions
 *
 * All business logic for the loads table lives here.
 * API routes call these functions — never query the DB directly.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit }              from '@/lib/fleet/audit'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Load {
  id:                 string
  date:               string
  loadNumber?:        string | null
  bolRef?:            string | null
  dispatcher?:        string | null
  broker?:            string | null
  trailer?:           string | null
  moveType?:          string | null
  origin?:            string | null
  destination?:       string | null
  dispatchMiles:      number
  actualMiles:        number
  deadheadMiles:      number
  paidMiles:          number
  cpmRate:            number
  fuelCost:           number
  waitHours:          number
  detentionHours:     number
  detentionPay:       number
  settlementPay:      number
  grossRate?:         number | null
  commodity?:         string | null
  weight?:            string | null
  notes?:             string | null
  proofSaved:         boolean
  settlementVerified: boolean
  userId?:            string | null
  createdAt:          string
  updatedAt?:         string | null
}

export interface CreateLoadInput {
  date:               string
  loadNumber?:        string
  bolRef?:            string
  dispatcher?:        string
  broker?:            string
  trailer?:           string
  moveType?:          string
  origin?:            string
  destination?:       string
  dispatchMiles?:     number
  actualMiles?:       number
  deadheadMiles?:     number
  paidMiles?:         number
  cpmRate?:           number
  fuelCost?:          number
  waitHours?:         number
  detentionHours?:    number
  detentionPay?:      number
  settlementPay?:     number
  grossRate?:         number
  commodity?:         string
  weight?:            string
  notes?:             string
}

export interface UpdateLoadInput extends Partial<CreateLoadInput> {
  proofSaved?:         boolean
  settlementVerified?: boolean
}

// ── Mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): Load {
  return {
    id:                 r.id,
    date:               r.date,
    loadNumber:         r.load_number,
    bolRef:             r.bol_ref,
    dispatcher:         r.dispatcher,
    broker:             r.broker,
    trailer:            r.trailer,
    moveType:           r.move_type,
    origin:             r.origin,
    destination:        r.destination,
    dispatchMiles:      Number(r.dispatch_miles)  || 0,
    actualMiles:        Number(r.actual_miles)    || 0,
    deadheadMiles:      Number(r.deadhead_miles)  || 0,
    paidMiles:          Number(r.paid_miles)      || 0,
    cpmRate:            Number(r.cpm_rate)        || 0.55,
    fuelCost:           Number(r.fuel_cost)       || 0,
    waitHours:          Number(r.wait_hours)      || 0,
    detentionHours:     Number(r.detention_hours) || 0,
    detentionPay:       Number(r.detention_pay)   || 0,
    settlementPay:      Number(r.settlement_pay)  || 0,
    grossRate:          r.gross_rate ? Number(r.gross_rate) : null,
    commodity:          r.commodity,
    weight:             r.weight,
    notes:              r.notes,
    proofSaved:         Boolean(r.proof_saved),
    settlementVerified: Boolean(r.settlement_verified),
    userId:             r.user_id,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function getLoads(userId: string): Promise<Load[]> {
  const { data, error } = await fleetServiceClient
    .from('loads')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function getLoad(id: string, userId: string): Promise<Load | null> {
  const { data, error } = await fleetServiceClient
    .from('loads')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function createLoad(
  input: CreateLoadInput,
  userId: string,
  email: string | null,
): Promise<Load> {
  const { data, error } = await fleetServiceClient
    .from('loads')
    .insert({
      user_id:        userId,
      date:           input.date,
      load_number:    input.loadNumber,
      bol_ref:        input.bolRef,
      dispatcher:     input.dispatcher,
      broker:         input.broker,
      trailer:        input.trailer,
      move_type:      input.moveType,
      origin:         input.origin,
      destination:    input.destination,
      dispatch_miles: input.dispatchMiles,
      actual_miles:   input.actualMiles,
      deadhead_miles: input.deadheadMiles,
      paid_miles:     input.paidMiles,
      cpm_rate:       input.cpmRate,
      fuel_cost:      input.fuelCost,
      wait_hours:     input.waitHours,
      detention_hours:input.detentionHours,
      detention_pay:  input.detentionPay,
      settlement_pay: input.settlementPay,
      gross_rate:     input.grossRate,
      commodity:      input.commodity,
      weight:         input.weight,
      notes:          input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  const load = fromRow(data)
  audit.log({ userId, email, action: 'load.create', resource: 'loads', resourceId: load.id, after: load })
  return load
}

export async function updateLoad(
  id: string,
  input: UpdateLoadInput,
  userId: string,
  email: string | null,
): Promise<Load> {
  const before = await getLoad(id, userId)
  const updates: Record<string, unknown> = {}
  if (input.date           !== undefined) updates.date            = input.date
  if (input.loadNumber     !== undefined) updates.load_number     = input.loadNumber
  if (input.bolRef         !== undefined) updates.bol_ref         = input.bolRef
  if (input.dispatcher     !== undefined) updates.dispatcher      = input.dispatcher
  if (input.broker         !== undefined) updates.broker          = input.broker
  if (input.trailer        !== undefined) updates.trailer         = input.trailer
  if (input.moveType       !== undefined) updates.move_type       = input.moveType
  if (input.origin         !== undefined) updates.origin          = input.origin
  if (input.destination    !== undefined) updates.destination     = input.destination
  if (input.dispatchMiles  !== undefined) updates.dispatch_miles  = input.dispatchMiles
  if (input.actualMiles    !== undefined) updates.actual_miles    = input.actualMiles
  if (input.deadheadMiles  !== undefined) updates.deadhead_miles  = input.deadheadMiles
  if (input.paidMiles      !== undefined) updates.paid_miles      = input.paidMiles
  if (input.cpmRate        !== undefined) updates.cpm_rate        = input.cpmRate
  if (input.fuelCost       !== undefined) updates.fuel_cost       = input.fuelCost
  if (input.settlementPay  !== undefined) updates.settlement_pay  = input.settlementPay
  if (input.detentionPay   !== undefined) updates.detention_pay   = input.detentionPay
  if (input.grossRate      !== undefined) updates.gross_rate      = input.grossRate
  if (input.notes          !== undefined) updates.notes           = input.notes
  if (input.proofSaved     !== undefined) updates.proof_saved     = input.proofSaved
  if (input.settlementVerified !== undefined) updates.settlement_verified = input.settlementVerified
  updates.updated_at = new Date().toISOString()

  const { data, error } = await fleetServiceClient
    .from('loads')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  const load = fromRow(data)
  audit.log({ userId, email, action: 'load.update', resource: 'loads', resourceId: id, before, after: load })
  return load
}

export async function deleteLoad(id: string, userId: string, email: string | null): Promise<void> {
  const before = await getLoad(id, userId)
  const { error } = await fleetServiceClient
    .from('loads')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
  audit.log({ userId, email, action: 'load.delete', resource: 'loads', resourceId: id, before })
}
