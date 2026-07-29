/**
 * fleet/dumpTruck/adminFuel.ts — dispatch/admin fuel + MPG summary across the fleet
 *
 * Driver-requested visual aid: miles, fuel amount, and cost per truck, plus
 * an MPG average, on the dispatch portal. Reuses the same pure
 * computeFuelEfficiency() the driver-facing fuel entry flow already uses for
 * its per-entry odometer-jump/decreasing-odometer flags — this just walks a
 * vehicle's whole purchase history instead of one prior reading.
 *
 * "Average MPG" here is total miles / total gallons across the range (a
 * fuel-weighted average), not a mean of each entry's individual MPG — more
 * representative than treating every fill-up as equally sized.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { computeFuelEfficiency } from '@/lib/dumpTruck/fuel'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface FuelEntryDetail {
  purchasedAt: string
  odometer: number | null
  gallons: number | null
  totalCost: number
  mpg: number | null
}

export interface VehicleFuelSummary {
  vehicleId: string
  vehicleUnit: string
  entryCount: number
  totalGallons: number
  totalCost: number
  totalMiles: number
  avgMpg: number | null
  avgPricePerGallon: number | null
  entries: FuelEntryDetail[]
}

export interface FleetFuelSummary {
  vehicles: VehicleFuelSummary[]
  totalGallons: number
  totalCost: number
  totalMiles: number
  fleetAvgMpg: number | null
}

export interface FuelSummaryOpts {
  from?: string | null // YYYY-MM-DD
  to?: string | null   // YYYY-MM-DD
}

export async function buildFuelSummaryForBusiness(businessId: string, opts: FuelSummaryOpts = {}): Promise<FleetFuelSummary> {
  let query = fleetServiceClient
    .from('fleet_dt_fuel_entries')
    .select('vehicle_id, purchased_at, odometer, gallons, total_cost')
    .eq('business_id', businessId)
    .order('purchased_at', { ascending: true })
  if (opts.from) query = query.gte('purchased_at', `${opts.from}T00:00:00Z`)
  if (opts.to) query = query.lte('purchased_at', `${opts.to}T23:59:59.999Z`)
  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []

  const vehicleIds = [...new Set(rows.map(r => r.vehicle_id))]
  const { data: equipment } = vehicleIds.length
    ? await fleetServiceClient.from('fleet_equipment').select('id, unit_number').in('id', vehicleIds)
    : { data: [] as { id: string; unit_number: string }[] }
  const unitByVehicleId = new Map((equipment ?? []).map(e => [e.id, e.unit_number]))

  const byVehicle = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byVehicle.get(r.vehicle_id) ?? []
    list.push(r)
    byVehicle.set(r.vehicle_id, list)
  }

  const vehicles: VehicleFuelSummary[] = []
  for (const [vehicleId, entries] of byVehicle) {
    let priorOdometer: number | null = null
    let totalGallons = 0, totalCost = 0, totalMiles = 0
    const entryDetails: FuelEntryDetail[] = []

    for (const e of entries) {
      const eff = computeFuelEfficiency({
        odometer: e.odometer, priorOdometer, gallons: e.gallons, totalCost: e.total_cost,
      })
      if (eff.milesSincePrior != null) totalMiles += eff.milesSincePrior
      if (e.gallons != null) totalGallons += e.gallons
      totalCost += e.total_cost
      entryDetails.push({ purchasedAt: e.purchased_at, odometer: e.odometer, gallons: e.gallons, totalCost: e.total_cost, mpg: eff.mpg })
      if (e.odometer != null) priorOdometer = e.odometer
    }

    vehicles.push({
      vehicleId,
      vehicleUnit: unitByVehicleId.get(vehicleId) ?? 'Unknown Truck',
      entryCount: entries.length,
      totalGallons: round2(totalGallons),
      totalCost: round2(totalCost),
      totalMiles: round2(totalMiles),
      avgMpg: totalGallons > 0 ? round2(totalMiles / totalGallons) : null,
      avgPricePerGallon: totalGallons > 0 ? round2(totalCost / totalGallons) : null,
      entries: entryDetails.reverse(), // most recent first for display
    })
  }

  vehicles.sort((a, b) => a.vehicleUnit.localeCompare(b.vehicleUnit))

  const totalGallons = round2(vehicles.reduce((s, v) => s + v.totalGallons, 0))
  const totalCost = round2(vehicles.reduce((s, v) => s + v.totalCost, 0))
  const totalMiles = round2(vehicles.reduce((s, v) => s + v.totalMiles, 0))

  return {
    vehicles, totalGallons, totalCost, totalMiles,
    fleetAvgMpg: totalGallons > 0 ? round2(totalMiles / totalGallons) : null,
  }
}
