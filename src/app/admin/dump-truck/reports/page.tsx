import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'
import CustomHoursReport from '@/components/dumpTruck/CustomHoursReport'

export const dynamic = 'force-dynamic'

const reportGroups = [
  {
    title: 'Records & Evidence',
    reports: [
      ['Work Hours & Time Evidence', 'Daily and period totals with regular/OT, customer/broker time, additional work and corrections.'],
      ['Weekly Timesheet / Pay Hours', 'Driver sign-off, review status and approved weekly hour evidence.'],
      ['Audit & Corrections History', 'Immutable correction/review trail so changes are explainable and traceable.'],
    ],
  },
  {
    title: 'Operational Performance',
    reports: [
      ['Daily Activity & Mileage', 'Compare operating hours, loads, mileage and trucks across selected dates.'],
      ['Load & Production Activity', 'Loads and quantity hauled by driver, asset, day, job and eventually site/customer.'],
      ['Delay & Downtime', 'Waiting, traffic, mechanical and other delay categories ranked by impact.'],
      ['Asset Performance', 'Utilization, downtime, recurring issues, mileage and production by truck/trailer.'],
      ['Site Performance', 'Wait time, throughput, access issues and repeat friction by pickup/drop location.'],
    ],
  },
  {
    title: 'Continuous Improvement',
    reports: [
      ['Recurring Cause Ranking', 'Which problems repeatedly consume the most time, money or production capacity.'],
      ['Trend & Before/After', 'Compare periods before and after a process, route, repair or staffing change.'],
      ['Exception Rate', 'How often corrections, missing paperwork, late starts, breakdowns or other exceptions occur.'],
      ['Company Period Summary', 'Executive summary across drivers/assets with totals, trends and improvement priorities.'],
    ],
  },
] as const

export default async function AdminReportsPage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'admin')) redirect('/fleet')
  const drivers = await listDrivers(auth.businessId)

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-white/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">Admin Reports</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Company Intelligence & Reports</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Fleet Commander reporting is designed for both proof and improvement: establish what happened, identify the cause, change the operation, then measure whether the change worked.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dump-truck/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">← Admin Dashboard</Link>
              <Link href="/fleet" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">⌂ Home</Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-5 xl:grid-cols-3">
          {reportGroups.map(group => (
            <div key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-black">{group.title}</h2>
              <div className="mt-4 grid gap-3">
                {group.reports.map(([name, description]) => (
                  <div key={name} className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="font-black">{name}</div>
                    <div className="mt-1 text-sm leading-5 text-slate-400">{description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-400">Continuous Improvement Loop</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
            <div><strong>1. Measure</strong><div className="mt-1 text-slate-400">Capture hours, loads, miles, fuel, delays, issues and paperwork.</div></div>
            <div><strong>2. Diagnose</strong><div className="mt-1 text-slate-400">Rank recurring causes and find where performance is being lost.</div></div>
            <div><strong>3. Improve</strong><div className="mt-1 text-slate-400">Change routing, site instructions, maintenance, staffing or process.</div></div>
            <div><strong>4. Verify</strong><div className="mt-1 text-slate-400">Compare the next period and confirm the change actually improved results.</div></div>
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-4">
            <h2 className="text-2xl font-black">Custom Period Report Builder</h2>
            <p className="mt-1 text-sm text-slate-400">Pick any dates and driver scope. Export readable PDF reports or spreadsheet-ready CSV files.</p>
          </div>
          <CustomHoursReport drivers={drivers.map(d => ({ userId: d.userId, name: d.name, threebId: d.threebId }))} />
        </section>
      </div>
    </main>
  )
}
