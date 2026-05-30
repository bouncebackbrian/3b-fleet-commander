/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session in subscription mode.
 * Attaches user_id in client_reference_id and subscription metadata.
 * Reuses existing Stripe customer when available.
 *
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body:    { priceId?: string }  — defaults to STRIPE_PRICE_PRO_MONTHLY
 */

import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'

function getAuthedSupabase(req: Request) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.replace('Bearer ', '')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

export async function POST(req: Request) {
  try {
    const supabase = getAuthedSupabase(req)
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body     = await req.json().catch(() => ({}))
    const priceId  = body.priceId ?? process.env.STRIPE_PRICE_PRO_MONTHLY!
    const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL!

    if (!priceId) {
      return NextResponse.json({ error: 'No price ID configured' }, { status: 400 })
    }

    // Reuse existing Stripe customer if available
    const { data: existingCustomer } = await supabaseAdmin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/account/billing?checkout=cancelled`,
      client_reference_id: user.id,
      customer:       existingCustomer?.stripe_customer_id ?? undefined,
      customer_email: existingCustomer?.stripe_customer_id ? undefined : (user.email ?? undefined),
      subscription_data: {
        metadata: { user_id: user.id },
      },
      metadata:              { user_id: user.id },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[billing/checkout]', error)
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 })
  }
}
