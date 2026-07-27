/**
 * stripe.ts — Stripe server-side client (lazy-initialized)
 *
 * SERVER-SIDE ONLY. Never import in client components.
 *
 * Lazy initialization prevents build-time failures when STRIPE_SECRET_KEY
 * is not yet set in the environment (Vercel build phase).
 * The client is created on first use, not at module load time.
 */

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
  }
  return _stripe
}

// Named export for backwards compatibility with existing route imports
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripeClient()[prop as keyof Stripe]
  },
})
