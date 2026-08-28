import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'
import CustomHoursReport from '@/components/dumpTruck/CustomHoursReport'

export const dynamic = 'force-dynamic'

const improvementReports = [
  ['Daily Activity & Mileage', 'Hours, trucks, loads, miles and operating activity by day.'],
  ['Load & Production Activity', 'Loads completed, quantity hauled and production patterns by driver and date.'],
  ['Delay & Downtime', 'Waiting, traffic, mechanical and other lost-time categories so Dispatch can attack recurring causes.'],
  ['Asset Issues & Readiness', 'Recurring defects, holds and maintenance-related operating interruptions by asset.'],
  ['Site Performance', 'Compare pickup/drop sites by wait time, throughput and recurring access issues as site intelligence grows.'],
  ['Exception & Correction History', 'Pending reviews, corrections and repeated paperwork/time exceptions that need process changes.'],
] as const

export default async function DispatchReportsPage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'dispatch')) redirect('/fleet')
  const drivers = await listDrivers(auth.businessId)

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-white/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Dispatch Reports</div>
              <h1 className="mt-2 text-3xl font-black">Operational Improvement Reports</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Use operating data to find bottlenecks, recurring delays, under-performing routes/sites/assets and opportunities to improve the next workday. Compensation dollars remain outside the Dispatch view.</p>
            </div>
            <Link href="/admin/dump-truck/dispatch" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold">← Dispatch</Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {improvementReports.map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="font-black">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-violet-300/20 bg-violet-300/[0.04] p-4">
          <div className="text-xs font-black uppercase tracking-wider text-violet-300">Measure → Find Cause → Improve → Measure Again</div>
          <p className="mt-2 text-sm text-slate-400">The custom report below is the current data foundation. Trend scoring, site/asset comparisons and recurring-cause rankings can build on the same authoritative shift records instead of creating separate numbers.</p>
        </section>

        <section className="mt-6">
          <CustomHoursReport drivers={drivers.map(d => ({ userId: d.userId, name: d.name, threebId: d.threebId }))} />
        </section>
      </div>
    </main>
  )
}
