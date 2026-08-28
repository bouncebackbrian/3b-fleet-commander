import Link from 'next/link'
import { redirect } from 'next/navigation'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'
import { listDumpTruckEquipment } from '@/lib/fleet/dumpTruck/equipment'

export const dynamic = 'force-dynamic'

const nav = [
  ['Overview', '/admin/dump-truck/dashboard'],
  ['Dispatch', '/admin/dump-truck/dispatch'],
  ['Drivers', '/admin/dump-truck/drivers'],
  ['Assets', '/admin/dump-truck'],
  ['KPIs', '/admin/dump-truck/kpis'],
  ['Issues', '/admin/dump-truck/recurring-issues'],
  ['Reports', '/admin/dump-truck/kpis'],
  ['Team', '/account'],
  ['Settings', '/admin/dump-truck'],
] as const

export default async function AdminOperationsDashboard() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'admin')) redirect('/fleet')

  const [businessResult, drivers, equipment, shiftsResult] = await Promise.all([
    fleetServiceClient
      .from('businesses')
      .select('company_name, three_b_biz_id')
      .eq('id', auth.businessId)
      .maybeSingle(),
    listDrivers(auth.businessId),
    listDumpTruckEquipment(auth.businessId),
    fleetServiceClient
      .from('fleet_dt_shifts')
      .select('id, driver_id, truck_id, state, clock_in_at, clock_out_at')
      .eq('business_id', auth.businessId)
      .not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)')
      .order('created_at', { ascending: false }),
  ])

  const business = businessResult.data
  const openShifts = shiftsResult.data ?? []
  const activeDrivers = new Set(openShifts.map(s => s.driver_id)).size
  const heldAssets = [...equipment.trucks, ...equipment.trailers].filter(a => a.holdStatus === 'on_hold').length
  const totalAssets = equipment.trucks.length + equipment.trailers.length

  const kpis = [
    { label: 'Drivers', value: drivers.length, sub: `${activeDrivers} active now`, href: '/admin/dump-truck/drivers' },
    { label: 'Trucks', value: equipment.trucks.length, sub: `${heldAssets} assets on hold`, href: '/admin/dump-truck' },
    { label: 'Open Shifts', value: openShifts.length, sub: 'Current operational activity', href: '/admin/dump-truck/drivers' },
    { label: 'Fleet Assets', value: totalAssets, sub: `${equipment.trailers.length} trailers`, href: '/admin/dump-truck' },
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-white/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">Admin Operations</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">{business?.company_name ?? 'Fleet Commander'}</h1>
              <p className="mt-1 text-sm text-slate-400">{business?.three_b_biz_id ?? auth.businessId} · company command view</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/fleet" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">⌂ Home</Link>
              <Link href="/account" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">Team & Account</Link>
            </div>
          </div>
        </header>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {nav.map(([label, href], index) => (
            <Link key={label} href={href} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${index === 0 ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'}`}>
              {label}
            </Link>
          ))}
        </nav>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(kpi => (
            <Link key={kpi.label} href={kpi.href} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:border-emerald-400/30 hover:bg-white/[0.06]">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">{kpi.label}</div>
              <div className="mt-2 text-4xl font-black">{kpi.value}</div>
              <div className="mt-2 text-sm text-slate-400">{kpi.sub}</div>
            </Link>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Link href="/admin/dump-truck/dispatch" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-6">
            <div className="text-2xl">📡</div>
            <h2 className="mt-3 text-xl font-black">Dispatch</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Build and send jobs, see assignments, coordinate changes, and manage live operating needs.</p>
            <div className="mt-5 font-bold text-emerald-400">Open Dispatch →</div>
          </Link>

          <Link href="/admin/dump-truck/drivers" className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-6">
            <div className="text-2xl">🚛</div>
            <h2 className="mt-3 text-xl font-black">Drivers</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">See driver identity, 3B ID, connected asset, open shift status, hours evidence, and driver reporting.</p>
            <div className="mt-5 font-bold text-sky-300">Open Drivers →</div>
          </Link>

          <Link href="/admin/dump-truck/kpis" className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-6">
            <div className="text-2xl">📈</div>
            <h2 className="mt-3 text-xl font-black">KPI & Reports</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Review production, hours, mileage, loads, asset performance, exceptions, and final company reporting.</p>
            <div className="mt-5 font-bold text-amber-300">Open KPIs →</div>
          </Link>
        </section>

        {(heldAssets > 0 || openShifts.length > 0) && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Live Operations</div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {openShifts.length > 0 && <span className="rounded-lg bg-emerald-500/10 px-3 py-2 font-bold text-emerald-300">{openShifts.length} open shift{openShifts.length === 1 ? '' : 's'}</span>}
              {heldAssets > 0 && <span className="rounded-lg bg-red-500/10 px-3 py-2 font-bold text-red-300">{heldAssets} asset{heldAssets === 1 ? '' : 's'} on hold</span>}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
