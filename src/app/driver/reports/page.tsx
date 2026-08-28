'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] p-5'

export default function DriverReportsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(today)

  const exportReport = (type: 'summary' | 'detail', format: 'pdf' | 'csv') => {
    if (!from || !to) return
    const params = new URLSearchParams({ range: 'custom', from, to, type, format })
    window.open(`/api/fleet/dump-truck/hours/export?${params.toString()}`, '_blank')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="border-b border-white/10 pb-5">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">Driver Reports</div>
          <h1 className="mt-2 text-3xl font-black">My Work Records</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Your personal work evidence and performance history. These reports are limited to your own records and are designed to help verify hours, explain exceptions, and spot patterns you can improve.</p>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className={card}>
            <div className="text-2xl">⏱️</div><h2 className="mt-3 font-black">Work Hours & Time Evidence</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Daily hours, regular/OT, broker/customer hours, additional work, loads, miles and review status.</p>
            <Link href="/driver/hours" className="mt-4 inline-block font-bold text-emerald-400">Open My Hours →</Link>
          </div>
          <div className={card}>
            <div className="text-2xl">📋</div><h2 className="mt-3 font-black">Weekly Timesheet / Pay Hours</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Weekly sign-off record with correction history and dispatch approval status.</p>
            <Link href="/driver/hours" className="mt-4 inline-block font-bold text-emerald-400">Open Timesheets →</Link>
          </div>
          <div className={card}>
            <div className="text-2xl">📈</div><h2 className="mt-3 font-black">Personal Improvement View</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Use your hours, delays, loads and miles to understand where your workday is efficient and where recurring friction occurs.</p>
            <div className="mt-4 text-xs font-bold uppercase tracking-wider text-amber-300">Trend dashboard next</div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
          <h2 className="text-xl font-black">Custom Personal Report</h2>
          <p className="mt-1 text-sm text-slate-400">Choose any dates. The PDF is a readable report; CSV opens directly in Excel, Numbers or Google Sheets.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Start</div><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2" /></label>
            <label><div className="mb-1 text-xs font-black uppercase text-slate-500">End</div><input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2" /></label>
            <button disabled={!from || !to} onClick={() => exportReport('summary', 'pdf')} className="self-end rounded-xl bg-emerald-400 px-4 py-2.5 font-black text-slate-950 disabled:opacity-40">📄 Period Summary PDF</button>
            <button disabled={!from || !to} onClick={() => exportReport('detail', 'csv')} className="self-end rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-black disabled:opacity-40">📊 Detailed Excel/CSV</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={!from || !to} onClick={() => exportReport('detail', 'pdf')} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold disabled:opacity-40">Full Detail PDF</button>
            <button disabled={!from || !to} onClick={() => exportReport('summary', 'csv')} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold disabled:opacity-40">Summary Excel/CSV</button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Continuous Improvement</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-300">
            <div><strong className="text-white">Measure:</strong> hours, loads, miles, waiting and delays.</div>
            <div><strong className="text-white">Understand:</strong> compare days and identify recurring causes.</div>
            <div><strong className="text-white">Improve:</strong> change the process, then compare the next period.</div>
          </div>
        </section>
      </div>
    </main>
  )
}
