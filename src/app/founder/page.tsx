import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const dynamic = 'force-dynamic'

type Business = {
  id: string
  three_b_biz_id: string
  company_name: string
  business_type: string
  has_fleet: boolean
  state: string | null
  owner_id: string | null
  created_at: string
}

type Member = {
  business_id: string
  user_id: string
  role: string
  active: boolean
}

type Equipment = {
  business_id: string
  equipment_type: string
  status: string
}

function startOfMonthIso() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function FounderPortalPage() {
  const founder = await requireFounder()

  const [{ data: businessesData }, { data: membersData }, { data: equipmentData }] = await Promise.all([
    fleetServiceClient
      .from('businesses')
      .select('id, three_b_biz_id, company_name, business_type, has_fleet, state, owner_id, created_at')
      .order('created_at', { ascending: false }),
    fleetServiceClient
      .from('fleet_business_members')
      .select('business_id, user_id, role, active'),
    fleetServiceClient
      .from('fleet_equipment')
      .select('business_id, equipment_type, status'),
  ])

  const businesses = (businessesData ?? []) as Business[]
  const members = (membersData ?? []) as Member[]
  const equipment = (equipmentData ?? []) as Equipment[]

  const fleetAccounts = businesses.filter(business => business.has_fleet)
  const ownerOps = businesses.filter(business => business.business_type === 'owner_op')
  const activeMembers = members.filter(member => member.active)
  const drivers = activeMembers.filter(member => member.role === 'driver')
  const poweredEquipment = equipment.filter(item => !item.equipment_type.startsWith('trailer_'))
  const activePoweredEquipment = poweredEquipment.filter(item => item.status === 'active')
  const monthStart = startOfMonthIso()
  const newThisMonth = businesses.filter(business => business.created_at >= monthStart)

  const memberCountByBusiness = new Map<string, number>()
  const driverCountByBusiness = new Map<string, number>()
  const equipmentCountByBusiness = new Map<string, number>()

  for (const member of activeMembers) {
    memberCountByBusiness.set(member.business_id, (memberCountByBusiness.get(member.business_id) ?? 0) + 1)
    if (member.role === 'driver') {
      driverCountByBusiness.set(member.business_id, (driverCountByBusiness.get(member.business_id) ?? 0) + 1)
    }
  }

  for (const item of poweredEquipment) {
    equipmentCountByBusiness.set(item.business_id, (equipmentCountByBusiness.get(item.business_id) ?? 0) + 1)
  }

  const metrics = [
    { label: '3B business accounts', value: businesses.length, detail: `${newThisMonth.length} added this month` },
    { label: 'Fleet-enabled accounts', value: fleetAccounts.length, detail: `${pct(fleetAccounts.length, businesses.length)} of business registry` },
    { label: 'Owner-operators', value: ownerOps.length, detail: 'Same commercial model as fleets' },
    { label: 'Active drivers', value: drivers.length, detail: `${activeMembers.length} active Fleet members` },
    { label: 'Active powered units', value: activePoweredEquipment.length, detail: `${poweredEquipment.length} powered units registered` },
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">3B Founder Access</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Fleet Commander Control Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Platform-wide account visibility, fleet adoption and operating footprint. Customer company permissions stay separate from Founder access.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wider text-slate-500">Signed in as Founder</div>
            <div className="mt-1 text-sm font-semibold">{founder.threeBId ?? founder.email ?? 'Authorized 3B ID'}</div>
          </div>
        </div>

        <section className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map(metric => (
            <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{metric.label}</div>
              <div className="mt-2 text-3xl font-black">{metric.value}</div>
              <div className="mt-2 text-xs text-slate-400">{metric.detail}</div>
            </div>
          ))}
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 lg:col-span-2">
            <div className="text-sm font-bold text-emerald-300">Commercial model checkpoint</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Company and owner-operator accounts are being structured around Dispatch + active trucks, with each truck assigned an operation mode. Revenue analytics will connect here once the subscription/entitlement records are finalized; this portal does not invent MRR from incomplete billing data.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fleet adoption</div>
            <div className="mt-2 text-3xl font-black">{pct(fleetAccounts.length, businesses.length)}</div>
            <div className="mt-2 text-sm text-slate-400">Businesses currently marked for Fleet Commander.</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">Accounts</h2>
              <p className="mt-1 text-xs text-slate-500">Newest businesses first. Open an account for its team and equipment view.</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-300">{businesses.length} total</span>
          </div>

          {businesses.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">No 3B business accounts found.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {businesses.map(business => (
                <Link
                  key={business.id}
                  href={`/founder/accounts/${business.id}`}
                  className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.04] md:grid-cols-[minmax(0,2fr)_1fr_0.8fr_0.8fr_0.8fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-bold">{business.company_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{business.three_b_biz_id} · {formatDate(business.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-600">Type</div>
                    <div className="mt-1 text-sm capitalize text-slate-300">{business.business_type.replaceAll('_', ' ')}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-600">Members</div>
                    <div className="mt-1 text-sm font-semibold">{memberCountByBusiness.get(business.id) ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-600">Drivers</div>
                    <div className="mt-1 text-sm font-semibold">{driverCountByBusiness.get(business.id) ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-600">Trucks</div>
                    <div className="mt-1 text-sm font-semibold">{equipmentCountByBusiness.get(business.id) ?? 0}</div>
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${business.has_fleet ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {business.has_fleet ? 'Fleet On' : 'Fleet Off'}
                    </span>
                    <span className="text-slate-600">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
