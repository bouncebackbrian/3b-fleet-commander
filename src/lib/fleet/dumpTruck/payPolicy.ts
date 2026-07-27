/**
 * fleet/dumpTruck/payPolicy.ts — minimal hourly + daily-OT pay policy (spec §10 seed rule)
 *
 * Not the full multi-rate-type pay policy engine — see hours.ts module doc.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DEFAULT_PAY_POLICY, type PayPolicy } from '@/lib/dumpTruck/hours'

export async function getPayPolicy(businessId: string): Promise<PayPolicy & { isDefault: boolean }> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_pay_policies')
    .select('base_hourly_rate, daily_ot_threshold_hours, ot_multiplier')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!data) return { ...DEFAULT_PAY_POLICY, isDefault: true }

  return {
    baseHourlyRate: Number(data.base_hourly_rate),
    dailyOtThresholdHours: Number(data.daily_ot_threshold_hours),
    otMultiplier: Number(data.ot_multiplier),
    isDefault: false,
  }
}

export interface UpsertPayPolicyInput {
  baseHourlyRate: number
  dailyOtThresholdHours: number
  otMultiplier: number
  notes?: string | null
}

export async function upsertPayPolicy(
  businessId: string, input: UpsertPayPolicyInput, userId: string, email: string | null,
): Promise<void> {
  const { error } = await fleetServiceClient
    .from('fleet_dt_pay_policies')
    .upsert({
      business_id: businessId,
      base_hourly_rate: input.baseHourlyRate,
      daily_ot_threshold_hours: input.dailyOtThresholdHours,
      ot_multiplier: input.otMultiplier,
      notes: input.notes ?? null,
      created_by: userId,
    }, { onConflict: 'business_id' })
  if (error) throw error

  audit.log({ userId, email, action: 'dump_truck.pay_policy.update', resource: 'fleet_dt_pay_policies', metadata: { ...input } })
}
