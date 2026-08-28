import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'

export const dynamic = 'force-dynamic'

export default async function FounderSalesPage() {
  await requireFounder()
  const metrics = ['Leads','Qualified','Trials / Demos','Conversions','MRR / Revenue','Churn Risk']
  return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
    <header className="border-b border-white/10 pb-6"><Link href="/founder" className="text-xs font-black uppercase tracking-wider text-amber-300">← Founder Portal</Link><h1 className="mt-3 text-3xl font-black">Sales</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Platform-wide acquisition and commercial performance. Keep sales metrics separate from any one customer Fleet account.</p></header>
    <section className="my-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(m => <div key={m} className="bg-slate-950 p-5"><div className="text-[11px] font-black uppercase tracking-wider text-slate-600">{m}</div><div className="mt-2 text-3xl font-black">—</div><div className="mt-1 text-xs text-slate-500">Sales data source not connected yet</div></div>)}</section>
    <section className="border-y border-white/10 py-4 text-sm leading-7 text-slate-400"><strong className="text-white">Founder sales view:</strong> source → lead → qualified → demo/trial → activated business → paid account → expansion/churn. This page will become the commercial funnel once CRM/billing records are connected.</section>
  </div></main>
}
