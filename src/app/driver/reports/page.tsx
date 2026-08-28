'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function DriverReportsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [from, setFrom] = useState('2026-07-01')
  const [to, setTo] = useState(today)

  const exportReport = (type: 'summary' | 'detail' | 'ledger', format: 'pdf' | 'csv') => {
    if (!from || !to) return
    const params = new URLSearchParams({ range: 'custom', from, to, type, format })
    window.open(`/api/fleet/dump-truck/hours/export?${params.toString()}`, '_blank')
  }

  return (
    <main className="min-h-screen bg-[#061210] text-[#cceee6]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-[#16352d] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-[#00e8b0]">Fleet Commander · Reports</div>
            <h1 className="mt-2 text-3xl font-black">My work records</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6aaa96]">Hours, work evidence and personal performance history for the selected period.</p>
          </div>
          <Link href="/driver/hours" className="text-sm font-black text-[#00e8b0]">Open Hours →</Link>
        </header>

        <section className="mt-6 rounded-2xl border border-[#16352d] bg-[#0b1b18] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-black">Create report</h2>
            <p className="mt-1 text-sm text-[#6aaa96]">Choose a date range, then export directly from your connected Cal-Neva hour records.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
            <label>
              <div className="mb-1 text-xs font-black uppercase tracking-wider text-[#6aaa96]">Start</div>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full rounded-xl border border-[#21483e] bg-[#061210] px-3 py-2.5" />
            </label>
            <label>
              <div className="mb-1 text-xs font-black uppercase tracking-wider text-[#6aaa96]">End</div>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full rounded-xl border border-[#21483e] bg-[#061210] px-3 py-2.5" />
            </label>
            <button disabled={!from || !to} onClick={() => exportReport('summary', 'pdf')} className="rounded-xl bg-[#00e8b0] px-4 py-2.5 font-black text-[#061210] disabled:opacity-40">Summary PDF</button>
            <button disabled={!from || !to} onClick={() => exportReport('detail', 'csv')} className="rounded-xl border border-[#21483e] bg-[#0f2220] px-4 py-2.5 font-black disabled:opacity-40">Detailed CSV</button>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <button disabled={!from || !to} onClick={() => exportReport('ledger', 'pdf')} className="font-black text-[#00e8b0] disabled:opacity-40">Weekly Ledger PDF</button>
            <button disabled={!from || !to} onClick={() => exportReport('ledger', 'csv')} className="font-black text-[#00e8b0] disabled:opacity-40">Weekly Ledger CSV</button>
            <button disabled={!from || !to} onClick={() => exportReport('detail', 'pdf')} className="font-bold text-[#8ac9b8] hover:text-[#cceee6] disabled:opacity-40">Full Detail PDF</button>
            <button disabled={!from || !to} onClick={() => exportReport('summary', 'csv')} className="font-bold text-[#8ac9b8] hover:text-[#cceee6] disabled:opacity-40">Summary CSV</button>
          </div>
        </section>

        <section className="mt-6 divide-y divide-[#16352d]">
          <div className="grid gap-2 py-5 sm:grid-cols-[180px_1fr]">
            <div className="font-black">Time evidence</div>
            <div className="text-sm leading-6 text-[#6aaa96]">Daily hours, regular and overtime hours, loads, miles, additional work and correction history.</div>
          </div>
          <div className="grid gap-2 py-5 sm:grid-cols-[180px_1fr]">
            <div className="font-black">Weekly records</div>
            <div className="text-sm leading-6 text-[#6aaa96]">Weekly sign-off and review status stay tied to your own work record.</div>
          </div>
          <div className="grid gap-2 py-5 sm:grid-cols-[180px_1fr]">
            <div className="font-black">Improvement</div>
            <div className="text-sm leading-6 text-[#6aaa96]">Compare hours, loads, miles, waiting and delay patterns across periods to see what improved and what keeps repeating.</div>
          </div>
        </section>
      </div>
    </main>
  )
}
