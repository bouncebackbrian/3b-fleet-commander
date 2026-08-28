import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { ensureDevelopmentBusinessAccess } from '@/lib/dev-business-bootstrap'
import { getFounderIdentity } from '@/lib/founder-auth'

export const dynamic = 'force-dynamic'

type Grant = { portal: string; permission_level: 'view' | 'manage' }

type Business = {
  id: string
  three_b_biz_id: string
  company_name: string
  business_type: string
  city: string | null
  state: string | null
}

const VIEW_META = {
  driver: {
    eyebrow: 'Driver',
    title: 'Driver View',
    description: 'Run the assigned asset workflow, time, mileage, tickets, fuel and field evidence.',
    href: '/driver/dump-truck',
    icon: '🚛',
  },
  dispatch: {
    eyebrow: 'Operations',
    title: 'Dispatch View',
    description: 'Coordinate jobs, assignments, live exceptions, assets, team and operational reporting.',
    href: '/admin/dump-truck/dispatch',
    icon: '📡',
  },
  admin: {
    eyebrow: 'Business',
    title: 'Admin View',
    description: 'Manage the company Fleet account, assets, team, compliance, expenses, KPIs and reports.',
    href: '/admin/dump-truck',
    icon: '⚙️',
  },
} as const

export default async function FleetBusinessHome() {
  await ensureDevelopmentBusinessAccess()

  const auth = await createAuthServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  // Founder is a platform role, not a customer-business role. Resolve it
  // before requiring any Fleet membership so founder access can never loop
  // through onboarding just because a default company is missing/stale.
  const founder = await getFounderIdentity()

  const { data: profile } = await fleetServiceClient
    .from('profiles')
    .select('three_b_id, default_business_id')
    .eq('id', user.id)
    .maybeSingle()

  const { data: memberships } = await fleetServiceClient
    .from('fleet_business_members')
    .select('business_id, role, active')
    .eq('user_id', user.id)
    .eq('active', true)

  const preferredBusinessId = profile?.default_business_id ?? memberships?.[0]?.business_id

  if (!preferredBusinessId) {
    if (founder) redirect('/founder')
    redirect('/start')
  }

  const [{ data: businessData }, { data: grantsData }] = await Promise.all([
    fleetServiceClient
      .from('businesses')
      .select('id, three_b_biz_id, company_name, business_type, city, state')
      .eq('id', preferredBusinessId)
      .maybeSingle(),
    fleetServiceClient
      .from('fleet_member_portal_grants')
      .select('portal, permission_level')
      .eq('business_id', preferredBusinessId)
      .eq('user_id', user.id),
  ])

  if (!businessData) {
    if (founder) redirect('/founder')
    redirect('/start')
  }

  const business = businessData as Business
  const grants = (grantsData ?? []) as Grant[]
  const grantMap = new Map(grants.map(grant => [grant.portal, grant.permission_level]))
  const availableViews = (['driver', 'dispatch', 'admin'] as const).filter(portal => grantMap.has(portal))

  return (
    <main className="min-h-screen bg-[#061210] text-[#cceee6]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="border-b border-[#16352d] pb-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#00e8b0]">Fleet Commander</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{business.company_name}</h1>
              <p className="mt-2 text-sm text-[#6aaa96]">
                {business.three_b_biz_id} · {[business.city, business.state].filter(Boolean).join(', ') || business.business_type.replaceAll('_', ' ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {founder && <Link href="/founder" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-bold text-amber-300 hover:bg-amber-400/15">Founder Portal</Link>}
              <Link href="/account" className="rounded-xl border border-[#21483e] bg-[#0b1b18] px-4 py-2.5 text-sm font-bold text-[#cceee6] hover:bg-[#0f2220]">Account Settings</Link>
            </div>
          </div>
        </header>

        <section className="py-7">
          <div className="mb-4">
            <h2 className="text-lg font-bold">Your views</h2>
            <p className="mt-1 text-sm text-[#6aaa96]">Your Fleet Commander tools are connected directly to this Cal-Neva account.</p>
          </div>

          {availableViews.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-[#cceee6]">
              Your 3B ID is attached to this business, but no Fleet Commander portal permissions have been granted yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {availableViews.map(portal => {
                const meta = VIEW_META[portal]
                const level = grantMap.get(portal)
                return (
                  <Link key={portal} href={meta.href} className="group rounded-2xl border border-[#16352d] bg-[#0b1b18] p-6 transition hover:-translate-y-0.5 hover:border-[#00e8b0]/50 hover:bg-[#0f2220]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-3xl">{meta.icon}</div>
                      <span className="rounded-full bg-[#00e8b0]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#00e8b0]">{level}</span>
                    </div>
                    <div className="mt-5 text-xs font-bold uppercase tracking-wider text-[#6aaa96]">{meta.eyebrow}</div>
                    <h3 className="mt-1 text-xl font-black">{meta.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#8ac9b8]">{meta.description}</p>
                    <div className="mt-5 text-sm font-bold text-[#00e8b0]">Open {meta.title} →</div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#16352d] bg-[#0b1b18] p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-[#6aaa96]">Signed-in 3B identity</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-bold">{profile?.three_b_id ?? '3B ID pending'}</span>
            <span className="text-[#6aaa96]">{user.email}</span>
          </div>
        </section>
      </div>
    </main>
  )
}
