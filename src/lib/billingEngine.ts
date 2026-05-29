'use client'
/**
 * billingEngine.ts — Fleet Commander Platform Billing Engine
 *
 * Two revenue streams:
 *   1. Subscriptions  — per-module, per-business, monthly/annual
 *   2. Transaction fees — % of rate confirmation when a load is brokered through FC
 *
 * "The system does the work" — every brokered load that closes automatically:
 *   → reads the rate confirmation
 *   → calculates the platform fee
 *   → writes a fleet_platform_fees record
 *   → queues it for the next invoice
 *
 * No manual invoicing. No chasing. The platform takes its cut on close.
 *
 * Supabase tables:
 *   fleet_rate_confirmations   — agreed rate per load
 *   fleet_platform_fees        — auto-calculated fees at load close
 *   fleet_billing_subscriptions— per-module subscription records
 *   fleet_billing_invoices     — monthly invoice aggregates
 */

import { createClient } from '@/lib/supabase-browser'
import { logOpsEvent } from '@/lib/opsEventLog'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default platform fee percentage for brokered loads */
export const DEFAULT_BROKER_FEE_PCT = 0.0075   // 0.75%

/** Module pricing in cents (set actuals when pricing is decided) */
export const MODULE_PRICE_CENTS: Record<BillingModule, number> = {
  dispatch:       4900,    // $49/mo — placeholder
  driver:         2900,    // $29/mo per seat — placeholder
  hos_planning:   2900,    // $29/mo
  maintenance:    2900,    // $29/mo
  broker:         4900,    // $49/mo
  reports:        1900,    // $19/mo
  bundle_core:    9900,    // $99/mo (dispatch + driver + HOS — ~20% off)
  bundle_full:    14900,   // $149/mo (all modules — ~30% off)
  owner_op_flat:  7900,    // $79/mo flat (all modules, 1 driver seat)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type BillingModule =
  | 'dispatch'
  | 'driver'
  | 'hos_planning'
  | 'maintenance'
  | 'broker'
  | 'reports'
  | 'bundle_core'
  | 'bundle_full'
  | 'owner_op_flat'

export type FeeStatus   = 'pending' | 'invoiced' | 'paid' | 'waived' | 'disputed'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

export interface RateConfirmation {
  id:                string
  loadId?:           string | null
  businessId?:       string | null
  brokerBusinessId?: string | null
  grossRate:         number
  fuelSurcharge:     number
  accessorials:      number
  totalRate:         number          // derived: gross + fuel + acc
  currency:          string
  confirmedAt:       string
  confirmedBy?:      string | null
}

export interface PlatformFee {
  id:          string
  loadId?:     string | null
  rateConfId?: string | null
  businessId?: string | null
  feePct:      number          // e.g. 0.0075
  feeBasis:    number          // rate amount the % is applied to
  feeAmount:   number          // $ amount of the fee
  feeType:     string
  status:      FeeStatus
  invoiceId?:  string | null
  createdAt:   string
}

export interface BillingSubscription {
  id:            string
  businessId:    string
  module:        BillingModule
  billingPeriod: 'monthly' | 'annual'
  priceCents:    number
  seatCount:     number
  active:        boolean
  startedAt:     string
  cancelledAt?:  string | null
  stripeSubId?:  string | null
}

export interface BillingInvoice {
  id:                        string
  businessId:                string
  periodStart:               string
  periodEnd:                 string
  subscriptionTotalCents:    number
  transactionFeeTotalCents:  number
  totalCents:                number
  status:                    InvoiceStatus
  stripeInvoiceId?:          string | null
  dueDate?:                  string | null
  paidAt?:                   string | null
  createdAt:                 string
}

// ── Rate confirmation ─────────────────────────────────────────────────────────

/**
 * saveRateConfirmation — record the agreed rate for a load.
 * Call this when the rate confirmation is signed/agreed.
 */
export async function saveRateConfirmation(opts: {
  loadId?:           string
  businessId?:       string
  brokerBusinessId?: string
  grossRate:         number
  fuelSurcharge?:    number
  accessorials?:     number
  confirmedBy?:      string
}): Promise<RateConfirmation | null> {
  const totalRate = (opts.grossRate) + (opts.fuelSurcharge ?? 0) + (opts.accessorials ?? 0)

  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('fleet_rate_confirmations')
      .insert({
        load_id:            opts.loadId          ?? null,
        business_id:        opts.businessId      ?? null,
        broker_business_id: opts.brokerBusinessId ?? null,
        gross_rate:         opts.grossRate,
        fuel_surcharge:     opts.fuelSurcharge ?? 0,
        accessorials:       opts.accessorials  ?? 0,
        confirmed_by:       opts.confirmedBy   ?? null,
      })
      .select()
      .single()

    if (error || !data) return null

    logOpsEvent({
      eventType:    'human_action',
      severity:     'info',
      loadNumber:   opts.loadId,
      sourceEngine: 'manual',
      title:        `Rate confirmation saved — $${totalRate.toFixed(2)}`,
      payload:      { grossRate: opts.grossRate, totalRate, brokerBusinessId: opts.brokerBusinessId },
    })

    return {
      id:                data.id,
      loadId:            data.load_id,
      businessId:        data.business_id,
      brokerBusinessId:  data.broker_business_id,
      grossRate:         Number(data.gross_rate),
      fuelSurcharge:     Number(data.fuel_surcharge),
      accessorials:      Number(data.accessorials),
      totalRate,
      currency:          data.currency,
      confirmedAt:       data.confirmed_at,
      confirmedBy:       data.confirmed_by,
    }
  } catch { return null }
}

