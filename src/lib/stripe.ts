/**
 * stripe.ts — Stripe server-side client
 *
 * SERVER-SIDE ONLY. Never import in client components.
 * API version pinned — update intentionally when Stripe releases breaking changes.
 */

import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia',
})
