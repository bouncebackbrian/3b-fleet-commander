import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'

export const dynamic = 'force-dynamic'

export default async function FounderProductPage() {
  await requireFounder()
  const areas = ['Auth / Identity','Driver','Dispatch','Admin','Founder','Reporting / KPIs','Compliance','Assets / Team','Integrations','Deployments']
  return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
    <header className="border-b border-white/10 pb-6"><Link href="/founder" className="text-xs font-black uppercase tracking-wider text-amber-300">← Founder Portal</Link><h1 className="mt-3 text-3xl font-black">Product / Build</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Track product health, deployment readiness, known gaps and which workflows are actually ready for customers.</p></header>
    <section className="my-6 divide-y divide-white/10 border-y border-white/10">{areas.map(area => <div key={area} className="grid gap-2 py-4 sm:grid-cols-[210px_1fr_auto]"><div className="font-black">{area}</div><div className="text-sm text-slate-500">Status, current blocker, owner, last verified production behavior and next release action.</div><div className="text-xs font-bold text-slate-600">CONNECT STATUS</div></div>)}</section>
    <Link href="/founder/problems" className="inline-flex rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950">Problems & Decisions →</Link>
  </div></main>
}
