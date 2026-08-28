'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const OPTIONS = [
  ['all', 'All Assets'],
  ['dump_truck', 'Dump Truck'],
  ['water_truck', 'Water Truck'],
  ['hotshot', 'Hotshot'],
  ['otr', 'OTR'],
  ['regional', 'Regional'],
  ['local', 'Local'],
  ['business_vehicle', 'Business Vehicle'],
] as const

export default function AdminViewSelector() {
  const router = useRouter()
  const search = useSearchParams()
  const current = search.get('view') || 'all'

  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ color: 'var(--muted)', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Dashboard view</span>
      <select
        value={current}
        onChange={e => router.replace(`/admin/dashboard?view=${encodeURIComponent(e.target.value)}`)}
        style={{ minWidth: 190, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', padding: '.65rem .8rem', fontWeight: 800 }}
      >
        {OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  )
}
