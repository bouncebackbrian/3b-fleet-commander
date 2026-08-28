import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'
import CustomHoursReport from '@/components/dumpTruck/CustomHoursReport'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'admin') && !hasPortal(auth.portals, 'dispatch')) redirect('/fleet')

  const drivers = await listDrivers(auth.businessId)

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-white/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">Admin Reports</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Custom Hours Report</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Choose any date range and generate company or driver-specific hour reports with daily detail, period totals, operational breakdowns, and PDF/CSV exports.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dump-truck/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">← Admin Dashboard</Link>
              <Link href="/fleet" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">⌂ Home</Link>
            </div>
          </div>
        </header>

        <section className="mt-6">
          <CustomHoursReport drivers={drivers.map(d => ({ userId: d.userId, name: d.name, threebId: d.threebId }))} />
        </section>
      </div>
    </main>
  )
}
