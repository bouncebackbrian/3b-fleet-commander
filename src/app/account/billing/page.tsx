'use client'
/**
 * /account/billing — Fleet Commander Billing Page
 *
 * Shows current subscription status and lets the user:
 *   - Upgrade (Stripe Checkout)
 *   - Manage (Stripe Customer Portal)
 *
 * Access is gated off Supabase subscription state (webhook-synced),
 * never off the Stripe success redirect alone.
 *
 * Active statuses: trialing, active
 * Grace period:    past_due (show warning, keep access)
 * Block:           canceled, unpaid, incomplete_expired
 */

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { createClient } from '@/lib/supabase-browser'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subscription {
  status:              string
  stripe_price_id:     string | null
  current_period_end:  string | null
  cancel_at_period_end: boolean
  trial_end:           string | null
}

type BillingState = 'loading' | 'no_subscription' | 'active' | 'trialing' | 'past_due' | 'cancelled'

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusMeta(state: BillingState): { label: string; color: string; bg: string; border: string; emoji: string } {
  switch (state) {
    case 'active':    return { label: 'Active',    color: 'var(--primary)', bg: 'rgba(0,232,176,.08)',  border: 'rgba(0,232,176,.25)',  emoji: '✅' }
    case 'trialing':  return { label: 'Trial',     color: '#38bdf8',        bg: 'rgba(56,189,248,.08)', border: 'rgba(56,189,248,.25)', emoji: '🎯' }
    case 'past_due':  return { label: 'Past Due',  color: 'var(--warn)',    bg: 'rgba(245,194,0,.08)',  border: 'rgba(245,194,0,.25)',  emoji: '⚠️' }
    case 'cancelled': return { label: 'Cancelled', color: 'var(--error)',   bg: 'rgba(232,64,0,.08)',   border: 'rgba(232,64,0,.25)',   emoji: '❌' }
    default:          return { label: 'No Plan',   color: 'var(--muted)',   bg: 'var(--surface-2)',     border: 'var(--border)',        emoji: '⚪' }
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Plan card ─────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id:          'owner_op',
    label:       'Owner-Operator',
    price:       '$79',
    period:      'month',
    description: 'All modules, 1 driver seat. Built for single-seat operations.',
    features:    ['Dispatch AI', 'DriverOps Cockpit', 'HOS Planning', 'Maintenance', 'Broker Module', 'Reports'],
    highlight:   false,
  },
  {
    id:          'pro',
    label:       'Pro Fleet',
    price:       '$149',
    period:      'month',
    description: 'Full fleet stack. Unlimited drivers, all AI engines.',
    features:    ['Everything in Owner-Op', 'Multi-driver (unlimited)', 'Escalation Engine', 'Ops Event Log', 'Role-Based Views', 'Priority support'],
    highlight:   true,
  },
  {
    id:          'enterprise',
    label:       'Enterprise',
    price:       'Contact us',
    period:      '',
    description: 'Custom load board integrations, dedicated CSM, SLA guarantees.',
    features:    ['Everything in Pro', 'Teams/SMS/email notifications', 'Customer packs & SOPs', 'Custom integrations', 'Dedicated CSM'],
    highlight:   false,
  },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const searchParams   = useSearchParams()
  const checkoutResult = searchParams.get('checkout')

  const [billingState, setBillingState] = useState<BillingState>('loading')
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // ── Load subscription state ───────────────────────────────────────────────

  const loadSubscription = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setBillingState('no_subscription'); return }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, stripe_price_id, current_period_end, cancel_at_period_end, trial_end')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!sub) { setBillingState('no_subscription'); return }

      setSubscription(sub as Subscription)
      const s = sub.status
      if (s === 'active')           setBillingState('active')
      else if (s === 'trialing')    setBillingState('trialing')
      else if (s === 'past_due')    setBillingState('past_due')
      else if (s === 'canceled' || s === 'cancelled') setBillingState('cancelled')
      else                          setBillingState('no_subscription')
    } catch {
      setBillingState('no_subscription')
    }
  }, [])

  useEffect(() => { loadSubscription() }, [loadSubscription])

  // ── Checkout ──────────────────────────────────────────────────────────────

  async function handleCheckout(priceId?: string) {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const res  = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(priceId ? { priceId } : {}),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Checkout failed'); return }
      window.location.href = data.url
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  // ── Billing portal ────────────────────────────────────────────────────────

  async function handlePortal() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const res  = await fetch('/api/billing/portal', {
        method:  'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Portal failed'); return }
      window.location.href = data.url
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  const meta    = statusMeta(billingState)
  const hasAccess = billingState === 'active' || billingState === 'trialing' || billingState === 'past_due'

  return (
    <>
      <TopBar title="Billing" module="ops" subtitle="Subscriptions · plans · invoices" />

      <div style={{ padding: '1rem 1.2rem', display: 'grid', gap: '.85rem', maxWidth: 640 }}>

        {/* Checkout result banner */}
        {checkoutResult === 'success' && (
          <div style={{ padding: '.65rem 1rem', borderRadius: 10, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.25)', fontSize: '.7rem', fontWeight: 800, color: 'var(--primary)' }}>
            🎉 Subscription activated! Welcome to Fleet Commander Pro.
          </div>
        )}
        {checkoutResult === 'cancelled' && (
          <div style={{ padding: '.65rem 1rem', borderRadius: 10, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.25)', fontSize: '.7rem', color: 'var(--warn)' }}>
            Checkout cancelled — no charge was made. Start again whenever you&apos;re ready.
          </div>
        )}

        {/* Current subscription status */}
        <div style={{ padding: '.85rem 1rem', borderRadius: 14, background: meta.bg, border: `1px solid ${meta.border}`, display: 'grid', gap: '.55rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '.57rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>
                Current Plan
              </div>
              {billingState === 'loading' ? (
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Loading…</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: '.9rem' }}>{meta.emoji}</span>
                  <span style={{ fontSize: '.82rem', fontWeight: 900, color: meta.color }}>{meta.label}</span>
                </div>
              )}
            </div>
            {hasAccess && (
              <button
                onClick={handlePortal}
                disabled={loading}
                style={{
                  fontSize: '.65rem', fontWeight: 800, padding: '.4rem .85rem', borderRadius: 8,
                  border: `1px solid ${meta.border}`, background: 'var(--surface)',
                  color: meta.color, cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Loading…' : '⚙️ Manage Billing'}
              </button>
            )}
          </div>

          {subscription && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
              {subscription.current_period_end && (
                <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>
                  {subscription.cancel_at_period_end ? '⚠️ Cancels' : '🔄 Renews'}{' '}
                  <span style={{ fontWeight: 700, color: 'var(--fg)' }}>
                    {formatDate(subscription.current_period_end)}
                  </span>
                </div>
              )}
              {subscription.trial_end && billingState === 'trialing' && (
                <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>
                  Trial ends{' '}
                  <span style={{ fontWeight: 700, color: 'var(--fg)' }}>
                    {formatDate(subscription.trial_end)}
                  </span>
                </div>
              )}
            </div>
          )}

          {billingState === 'past_due' && (
            <div style={{ fontSize: '.62rem', color: 'var(--warn)', fontWeight: 700 }}>
              Payment failed — update your payment method to avoid interruption.
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '.55rem .8rem', borderRadius: 9, background: 'rgba(232,64,0,.07)', border: '1px solid rgba(232,64,0,.2)', fontSize: '.65rem', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        {/* Plans */}
        {!hasAccess && billingState !== 'loading' && (
          <>
            <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Choose a plan
            </div>

            <div style={{ display: 'grid', gap: '.6rem' }}>
              {PLANS.map(plan => (
                <div key={plan.id} style={{
                  padding: '.85rem 1rem', borderRadius: 12,
                  background: plan.highlight ? 'rgba(0,232,176,.05)' : 'var(--surface)',
                  border: `1px solid ${plan.highlight ? 'rgba(0,232,176,.3)' : 'var(--border)'}`,
                  display: 'grid', gap: '.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '.78rem', fontWeight: 900, color: plan.highlight ? 'var(--primary)' : 'var(--fg)' }}>
                          {plan.label}
                        </span>
                        {plan.highlight && (
                          <span style={{ fontSize: '.5rem', fontWeight: 800, padding: '.1rem .4rem', borderRadius: 5, background: 'rgba(0,232,176,.12)', color: 'var(--primary)', border: '1px solid rgba(0,232,176,.3)' }}>
                            POPULAR
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>{plan.description}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '.9rem', fontWeight: 900, color: plan.highlight ? 'var(--primary)' : 'var(--fg)' }}>
                        {plan.price}
                      </div>
                      {plan.period && <div style={{ fontSize: '.55rem', color: 'var(--muted)' }}>/{plan.period}</div>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                    {plan.features.map(f => (
                      <span key={f} style={{ fontSize: '.57rem', padding: '.15rem .45rem', borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                        {f}
                      </span>
                    ))}
                  </div>

                  {plan.id !== 'enterprise' && (
                    <button
                      onClick={() => handleCheckout()}
                      disabled={loading}
                      style={{
                        marginTop: 4, padding: '.45rem', borderRadius: 8, fontSize: '.68rem', fontWeight: 800,
                        background: plan.highlight ? 'var(--primary)' : 'var(--surface-2)',
                        color:      plan.highlight ? 'var(--surface)' : 'var(--fg)',
                        border: `1px solid ${plan.highlight ? 'transparent' : 'var(--border)'}`,
                        cursor: loading ? 'wait' : 'pointer',
                      }}
                    >
                      {loading ? 'Loading…' : `Get ${plan.label} →`}
                    </button>
                  )}
                  {plan.id === 'enterprise' && (
                    <a
                      href="mailto:3becosystem@gmail.com?subject=Fleet Commander Enterprise"
                      style={{ display: 'block', marginTop: 4, padding: '.45rem', borderRadius: 8, fontSize: '.68rem', fontWeight: 800, background: 'var(--surface-2)', color: 'var(--fg)', border: '1px solid var(--border)', textAlign: 'center', textDecoration: 'none' }}
                    >
                      Contact Sales →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Active subscriber — feature access summary */}
        {hasAccess && (
          <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', gap: '.45rem' }}>
            <div style={{ fontSize: '.57rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Your Access
            </div>
            {[
              '🛰 DispatchOps AI — load health, stall detection, recovery windows',
              '🚛 DriverOps Cockpit — mode tracking, detention clock, break timers',
              '⏱ HOS Planning — legal ETA simulation, rest stop modeling',
              '⚡ Escalation Engine — L0–L3 auto-escalation, stall prevention',
              '🗂 Ops Event Log — black box recorder, Supabase persistent',
              '📦 Load Board Search — DAT, Truckstop, 5 boards integrated',
            ].map(f => (
              <div key={f} style={{ fontSize: '.63rem', color: 'var(--fg)' }}>{f}</div>
            ))}
            <button
              onClick={handlePortal}
              disabled={loading}
              style={{ marginTop: 4, padding: '.4rem .8rem', borderRadius: 8, fontSize: '.65rem', fontWeight: 800, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: loading ? 'wait' : 'pointer', alignSelf: 'start' }}
            >
              {loading ? 'Loading…' : 'View invoices / cancel →'}
            </button>
          </div>
        )}

        {/* Gate note */}
        <div style={{ fontSize: '.57rem', color: 'var(--muted)', textAlign: 'center' }}>
          Subscription state is synced in real-time via Stripe webhooks.
          Changes take effect immediately after payment is confirmed.
        </div>
      </div>
    </>
  )
}
