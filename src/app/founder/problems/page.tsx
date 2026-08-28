import Link from 'next/link'
import { requireFounder } from '@/lib/founder-auth'

export const dynamic = 'force-dynamic'

const stages = [
  ['Capture', 'State the problem in observable terms. What is failing, for whom, and where?'],
  ['Diagnose', 'Separate symptom from root cause. Record evidence, frequency, scope and business impact.'],
  ['Decide', 'Choose the smallest effective response and define what success will look like.'],
  ['Assign', 'Name one owner, priority and target date. Avoid ownerless problems.'],
  ['Verify', 'Check production behavior and measurable outcomes after the change.'],
  ['Close', 'Document the result. If recurring, convert the fix into a standard or automated check.'],
] as const

export default async function FounderProblemsPage() {
  await requireFounder()
  return <main className="min-h-screen bg-slate-950 text-white">
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
      <header className="border-b border-white/10 pb-6">
        <Link href="/founder" className="text-xs font-black uppercase tracking-wider text-amber-300">← Founder Portal</Link>
        <h1 className="mt-3 text-3xl font-black">Problems & Decisions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A system-level problem should not disappear after a chat, deploy or workaround. Track the evidence, owner, decision and verification until the result is proven.</p>
      </header>

      <section className="my-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
        <div className="bg-slate-950 p-4"><div className="text-[11px] font-black uppercase text-slate-600">Open</div><div className="mt-2 text-3xl font-black">—</div><div className="text-xs text-slate-500">Problem ledger backend next</div></div>
        <div className="bg-slate-950 p-4"><div className="text-[11px] font-black uppercase text-slate-600">Critical</div><div className="mt-2 text-3xl font-black">—</div><div className="text-xs text-slate-500">Production / revenue blockers</div></div>
        <div className="bg-slate-950 p-4"><div className="text-[11px] font-black uppercase text-slate-600">Recurring</div><div className="mt-2 text-3xl font-black">—</div><div className="text-xs text-slate-500">Root-cause candidates</div></div>
      </section>

      <section>
        <div className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-600">Problem-solving loop</div>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {stages.map(([stage, detail], index) => <div key={stage} className="grid gap-2 py-4 sm:grid-cols-[36px_120px_1fr] sm:items-center sm:px-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-300/10 text-xs font-black text-amber-300">{index + 1}</div>
            <div className="font-black">{stage}</div>
            <div className="text-sm text-slate-500">{detail}</div>
          </div>)}
        </div>
      </section>

      <section className="mt-7 border-t border-white/10 pt-5">
        <div className="text-xs font-black uppercase tracking-[.16em] text-slate-600">Required problem record</div>
        <p className="mt-3 text-sm leading-7 text-slate-400">Area · problem statement · evidence · impact · severity · suspected root cause · decision · owner · target date · verification method · outcome · recurring flag.</p>
        <p className="mt-2 text-xs text-amber-300">UI is ready; persistent Founder problem records need a platform-level table before this becomes the source of truth.</p>
      </section>
    </div>
  </main>
}
