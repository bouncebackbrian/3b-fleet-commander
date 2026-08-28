import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const dynamic = 'force-dynamic'

type Business = { id: string; three_b_biz_id: string; company_name: string; business_type: string; has_fleet: boolean; created_at: string }
type Member = { business_id: string; user_id: string; role: string; active: boolean }
type Equipment = { business_id: string; equipment_type: string; status: string }

const areas = [
  { label: 'Sales', href: '/founder/sales', detail: 'Leads, trials, conversions, pipeline and revenue readiness.', icon: '↗' },
  { label: 'Members', href: '/founder/members', detail: 'People, 3B identities, access, activity and support context.', icon: '◎' },
  { label: 'Businesses', href: '/founder/accounts', detail: 'Company accounts, Fleet activation, teams and asset footprint.', icon: '▦' },
  { label: 'Fleet Operations', href: '/founder/accounts', detail: 'Cross-account operational health without becoming customer Admin.', icon: '◈' },
  { label: 'Marketing', href: '/founder/marketing', detail: 'Campaigns, channels, acquisition, content and conversion signals.', icon: '✦' },
  { label: 'Product / Build', href: '/founder/product', detail: 'Deployments, product areas, known gaps and release readiness.', icon: '⌘' },
  { label: 'Problems & Decisions', href: '/founder/problems', detail: 'Capture, diagnose, decide, assign, verify and close system problems.', icon: '!' },
] as const

export default async function FounderPortalPage() {
  const founder = await requireFounder()

  const [{ data: businessesData }, { data: membersData }, { data: equipmentData }] = await Promise.all([
    fleetServiceClient.from('businesses').select('id,three_b_biz_id,company_name,business_type,has_fleet,created_at').order('created_at', { ascending: false }),
    fleetServiceClient.from('fleet_business_members').select('business_id,user_id,role,active'),
    fleetServiceClient.from('fleet_equipment').select('business_id,equipment_type,status'),
  ])

  const businesses = (businessesData ?? []) as Business[]
  const members = (membersData ?? []) as Member[]
  const equipment = (equipmentData ?? []) as Equipment[]
  const fleetAccounts = businesses.filter(b => b.has_fleet)
  const activeMembers = members.filter(m => m.active)
  const powered = equipment.filter(e => !e.equipment_type.startsWith('trailer_'))
  const activePowered = powered.filter(e => e.status === 'active')

  const metrics = [
    { label: 'Businesses', value: businesses.length, detail: `${fleetAccounts.length} Fleet enabled` },
    { label: 'Active Members', value: activeMembers.length, detail: 'Across all Fleet accounts' },
    { label: 'Powered Units', value: powered.length, detail: `${activePowered.length} active` },
    { label: 'System Problems', value: '—', detail: 'Problem ledger connection next' },
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">3B Founder Portal</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">System Command Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Oversee Fleet Commander as a business and product: customers, members, sales, marketing, operations, product health and unresolved problems. Founder access stays separate from customer-company permissions.</p>
          </div>
          <div className="text-right text-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Founder identity</div>
            <div className="mt-1 font-bold text-slate-300">{founder.threeBId ?? founder.email ?? 'Authorized Founder'}</div>
          </div>
        </header>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 my-6 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(metric => <div key={metric.label} className="bg-slate-950 px-5 py-4">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-600">{metric.label}</div>
            <div className="mt-2 text-3xl font-black">{metric.value}</div>
            <div className="mt-1 text-xs text-slate-500">{metric.detail}</div>
          </div>)}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div><h2 className="text-lg font-black">Run the system</h2><p className="mt-1 text-sm text-slate-500">Choose the business function you need to inspect or improve.</p></div>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {areas.map(area => <Link key={area.label} href={area.href} className="grid gap-2 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[42px_180px_1fr_auto] sm:items-center sm:px-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 font-black text-amber-300">{area.icon}</div>
              <div className="font-black">{area.label}</div>
              <div className="text-sm text-slate-500">{area.detail}</div>
              <div className="text-slate-600">→</div>
            </Link>)}
          </div>
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600">Recent businesses</div>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {businesses.slice(0, 6).map(business => <Link key={business.id} href={`/founder/accounts/${business.id}`} className="grid grid-cols-[1fr_auto] gap-4 py-3 hover:bg-white/[0.025] sm:px-2">
                <div><div className="font-bold">{business.company_name}</div><div className="mt-1 text-xs text-slate-600">{business.three_b_biz_id} · {business.business_type.replaceAll('_', ' ')}</div></div>
                <div className={business.has_fleet ? 'text-xs font-black text-emerald-400' : 'text-xs font-black text-slate-600'}>{business.has_fleet ? 'FLEET ON' : 'FLEET OFF'}</div>
              </Link>)}
              {businesses.length === 0 && <div className="py-6 text-sm text-slate-500">No businesses found.</div>}
            </div>
          </div>

          <div>
            <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600">Founder operating loop</div>
            <div className="border-y border-white/10 py-4 text-sm leading-7 text-slate-400">
              <strong className="text-white">Measure</strong> what is happening → <strong className="text-white">Diagnose</strong> the constraint → <strong className="text-white">Decide</strong> the response → <strong className="text-white">Assign</strong> ownership → <strong className="text-white">Verify</strong> the result → <strong className="text-white">Close</strong> or standardize the fix.
            </div>
            <Link href="/founder/problems" className="mt-4 inline-flex rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950">Open Problem Solver →</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