// ── Platform fee calculation ──────────────────────────────────────────────────

/**
 * calculatePlatformFee — called automatically when a brokered load closes.
 *
 * A load is "brokered through FC" when it has a rate confirmation with a
 * broker_business_id set (meaning the broker used the Broker Module to assign it).
 *
 * Fee basis = gross_rate (not including accessorials — standard industry practice).
 */
export async function calculatePlatformFee(
  loadId:     string,
  rateConfId: string,
  businessId: string,
  feePct:     number = DEFAULT_BROKER_FEE_PCT,
): Promise<PlatformFee | null> {
  try {
    const supabase = createClient()

    // Get rate confirmation
    const { data: rateConf } = await supabase
      .from('fleet_rate_confirmations')
      .select('gross_rate, broker_business_id')
      .eq('id', rateConfId)
      .single()

    if (!rateConf) return null

    // Only charge fee if this was brokered through FC
    if (!rateConf.broker_business_id) return null

    const feeBasis  = Number(rateConf.gross_rate)
    const feeAmount = Math.round(feeBasis * feePct * 100) / 100  // round to cents

    const { data, error } = await supabase
      .from('fleet_platform_fees')
      .insert({
        load_id:      loadId,
        rate_conf_id: rateConfId,
        business_id:  businessId,
        fee_pct:      feePct,
        fee_basis:    feeBasis,
        fee_amount:   feeAmount,
        fee_type:     'broker_transaction',
        status:       'pending',
      })
      .select()
      .single()

    if (error || !data) return null

    logOpsEvent({
      eventType:    'human_action',
      severity:     'info',
      loadNumber:   loadId,
      sourceEngine: 'manual',
      title:        `Platform fee calculated — $${feeAmount.toFixed(2)} (${(feePct * 100).toFixed(2)}% of $${feeBasis.toFixed(2)})`,
      payload:      { feePct, feeBasis, feeAmount, rateConfId },
    })

    return {
      id:          data.id,
      loadId:      data.load_id,
      rateConfId:  data.rate_conf_id,
      businessId:  data.business_id,
      feePct:      Number(data.fee_pct),
      feeBasis:    Number(data.fee_basis),
      feeAmount:   Number(data.fee_amount),
      feeType:     data.fee_type,
      status:      data.status as FeeStatus,
      invoiceId:   data.invoice_id,
      createdAt:   data.created_at,
    }
  } catch { return null }
}

