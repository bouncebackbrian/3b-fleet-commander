/**
 * fleet/dumpTruck/payPolicy.ts — hourly + daily-OT, or per-mile, pay policy
 *
 * Not the full multi-rate-type pay policy engine — see hours.ts module doc.
 *
 * 2026-07-29: a business has one default policy (driver_id null) plus
 * optional per-driver overrides (driver_id set) — "some pay by mile and
 * some pay by hour" within the same business. Resolution order for a given
 * driver: their override row, else the business default, else
 * DEFAULT_PAY_POLICY (hard-coded fallback if nothing has been configured).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DEFAULT_PAY_POLICY, type PayPolicy } from '@/lib/dumpTruck/hours'

const SELECT_COLUMNS = 'base_hourly_rate, daily_ot_threshold_hours, ot_multiplier, pay_type, rate_per_mile, revenue_share_pct, dispatch_minimum_hours'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): PayPolicy {
  return {
    baseHourlyRate: Number(r.base_hourly_rate),
    dailyOtThresholdHours: Number(r.daily_ot_threshold_hours),
    otMultiplier: Number(r.ot_multiplier),
    payType: r.pay_type === 'per_mile' || r.pay_type === 'greater_of_hourly_or_revenue_share' ? r.pay_type : 'hourly',
    ratePerMile: r.rate_per_mile != null ? Number(r.rate_per_mile) : null,
    revenueSharePct: r.revenue_share_pct != null ? Number(r.revenue_share_pct) : null,
    dispatchMinimumHours: r.dispatch_minimum_hours != null ? Number(r.dispatch_minimum_hours) : 4,
  }
}

/** The business-wide default policy only (no driver override applied). */
export async function getPayPolicy(businessId: string): Promise<PayPolicy & { isDefault: boolean }> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_pay_policies')
    .select(SELECT_COLUMNS)
    .eq('business_id', businessId)
    .is('driver_id', null)
    .maybeSingle()

  if (!data) return { ...DEFAULT_PAY_POLICY, isDefault: true }
  return { ...fromRow(data), isDefault: false }
}

/** The effective policy for one driver: their override if set, else the business default, else the hard-coded fallback. */
export async function getPayPolicyForDriver(businessId: string, driverId: string): Promise<PayPolicy & { isDefault: boolean; isOverride: boolean }> {
  const { data: override } = await fleetServiceClient
    .from('fleet_dt_pay_policies')
    .select(SELECT_COLUMNS)
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .maybeSingle()
  if (override) return { ...fromRow(override), isDefault: false, isOverride: true }

  const businessDefault = await getPayPolicy(businessId)
  return { ...businessDefault, isOverride: false }
}

/** Every per-driver override on file for a business — powers the admin pay-policy panel. */
export async function listPayPolicyOverrides(businessId: string): Promise<(PayPolicy & { driverId: string })[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_pay_policies')
    .select(`driver_id, ${SELECT_COLUMNS}`)
    .eq('business_id', businessId)
    .not('driver_id', 'is', null)
  if (error) throw error
  return (data ?? []).map(r => ({ ...fromRow(r), driverId: r.driver_id as string }))
}

export interface UpsertPayPolicyInput {
  baseHourlyRate: number
  dailyOtThresholdHours: number
  otMultiplier: number
  payType?: 'hourly' | 'per_mile' | 'greater_of_hourly_or_revenue_share'
  ratePerMile?: number | null
  revenueSharePct?: number | null
  dispatchMinimumHours?: number
  notes?: string | null
}

/** driverId omitted/null writes the business default; set writes that driver's override. */
export async function upsertPayPolicy(
  businessId: string, input: UpsertPayPolicyInput, userId: string, email: string | null, driverId?: string | null,
): Promise<void> {
  let query = fleetServiceClient.from('fleet_dt_pay_policies').select('id').eq('business_id', businessId)
  query = driverId ? query.eq('driver_id', driverId) : query.is('driver_id', null)
  const { data: existing } = await query.maybeSingle()

  const row = {
    business_id: businessId,
    driver_id: driverId ?? null,
    base_hourly_rate: input.baseHourlyRate,
    daily_ot_threshold_hours: input.dailyOtThresholdHours,
    ot_multiplier: input.otMultiplier,
    pay_type: input.payType ?? 'hourly',
    rate_per_mile: input.ratePerMile ?? null,
    revenue_share_pct: input.revenueSharePct ?? null,
    dispatch_minimum_hours: input.dispatchMinimumHours ?? 4,
    notes: input.notes ?? null,
    created_by: userId,
  }

  const { error } = existing
    ? await fleetServiceClient.from('fleet_dt_pay_policies').update(row).eq('id', existing.id)
    : await fleetServiceClient.from('fleet_dt_pay_policies').insert(row)
  if (error) throw error

  audit.log({ userId, email, action: 'dump_truck.pay_policy.update', resource: 'fleet_dt_pay_policies', metadata: { driverId: driverId ?? null, ...input } })
}

/** Remove a driver's override — they fall back to the business default. */
export async function deletePayPolicyOverride(businessId: string, driverId: string, userId: string, email: string | null): Promise<void> {
  const { error } = await fleetServiceClient
    .from('fleet_dt_pay_policies')
    .delete()
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
  if (error) throw error
  audit.log({ userId, email, action: 'dump_truck.pay_policy.override_deleted', resource: 'fleet_dt_pay_policies', metadata: { driverId } })
}
