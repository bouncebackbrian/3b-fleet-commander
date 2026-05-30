/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session for the current customer.
 * Returns a redirect URL — customer manages subscription directly in Stripe.
 *
 * Headers: Authorization: Bearer <supabase_access_token>
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

    const { data: billingCustomer } = await supabaseAdmin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!billingCustomer?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing profile found' }, { status: 404 })
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer:   billingCustomer.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL!}/account/billing`,
    })

    return NextResponse.json({ url: portal.url })
  } catch (error) {
    console.error('[billing/portal]', error)
    return NextResponse.json({ error: 'Unable to create portal session' }, { status: 500 })
  }
}
