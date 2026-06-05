import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import BillingBanner, { type BillingBannerState } from '@/components/billing/BillingBanner'
import { getFleetBillingStatus } from '@/lib/threeb-session'

// Billing states that require a banner but still allow access
const BANNER_STATES: BillingBannerState[] = [
  'past_due',
  'inactive',
  'refunded',
  'chargeback_hold',
]

// Billing states that hard-block dashboard access and redirect to upgrade
const BLOCK_STATES = ['refunded', 'chargeback_hold']

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const billing = await getFleetBillingStatus()

  // If auth-3boost is unreachable or user has no session, let middleware handle it.
  // We only enforce here when we have a confirmed billing state.
  if (billing) {
    if (BLOCK_STATES.includes(billing.billingState)) {
      redirect('https://credit.bouncebackbrian.com/dashboard/plans')
    }
  }

  const showBanner =
    billing !== null &&
    (BANNER_STATES as string[]).includes(billing.billingState)

  return (
    <AppShell>
      {showBanner && (
        <BillingBanner
          billingState={billing!.billingState as BillingBannerState}
          planTier={billing!.planTier}
          trialEndsAt={billing!.trialEndsAt}
        />
      )}
      {children}
    </AppShell>
  )
}
