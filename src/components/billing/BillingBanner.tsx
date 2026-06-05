'use client'
/**
 * BillingBanner — Fleet Commander
 *
 * Renders a sticky banner when the user's 3Boost billing state requires
 * attention. Receives pre-resolved billing data from the server so the
 * client never touches auth-3boost directly.
 *
 * States handled:
 *   past_due        — amber warning, update billing CTA
 *   inactive        — blue info, reactivate CTA
 *   refunded        — red, contact support
 *   chargeback_hold — red, account on hold
 */

import { AlertTriangle, CreditCard, RefreshCw, ShieldAlert } from 'lucide-react'

export type BillingBannerState =
  | 'past_due'
  | 'inactive'
  | 'refunded'
  | 'chargeback_hold'

type Props = {
  billingState: BillingBannerState
  planTier: string | null
  trialEndsAt: string | null
}

type Config = {
  icon: React.ReactNode
  message: string
  ctaLabel: string
  ctaHref: string
  bg: string
  border: string
  color: string
}

function getConfig(props: Props): Config {
  const base = process.env.NEXT_PUBLIC_CREDIT_URL ?? 'https://credit.bouncebackbrian.com'

  switch (props.billingState) {
    case 'past_due':
      return {
        icon: <CreditCard size={14} />,
        message: 'Your payment failed — update your billing info to keep Fleet Commander access.',
        ctaLabel: 'Update Billing',
        ctaHref: `${base}/dashboard/plans`,
        bg: 'rgba(245,158,11,.08)',
        border: '1px solid rgba(245,158,11,.3)',
        color: '#f59e0b',
      }
    case 'inactive':
      return {
        icon: <RefreshCw size={14} />,
        message: 'Your 3Boost subscription is inactive. Reactivate to restore full access.',
        ctaLabel: 'Reactivate',
        ctaHref: `${base}/pricing`,
        bg: 'rgba(99,102,241,.08)',
        border: '1px solid rgba(99,102,241,.3)',
        color: '#818cf8',
      }
    case 'refunded':
      return {
        icon: <AlertTriangle size={14} />,
        message: 'Your payment was refunded. Contact support to restore access.',
        ctaLabel: 'Contact Support',
        ctaHref: 'mailto:admin@bouncebackbrian.com',
        bg: 'rgba(239,68,68,.08)',
        border: '1px solid rgba(239,68,68,.3)',
        color: '#f87171',
      }
    case 'chargeback_hold':
      return {
        icon: <ShieldAlert size={14} />,
        message: 'Your account is on hold due to a dispute. Contact support.',
        ctaLabel: 'Contact Support',
        ctaHref: 'mailto:admin@bouncebackbrian.com',
        bg: 'rgba(239,68,68,.08)',
        border: '1px solid rgba(239,68,68,.3)',
        color: '#f87171',
      }
  }
}

export default function BillingBanner({ billingState, planTier, trialEndsAt }: Props) {
  const config = getConfig({ billingState, planTier, trialEndsAt })

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.55rem 1rem',
        background: config.bg,
        borderBottom: config.border,
        color: config.color,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {config.icon}
        {config.message}
      </span>
      <a
        href={config.ctaHref}
        target={config.ctaHref.startsWith('mailto') ? undefined : '_blank'}
        rel="noreferrer"
        style={{
          padding: '0.3rem 0.75rem',
          borderRadius: 7,
          background: config.color,
          color: '#000',
          fontSize: '0.7rem',
          fontWeight: 700,
          textDecoration: 'none',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {config.ctaLabel}
      </a>
    </div>
  )
}
