import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireFounder } from '@/lib/founder-auth'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const dynamic = 'force-dynamic'

type Business = {
  id: string
  three_b_biz_id: string
  company_name: string
  business_type: string
  entity_type: string | null
  has_fleet: boolean
  dot_number: string | null
  mc_number: string | null
  state: string | null
  city: string | null
  business_phone: string | null
  domain_email: string | null
  website: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
}

type Profile = {
  id: string
  three_b_id: string
  first_name: string | null
  last_name: string | null
  email: string
  verification_status: string
}

type Member = {
  user_id: string
  role: string
  active: boolean
  created_at: string
}

type Equipment = {
  id: string
  unit_number: string
  equipment_type: string
  make: string | null
  model: string | null
  year: number | null
  status: string
  current_odometer: number | null
}

function personName(profile: Profile | undefined) {
  if (!profile) return 'Unknown 3B user'
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  return name || profile.email
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function FounderAccountPage({ params }: { params: Promise<{ businessId: string }> }) {
  await requireFounder()
  const { businessId } = await params

  const { data: businessData } = await fleetServiceClient
    .from('businesses')
    .select('id, three_b_biz_id, company_name, business_type, entity_type, has_fleet, dot_number, mc_number, state, city, business_phone, domain_email, website, owner_id, created_at, updated_at')
    .eq('id', businessId)
    .maybeSingle()

  if (!businessData) notFound()
  const business = businessData as Business

  const [{ data: membersData }, { data: equipmentData }] = await Promise.all([
    fleetServiceClient
      .from('fleet_business_members')
      .select('user_id, role, active, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: true }),
    fleetServiceClient
      .from('fleet_equipment')
      .select('id, unit_number, equipment_type, make, model, year, status, current_odometer')
      .eq('business_id', business.id)
      .order('unit_number', { ascending: true }),
  ])

  const members = (membersData ?? []) as Member[]
  const equipment = (equipmentData ?? []) as Equipment[]
  const userIds = Array.from(new Set([business.owner_id, ...members.map(member => member.user_id)].filter(Boolean))) as string[]

  let profiles: Profile[] = []
  if (userIds.length) {
    const { data } = await fleetServiceClient
      .from('profiles')
      .select('id, three_b_id, first_name, last_name, email, verification_status')
      .in('id', userIds)
    profiles = (data ?? []) as Profile[]
  }

  const profileById = new Map(profiles.map(profile => [profile.id, profile]))
  const owner = business.owner_id ? profileById.get(business.owner_id) : undefined
  const activeMembers = members.filter(member => member.active)
  const poweredUnits = equipment.filter(item => !item.equipment_type.startsWith('trailer_'))
  const trailers = equipment.filter(item => item.equipment_type.startsWith('trailer_'))

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/founder" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">← Founder Control Center</Link>

        <header className="mt-5 flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">{business.three_b_biz_id}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${business.has_fleet ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                {business.has_fleet ? 'Fleet Commander enabled' : 'Fleet Commander disabled'}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{business.company_name}</h1>
            <p className="mt-2 text-sm capitalize text-slate-400">{business.business_type.replaceAll('_', ' ')}{business.entity_type ? ` · ${business.entity_type}` : ''}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-2xl font-black">{activeMembers.length}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Members</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-2xl font-black">{poweredUnits.length}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Powered</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-2xl font-black">{trailers.length}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Trailers</div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 py-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-2">
            <h2 className="text-lg font-bold">Account profile</h2>
            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Info label="Owner" value={owner ? personName(owner) : 'Not assigned'} />
              <Info label="Owner 3B ID" value={owner?.three_b_id ?? '—'} />
              <Info label="DOT number" value={business.dot_number ?? '—'} />
              <Info label="MC number" value={business.mc_number ?? '—'} />
              <Info label="Location" value={[business.city, business.state].filter(Boolean).join(', ') || '—'} />
              <Info label="Business email" value={business.domain_email ?? '—'} />
              <Info label="Phone" value={business.business_phone ?? '—'} />
              <Info label="Website" value={business.website ?? '—'} />
              <Info label="Created" value={formatDate(business.created_at)} />
              <Info label="Last updated" value={formatDate(business.updated_at)} />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="text-sm font-bold text-amber-300">Founder account controls</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              This view is intentionally separated from customer portal grants. The next control layer can manage commercial subscription status, truck seats and operation-mode entitlements here without impersonating a customer user.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400">
              Current Fleet registry flag: <span className="font-bold text-white">{business.has_fleet ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="font-bold">Team & access</h2>
              <p className="mt-1 text-xs text-slate-500">Operational membership. Portal grants remain the authorization source inside the customer account.</p>
            </div>
            {members.length === 0 ? (
              <div className="px-5 py-10 text-sm text-slate-500">No Fleet members.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {members.map(member => {
                  const profile = profileById.get(member.user_id)
                  return (
                    <div key={`${member.user_id}-${member.role}`} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{personName(profile)}</div>
                        <div className="mt-1 text-xs text-slate-500">{profile?.three_b_id ?? member.user_id} · <span className="capitalize">{member.role.replaceAll('_', ' ')}</span></div>
                      </div>
                      <div className="text-right">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${member.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                          {member.active ? 'Active' : 'Inactive'}
                        </span>
                        {profile?.verification_status && <div className="mt-2 text-[11px] capitalize text-slate-600">{profile.verification_status}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="font-bold">Equipment</h2>
              <p className="mt-1 text-xs text-slate-500">Registered trucks, powered equipment and trailers.</p>
            </div>
            {equipment.length === 0 ? (
              <div className="px-5 py-10 text-sm text-slate-500">No equipment registered.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {equipment.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <div className="font-semibold">Unit {item.unit_number}</div>
                      <div className="mt-1 text-xs capitalize text-slate-500">
                        {item.equipment_type.replaceAll('_', ' ')}
                        {[item.year, item.make, item.model].filter(Boolean).length ? ` · ${[item.year, item.make, item.model].filter(Boolean).join(' ')}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold capitalize text-slate-300">{item.status.replaceAll('_', ' ')}</div>
                      {item.current_odometer != null && <div className="mt-1 text-[11px] text-slate-600">{item.current_odometer.toLocaleString()} mi</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-slate-200">{value}</div>
    </div>
  )
}
