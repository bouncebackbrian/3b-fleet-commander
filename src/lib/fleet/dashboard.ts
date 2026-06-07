/**
 * fleet/dashboard.ts — Dashboard aggregate stats
 *
 * Single query surface for the dashboard page.
 * Returns aggregated metrics without exposing raw rows to the UI.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'

export interface DashboardStats {
  loads: {
    total:          number
    totalRevenue:   number
    totalMiles:     number
    avgCpm:         number
    pendingSettle:  number
  }
  fuel: {
    total:          number
    totalCost:      number
    totalGallons:   number
    avgPricePerGal: number
  }
  delays: {
    total:          number
    billableHours:  number
    potentialPay:   number
  }
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const [loadsRes, fuelRes, delaysRes] = await Promise.all([
    fleetServiceClient
      .from('loads')
      .select('settlement_pay, dispatch_miles, cpm_rate, settlement_verified')
      .eq('user_id', userId),
    fleetServiceClient
      .from('fuel_entries')
      .select('total_cost, gallons, price_per_gal')
      .eq('user_id', userId),
    fleetServiceClient
      .from('delays')
      .select('total_hours, billable, potential_pay')
      .eq('user_id', userId),
  ])

  const loads = loadsRes.data ?? []
  const fuel  = fuelRes.data  ?? []
  const delays = delaysRes.data ?? []

  const totalRevenue  = loads.reduce((s, l) => s + (Number(l.settlement_pay) || 0), 0)
  const totalMiles    = loads.reduce((s, l) => s + (Number(l.dispatch_miles) || 0), 0)
  const avgCpm        = totalMiles > 0 ? totalRevenue / totalMiles : 0
  const pendingSettle = loads.filter(l => !l.settlement_verified).length

  const totalFuelCost    = fuel.reduce((s, f) => s + (Number(f.total_cost) || 0), 0)
  const totalGallons     = fuel.reduce((s, f) => s + (Number(f.gallons) || 0), 0)
  const avgPricePerGal   = totalGallons > 0 ? totalFuelCost / totalGallons : 0

  const billableDelays   = delays.filter(d => d.billable === 'Yes')
  const billableHours    = billableDelays.reduce((s, d) => s + (Number(d.total_hours) || 0), 0)
  const potentialPay     = billableDelays.reduce((s, d) => s + (Number(d.potential_pay) || 0), 0)

  return {
    loads:  { total: loads.length, totalRevenue, totalMiles, avgCpm, pendingSettle },
    fuel:   { total: fuel.length, totalCost: totalFuelCost, totalGallons, avgPricePerGal },
    delays: { total: delays.length, billableHours, potentialPay },
  }
}
