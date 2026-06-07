/**
 * fleet/fuel.ts — Fuel entry service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit }              from '@/lib/fleet/audit'

export interface FuelEntry {
  id:           string
  date:         string
  location:     string
  fuelType:     string
  gallons:      number
  pricePerGal?: number | null
  totalCost:    number
  loadNumber?:  string | null
  receiptSaved: boolean
  notes?:       string | null
  userId?:      string | null
  createdAt:    string
}

export interface CreateFuelInput {
  date:         string
  location:     string
  fuelType:     string
  gallons:      number
  pricePerGal?: number
  totalCost:    number
  loadNumber?:  string
  notes?:       string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): FuelEntry {
  return {
    id:           r.id,
    date:         r.date,
    location:     r.location,
    fuelType:     r.fuel_type,
    gallons:      Number(r.gallons)      || 0,
    pricePerGal:  r.price_per_gal ? Number(r.price_per_gal) : null,
    totalCost:    Number(r.total_cost)   || 0,
    loadNumber:   r.load_number,
    receiptSaved: Boolean(r.receipt_saved),
    notes:        r.notes,
    userId:       r.user_id,
    createdAt:    r.created_at,
  }
}

export async function getFuelEntries(userId: string): Promise<FuelEntry[]> {
  const { data, error } = await fleetServiceClient
    .from('fuel_entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function createFuelEntry(
  input: CreateFuelInput,
  userId: string,
  email: string | null,
): Promise<FuelEntry> {
  const { data, error } = await fleetServiceClient
    .from('fuel_entries')
    .insert({
      user_id:       userId,
      date:          input.date,
      location:      input.location,
      fuel_type:     input.fuelType,
      gallons:       input.gallons,
      price_per_gal: input.pricePerGal,
      total_cost:    input.totalCost,
      load_number:   input.loadNumber,
      notes:         input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  const entry = fromRow(data)
  audit.log({ userId, email, action: 'fuel.create', resource: 'fuel_entries', resourceId: entry.id, after: entry })
  return entry
}

export async function updateFuelEntry(
  id: string,
  input: Partial<CreateFuelInput & { receiptSaved: boolean }>,
  userId: string,
  email: string | null,
): Promise<FuelEntry> {
  const { data: before } = await fleetServiceClient.from('fuel_entries').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  const updates: Record<string, unknown> = {}
  if (input.date          !== undefined) updates.date          = input.date
  if (input.location      !== undefined) updates.location      = input.location
  if (input.fuelType      !== undefined) updates.fuel_type     = input.fuelType
  if (input.gallons       !== undefined) updates.gallons       = input.gallons
  if (input.pricePerGal   !== undefined) updates.price_per_gal = input.pricePerGal
  if (input.totalCost     !== undefined) updates.total_cost    = input.totalCost
  if (input.loadNumber    !== undefined) updates.load_number   = input.loadNumber
  if (input.notes         !== undefined) updates.notes         = input.notes
  if (input.receiptSaved  !== undefined) updates.receipt_saved = input.receiptSaved

  const { data, error } = await fleetServiceClient
    .from('fuel_entries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  const entry = fromRow(data)
  audit.log({ userId, email, action: 'fuel.update', resource: 'fuel_entries', resourceId: id, before, after: entry })
  return entry
}

export async function deleteFuelEntry(id: string, userId: string, email: string | null): Promise<void> {
  const { data: before } = await fleetServiceClient.from('fuel_entries').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  const { error } = await fleetServiceClient.from('fuel_entries').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
  audit.log({ userId, email, action: 'fuel.delete', resource: 'fuel_entries', resourceId: id, before })
}
