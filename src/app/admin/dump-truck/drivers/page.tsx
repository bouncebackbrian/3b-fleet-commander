import Link from 'next/link'
import { redirect } from 'next/navigation'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'
import { listDumpTruckEquipment } from '@/lib/fleet/dumpTruck/equipment'

export const dynamic = 'force-dynamic'

export default async function AdminDriversPage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'admin')) redirect('/fleet')

  const [drivers, equipment, shiftsResult] = await Promise.all([
    listDrivers(auth.businessId),
    listDumpTruckEquipment(auth.businessId),
    fleetServiceClient
      .from('fleet_dt_shifts')
      .select('id, driver_id, truck_id, trailer_id, state, clock_in_at')
      .eq('business_id', auth.businessId)
      .not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)')
      .order('created_at', { ascending: false }),
  ])

  const assetById = new Map([...equipment.trucks, ...equipment.trailers].map(asset => [asset.id, asset]))
  const openShiftByDriver = new Map<string, (typeof shiftsResult.data extends (infer T)[] | null ? T : never)>()
  for (const shift of shiftsResult.data ?? []) {
    if (!openShiftByDriver.has(shift.driver_id)) openShiftByDriver.set(shift.driver_id, shift)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Admin · Drivers</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Driver Roster</h1>
            <p className="mt-1 text-sm text-slate-400">3B identity, current asset connection, and live shift status.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dump-truck/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">← Admin Home</Link>
            <Link href="/account" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">Manage Team</Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4">
          {drivers.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">No active business members are available yet.</div>
          ) : drivers.map(driver => {
            const shift = openShiftByDriver.get(driver.userId)
            const truck = shift?.truck_id ? assetById.get(shift.truck_id) : null
            const trailer = shift?.trailer_id ? assetById.get(shift.trailer_id) : null
            return (
              <article key={driver.userId} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-black">{driver.name}</div>
                    <div className="mt-1 font-mono text-sm text-emerald-300">{driver.threebId ?? '3B ID pending'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {shift ? (
                      <>
                        <span className="rounded-lg bg-emerald-500/10 px-3 py-2 font-bold text-emerald-300">Active Shift</span>
                        {truck && <span className="rounded-lg bg-sky-500/10 px-3 py-2 font-bold text-sky-300">🚛 {truck.unitNumber}</span>}
                        {trailer && <span className="rounded-lg bg-violet-500/10 px-3 py-2 font-bold text-violet-300">Trailer {trailer.unitNumber}</span>}
                      </>
                    ) : (
                      <span className="rounded-lg bg-white/5 px-3 py-2 font-bold text-slate-400">No current asset connection</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Status</div>
                    <div className="mt-1 text-sm font-bold">{shift ? shift.state.replaceAll('_', ' ') : 'Off shift'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Connected Asset</div>
                    <div className="mt-1 text-sm font-bold">{truck?.unitNumber ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Clock In</div>
                    <div className="mt-1 text-sm font-bold">{shift?.clock_in_at ? new Date(shift.clock_in_at).toLocaleString() : '—'}</div>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}
