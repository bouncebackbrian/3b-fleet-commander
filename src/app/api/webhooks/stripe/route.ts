/**
 * POST /api/webhooks/stripe
 *
 * Verifies Stripe signature and syncs subscription state to Supabase.
 * Webhook is the source of truth — NOT the success redirect.
 *
 * Events handled:
 *   checkout.session.completed       → map user → Stripe customer + subscription
 *   customer.subscription.created    → sync new subscription
 *   customer.subscription.updated    → sync plan/status changes
 *   customer.subscription.deleted    → sync cancellation
 *   invoice.paid                     → confirm renewal, keep period_end accurate
 *   invoice.payment_failed           → surface failed payment state
 *
 * Raw body required for signature verification — do NOT parse JSON before constructEvent.
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertBillingCustomer(params: {
  userId:           string
  stripeCustomerId: string
  email?:           string | null
}) {
  const { error } = await supabaseAdmin
    .from('billing_customers')
    .upsert(
      {
        user_id:            params.userId,
        stripe_customer_id: params.stripeCustomerId,
        email:              params.email ?? null,
      },
      { onConflict: 'user_id' }
    )
  if (error) throw error
}

async function upsertSubscription(
  subscription: Stripe.Subscription,
  userId?:      string | null,
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id

  const priceId = subscription.items.data[0]?.price?.id ?? null

  // Resolve user ID — prefer passed-in, then metadata, then customer lookup
  let resolvedUserId = userId ?? subscription.metadata?.user_id ?? null

  if (!resolvedUserId && customerId) {
    const { data: billingCustomer } = await supabaseAdmin
      .from('billing_customers')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    resolvedUserId = billingCustomer?.user_id ?? null
  }

  if (!resolvedUserId || !customerId) {
    throw new Error(`Unable to resolve user for subscription ${subscription.id}`)
  }

  const item = subscription.items.data[0]

  const payload = {
    user_id:               resolvedUserId,
    stripe_customer_id:    customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id:       priceId,
    status:                subscription.status,
    current_period_start:  item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    trial_start: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    metadata: subscription.metadata ?? {},
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payload, { onConflict: 'stripe_subscription_id' })
  if (error) throw error
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Verify Stripe signature using raw body
  let event: Stripe.Event

  try {
    const sig  = (await headers()).get('stripe-signature')
    const body = await req.text()

    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed'
    console.error('[stripe/webhook] signature error:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // 2. Handle events
  try {
    switch (event.type) {

      // ── Checkout completed → map user to Stripe customer + subscription ───
      case 'checkout.session.completed': {
        const session  = event.data.object as Stripe.Checkout.Session
        const userId   = (session.client_reference_id as string | null)
                      ?? session.metadata?.user_id
                      ?? null
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id

        if (userId && customerId) {
          await upsertBillingCustomer({
            userId,
            stripeCustomerId: customerId,
            email: session.customer_details?.email ?? null,
          })
        }

        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          const subscription = await stripe.subscriptions.retrieve(subId)
          await upsertSubscription(subscription, userId)
        }
        break
      }

      // ── Subscription lifecycle ─────────────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await upsertSubscription(subscription)
        break
      }

      // ── Invoice events → re-fetch subscription to keep period_end current ─
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // In Stripe SDK 2026+, subscription is accessed via parent property
        const invoice = event.data.object as Stripe.Invoice & { parent?: { subscription_details?: { subscription?: string } } }
        const subId: string | null =
          (invoice as unknown as Record<string, unknown>)['subscription'] as string | null
          ?? invoice.parent?.subscription_details?.subscription
          ?? null
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId)
          await upsertSubscription(subscription)
        }
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[stripe/webhook] handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
