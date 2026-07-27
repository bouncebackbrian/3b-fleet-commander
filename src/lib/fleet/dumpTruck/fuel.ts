/**
 * fleet/dumpTruck/fuel.ts — fuel entry service functions (spec §9)
 *
 * Scope note: "miles since prior odometer entry" is computed from the
 * vehicle's prior fleet_dt_fuel_entries.odometer only (not blended with
 * vehicle-custody odometer readings) — documented simplification.
 *
 * Scope note: creating a fuel entry does not auto-fire fuel_stop_started/
 * fuel_stop_ended timing events — those remain a separate, unused-by-default
 * event pair a driver could fire via the generic events endpoint. Fueling
 * duration on the hours portal will read 0 unless that's wired up later.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { computeFuelEfficiency, validateFuelEntry } from '@/lib/dumpTruck/fuel'
import { DumpTruckError } from './shared'
import { getShiftById } from './shifts'

export interface FuelEntryInput {
  shiftId: string | null
  vehicleId: string
  jobId?: string | null
  vendorName?: string | null
  purchasedAt: string
  lat?: number | null
  lng?: number | null
  locationAccuracyM?: number | null
  odometer?: number | null
  fuelType: 'diesel' | 'gasoline' | 'def' | 'reefer' | 'other'
  gallons?: number | null
  pricePerGallon?: number | null
  totalCost: number
  tax?: number | null
  paymentMethod?: string | null
  fuelCardRef?: string | null
  fullTank: boolean
  receiptDocId?: string | null
  ocrMerchant?: string | null
  ocrDate?: string | null
  ocrGallons?: number | null
  ocrPricePerGallon?: number | null
  ocrTotal?: number | null
  ocrAddress?: string | null
  ocrConfidence?: 'high' | 'medium' | 'low' | null
  driverVerified: boolean
  notes?: string | null
}

async function getPriorOdometer(businessId: string, vehicleId: string, beforePurchasedAt: string): Promise<number | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_fuel_entries')
    .select('odometer')
    .eq('business_id', businessId)
    .eq('vehicle_id', vehicleId)
    .lt('purchased_at', beforePurchasedAt)
    .not('odometer', 'is', null)
    .order('purchased_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.odometer ?? null
}

export async function createFuelEntry(
  businessId: string, driverId: string, email: string | null, input: FuelEntryInput,
): Promise<{ id: string; flags: { decreasingOdometer: boolean; unrealisticJump: boolean; missingTotal: boolean } }> {
  if (input.shiftId) {
    const shift = await getShiftById(input.shiftId)
    if (!shift || shift.businessId !== businessId || shift.driverId !== driverId) {
      throw new DumpTruckError('Shift not found', 404)
    }
  }

  const priorOdometer = await getPriorOdometer(businessId, input.vehicleId, input.purchasedAt)
  const efficiency = computeFuelEfficiency({
    odometer: input.odometer ?? null, priorOdometer, gallons: input.gallons ?? null, totalCost: input.totalCost,
  })
  const flags = validateFuelEntry({ odometer: input.odometer ?? null, priorOdometer, totalCost: input.totalCost })

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_fuel_entries')
    .insert({
      business_id: businessId,
      driver_id: driverId,
      shift_id: input.shiftId,
      vehicle_id: input.vehicleId,
      job_id: input.jobId ?? null,
      vendor_name: input.vendorName ?? null,
      purchased_at: input.purchasedAt,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      location_accuracy_m: input.locationAccuracyM ?? null,
      odometer: input.odometer ?? null,
      fuel_type: input.fuelType,
      gallons: input.gallons ?? null,
      price_per_gallon: input.pricePerGallon ?? null,
      total_cost: input.totalCost,
      tax: input.tax ?? null,
      payment_method: input.paymentMethod ?? null,
      fuel_card_ref: input.fuelCardRef ?? null,
      full_tank: input.fullTank,
      receipt_doc_id: input.receiptDocId ?? null,
      ocr_merchant: input.ocrMerchant ?? null,
      ocr_date: input.ocrDate ?? null,
      ocr_gallons: input.ocrGallons ?? null,
      ocr_price_per_gallon: input.ocrPricePerGallon ?? null,
      ocr_total: input.ocrTotal ?? null,
      ocr_address: input.ocrAddress ?? null,
      ocr_confidence: input.ocrConfidence ?? null,
      driver_verified: input.driverVerified,
      flag_decreasing_odometer: flags.decreasingOdometer,
      flag_unrealistic_jump: flags.unrealisticJump,
      notes: input.notes ?? null,
      created_by: driverId,
    })
    .select('id')
    .single()
  if (error) throw error

  audit.log({
    userId: driverId, email, action: 'dump_truck.fuel.create', resource: 'fleet_dt_fuel_entries',
    resourceId: data.id, metadata: { totalCost: input.totalCost, gallons: input.gallons, ...efficiency, ...flags },
  })

  return { id: data.id, flags }
}

export async function listFuelEntriesForShift(businessId: string, shiftId: string) {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_fuel_entries')
    .select('*')
    .eq('business_id', businessId)
    .eq('shift_id', shiftId)
    .order('purchased_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
