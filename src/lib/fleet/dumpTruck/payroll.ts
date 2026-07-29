/**
 * fleet/dumpTruck/payroll.ts — pay-period payment records (2026-07-29)
 *
 * "A spot to reflect check numbers and amount paid... for driver records."
 * One record per driver per weekly pay period (fleet_dt_payroll_payments) —
 * weekly matches the existing Monday–Sunday getWeekRange() boundaries
 * exactly (see src/lib/dumpTruck/hours.ts), so no new period-boundary
 * logic was needed. Distinct from the payrollApprovedGrossEarnings /
 * "Payroll Approval Status" columns already in DailyHoursRow — those
 * represent a sign-off workflow that isn't built yet; this is a simpler
 * disbursement record (check #, amount, date paid).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import type { DateRange } from '@/lib/dumpTruck/hours'

export interface PayrollPayment {
  driverId: string
  periodStart: string
  periodEnd: string
  checkNumber: string | null
  amountPaid: number | null
  paidAt: string | null
  notes: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): PayrollPayment {
  return {
    driverId: r.driver_id, periodStart: r.period_start, periodEnd: r.period_end,
    checkNumber: r.check_number, amountPaid: r.amount_paid != null ? Number(r.amount_paid) : null,
    paidAt: r.paid_at, notes: r.notes,
  }
}

export async function getPayrollPayment(businessId: string, driverId: string, period: DateRange): Promise<PayrollPayment | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_payroll_payments')
    .select('*')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .eq('period_start', period.start)
    .eq('period_end', period.end)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

/** Every payment record for a business in one pay period — powers the dispatch payroll panel. */
export async function listPayrollPayments(businessId: string, period: DateRange): Promise<PayrollPayment[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_payroll_payments')
    .select('*')
    .eq('business_id', businessId)
    .eq('period_start', period.start)
    .eq('period_end', period.end)
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface UpsertPayrollPaymentInput {
  checkNumber?: string | null
  amountPaid?: number | null
  paidAt?: string | null
  notes?: string | null
}

export async function upsertPayrollPayment(
  businessId: string, driverId: string, period: DateRange, input: UpsertPayrollPaymentInput, userId: string, email: string | null,
): Promise<PayrollPayment> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_payroll_payments')
    .upsert({
      business_id: businessId, driver_id: driverId,
      period_start: period.start, period_end: period.end,
      check_number: input.checkNumber ?? null,
      amount_paid: input.amountPaid ?? null,
      paid_at: input.paidAt ?? null,
      notes: input.notes ?? null,
      paid_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,driver_id,period_start,period_end' })
    .select('*')
    .single()
  if (error) throw error

  const payment = fromRow(data)
  audit.log({
    userId, email, action: 'dump_truck.payroll_payment.upsert', resource: 'fleet_dt_payroll_payments',
    metadata: { driverId, periodStart: period.start, periodEnd: period.end, checkNumber: payment.checkNumber, amountPaid: payment.amountPaid },
  })
  return payment
}
