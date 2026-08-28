import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const dynamic = 'force-dynamic'

export default async function FounderMembersPage() {
  await requireFounder()
  const { data } = await fleetServiceClient.from('fleet_business_members').select('business_id,user_id,role,active').order('business_id')
  const rows = data ?? []
  const active = rows.filter(r => r.active)
  const users = new Set(active.map(r => r.user_id))
  return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
    <header className="border-b border-white/10 pb-6"><Link href="/founder" className="text-xs font-black uppercase tracking-wider text-amber-300">← Founder Portal</Link><h1 className="mt-3 text-3xl font-black">Members</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Platform-level membership footprint. Founder visibility does not grant or alter a customer company’s operational permissions.</p></header>
    <section className="my-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"><div className="bg-slate-950 p-5"><div className="text-[11px] font-black uppercase text-slate-600">Unique active people</div><div className="mt-2 text-3xl font-black">{users.size}</div></div><div className="bg-slate-950 p-5"><div className="text-[11px] font-black uppercase text-slate-600">Active memberships</div><div className="mt-2 text-3xl font-black">{active.length}</div></div><div className="bg-slate-950 p-5"><div className="text-[11px] font-black uppercase text-slate-600">Inactive memberships</div><div className="mt-2 text-3xl font-black">{rows.length-active.length}</div></div></section>
    <div className="divide-y divide-white/10 border-y border-white/10">{active.slice(0,100).map((r,i)=><div key={`${r.business_id}-${r.user_id}-${i}`} className="grid gap-2 py-3 text-sm sm:grid-cols-[1.3fr_1.3fr_.7fr]"><span className="font-mono text-xs text-slate-400">{r.user_id}</span><span className="font-mono text-xs text-slate-600">{r.business_id}</span><span className="capitalize text-slate-300">{String(r.role).replaceAll('_',' ')}</span></div>)}</div>
  </div></main>
}