/**
 * onLoadClose — call this when a load is marked delivered.
 * Auto-calculates platform fee if the load was brokered through FC.
 * This is the core "system does the work" hook.
 */
export async function onLoadClose(opts: {
  loadId:     string
  businessId: string
  feePct?:    number
}): Promise<void> {
  try {
    const supabase = createClient()

    // Find the rate confirmation for this load
    const { data: rateConf } = await supabase
      .from('fleet_rate_confirmations')
      .select('id, broker_business_id')
      .eq('load_id', opts.loadId)
      .limit(1)
      .maybeSingle()

    if (!rateConf?.broker_business_id) return  // not brokered through FC — no fee

    await calculatePlatformFee(
      opts.loadId,
      rateConf.id,
      opts.businessId,
      opts.feePct ?? DEFAULT_BROKER_FEE_PCT,
    )
  } catch { /* fire-and-forget */ }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export async function getBusinessSubscriptions(businessId: string): Promise<BillingSubscription[]> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('fleet_billing_subscriptions')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)

    return (data ?? []).map(mapSubscription)
  } catch { return [] }
}

export async function addSubscription(opts: {
  businessId:    string
  module:        BillingModule
  billingPeriod?: 'monthly' | 'annual'
  seatCount?:    number
  stripeSubId?:  string
}): Promise<BillingSubscription | null> {
  const priceCents = calculateModulePrice(opts.module, opts.billingPeriod ?? 'monthly', opts.seatCount ?? 1)

  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('fleet_billing_subscriptions')
      .upsert({
        business_id:    opts.businessId,
        module:         opts.module,
        billing_period: opts.billingPeriod ?? 'monthly',
        price_cents:    priceCents,
        seat_count:     opts.seatCount ?? 1,
        active:         true,
        stripe_sub_id:  opts.stripeSubId ?? null,
      }, { onConflict: 'business_id,module' })
      .select()
      .single()

    if (error || !data) return null
    return mapSubscription(data)
  } catch { return null }
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase
      .from('fleet_billing_subscriptions')
      .update({ active: false, cancelled_at: new Date().toISOString() })
      .eq('id', subscriptionId)
  } catch { /* ignore */ }
}

// ── Invoice generation ────────────────────────────────────────────────────────

/**
 * generateMonthlyInvoice — aggregate all charges for a business into one invoice.
 * Called by a scheduled job at end of billing period.
 * In standalone mode: can be triggered manually from account settings.
 */
export async function generateMonthlyInvoice(
  businessId:  string,
  periodStart: string,   // ISO date YYYY-MM-DD
  periodEnd:   string,
): Promise<BillingInvoice | null> {
  try {
    const supabase = createClient()

    // Sum active subscriptions
    const { data: subs } = await supabase
      .from('fleet_billing_subscriptions')
      .select('price_cents, seat_count')
      .eq('business_id', businessId)
      .eq('active', true)

    const subscriptionTotal = (subs ?? []).reduce(
      (sum, s) => sum + (s.price_cents * s.seat_count), 0
    )

    // Sum pending platform fees in this period
    const { data: fees } = await supabase
      .from('fleet_platform_fees')
      .select('fee_amount')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd + 'T23:59:59Z')

    const transactionFeeTotal = Math.round(
      (fees ?? []).reduce((sum, f) => sum + Number(f.fee_amount), 0) * 100
    )  // convert to cents

    const totalCents = subscriptionTotal + transactionFeeTotal
    const dueDate    = new Date(periodEnd)
    dueDate.setDate(dueDate.getDate() + 15)  // net-15

    const { data: invoice, error } = await supabase
      .from('fleet_billing_invoices')
      .insert({
        business_id:                  businessId,
        period_start:                 periodStart,
        period_end:                   periodEnd,
        subscription_total_cents:     subscriptionTotal,
        transaction_fee_total_cents:  transactionFeeTotal,
        total_cents:                  totalCents,
        status:                       'draft',
        due_date:                     dueDate.toISOString().split('T')[0],
      })
      .select()
      .single()

    if (error || !invoice) return null

    // Mark fees as invoiced
    if (fees && fees.length > 0) {
      await supabase
        .from('fleet_platform_fees')
        .update({ status: 'invoiced', invoice_id: invoice.id })
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59Z')
    }

    logOpsEvent({
      eventType:    'human_action',
      severity:     'info',
      sourceEngine: 'manual',
      title:        `Invoice generated — $${(totalCents / 100).toFixed(2)} for period ${periodStart} → ${periodEnd}`,
      payload:      { businessId, subscriptionTotal, transactionFeeTotal, totalCents },
    })

    return {
      id:                       invoice.id,
      businessId:               invoice.business_id,
      periodStart:              invoice.period_start,
      periodEnd:                invoice.period_end,
      subscriptionTotalCents:   invoice.subscription_total_cents,
      transactionFeeTotalCents: invoice.transaction_fee_total_cents,
      totalCents:               invoice.total_cents,
      status:                   invoice.status as InvoiceStatus,
      stripeInvoiceId:          invoice.stripe_invoice_id,
      dueDate:                  invoice.due_date,
      paidAt:                   invoice.paid_at,
      createdAt:                invoice.created_at,
    }
  } catch { return null }
}

