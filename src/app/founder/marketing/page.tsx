import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'

export const dynamic = 'force-dynamic'

export default async function FounderMarketingPage() {
  await requireFounder()
  const metrics = ['Reach','Traffic','Leads','Cost / Lead','Conversion','Best Channel']
  return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
    <header className="border-b border-white/10 pb-6"><Link href="/founder" className="text-xs font-black uppercase tracking-wider text-amber-300">← Founder Portal</Link><h1 className="mt-3 text-3xl font-black">Marketing</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Oversee how Fleet Commander gets attention, creates demand and converts that demand into qualified business accounts.</p></header>
    <section className="my-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(m => <div key={m} className="bg-slate-950 p-5"><div className="text-[11px] font-black uppercase tracking-wider text-slate-600">{m}</div><div className="mt-2 text-3xl font-black">—</div><div className="mt-1 text-xs text-slate-500">Marketing data source not connected yet</div></div>)}</section>
    <section className="divide-y divide-white/10 border-y border-white/10">{['Website / SEO','Social / Content','Outbound / Partnerships','Referral / Affiliate','Campaigns / Launches'].map(channel => <div key={channel} className="grid gap-2 py-4 sm:grid-cols-[200px_1fr_auto]"><div className="font-black">{channel}</div><div className="text-sm text-slate-500">Track spend, output, traffic, leads and conversions by source.</div><div className="text-xs font-bold text-slate-600">NOT CONNECTED</div></div>)}</section>
  </div></main>
}