// ── Billing summary ───────────────────────────────────────────────────────────

export interface BillingSummary {
  activeModules:        BillingModule[]
  monthlySubscription:  number    // $ per month
  pendingFees:          number    // $ in pending transaction fees
  isOwnerOp:            boolean
  hasBundle:            boolean
  bundleDiscount:       number    // $ saved vs à la carte
}

export async function getBillingSummary(businessId: string): Promise<BillingSummary> {
  const subs = await getBusinessSubscriptions(businessId)

  const activeModules    = subs.map(s => s.module)
  const isOwnerOp        = activeModules.includes('owner_op_flat')
  const hasBundle        = activeModules.includes('bundle_full') || activeModules.includes('bundle_core')
  const monthlyTotal     = subs.reduce((sum, s) => sum + (s.priceCents * s.seatCount) / 100, 0)

  // Calculate what they'd pay à la carte (for bundle discount display)
  const aLaCarteTotal = activeModules
    .filter(m => !m.startsWith('bundle') && m !== 'owner_op_flat')
    .reduce((sum, m) => sum + MODULE_PRICE_CENTS[m] / 100, 0)
  const bundleDiscount = Math.max(0, aLaCarteTotal - monthlyTotal)

  // Pending transaction fees
  let pendingFees = 0
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('fleet_platform_fees')
      .select('fee_amount')
      .eq('business_id', businessId)
      .eq('status', 'pending')
    pendingFees = (data ?? []).reduce((sum, f) => sum + Number(f.fee_amount), 0)
  } catch { /* ignore */ }

  return { activeModules, monthlySubscription: monthlyTotal, pendingFees, isOwnerOp, hasBundle, bundleDiscount }
}

// ── Module pricing logic ──────────────────────────────────────────────────────

export function calculateModulePrice(
  module:        BillingModule,
  billingPeriod: 'monthly' | 'annual' = 'monthly',
  seatCount:     number = 1,
): number {
  const baseMonthly = MODULE_PRICE_CENTS[module] ?? 0
  const annual      = Math.round(baseMonthly * 12 * 0.85)   // 15% annual discount
  const base        = billingPeriod === 'annual' ? Math.round(annual / 12) : baseMonthly
  return base * seatCount
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ── Map helpers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubscription(d: any): BillingSubscription {
  return {
    id:            d.id,
    businessId:    d.business_id,
    module:        d.module as BillingModule,
    billingPeriod: d.billing_period,
    priceCents:    d.price_cents,
    seatCount:     d.seat_count,
    active:        d.active,
    startedAt:     d.started_at,
    cancelledAt:   d.cancelled_at ?? null,
    stripeSubId:   d.stripe_sub_id ?? null,
  }
}
