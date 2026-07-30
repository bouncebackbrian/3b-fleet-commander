'use client'
/**
 * AdminDriverTaxPanel — classify drivers W-2/1099, set a suggested weekly
 * withholding %, see W-9 status, and generate Form 1099-NEC (Copy B/C —
 * NOT the IRS-scannable Copy A, see lib/tax/form1099nec.tsx) for 1099
 * contractors at year end.
 */
import { useEffect, useState } from 'react'
import { toast } from '@/hooks/useToast'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'

interface TaxSummary {
  driverId: string
  classification: 'w2' | '1099'
  withholdingPercent: number | null
  hasW9: boolean
  w9SignedAt: string | null
}

interface Filing {
  id: string
  taxYear: number
  totalCompensation: number
  generatedAt: string
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }
const btnStyle: React.CSSProperties = { padding: '.5rem .9rem', borderRadius: 8, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.78rem' }

export default function AdminDriverTaxPanel({ drivers }: { drivers: DriverOption[] }) {
  const [summaries, setSummaries] = useState<Record<string, TaxSummary>>({})
  const [withholdingDraft, setWithholdingDraft] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filings, setFilings] = useState<Filing[]>([])
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()))
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = () => {
    fetch('/api/fleet/dump-truck/driver-tax').then(r => r.json()).then(b => {
      const map: Record<string, TaxSummary> = {}
      for (const p of (b.profiles ?? []) as TaxSummary[]) map[p.driverId] = p
      setSummaries(map)
    })
  }
  useEffect(reload, [])

  const summaryFor = (driverId: string): TaxSummary =>
    summaries[driverId] ?? { driverId, classification: 'w2', withholdingPercent: null, hasW9: false, w9SignedAt: null }

  const setClassification = async (driverId: string, classification: 'w2' | '1099') => {
    setBusyId(driverId)
    try {
      const withholdingPercent = classification === '1099'
        ? (withholdingDraft[driverId] ? Number(withholdingDraft[driverId]) : summaryFor(driverId).withholdingPercent)
        : null
      const res = await fetch(`/api/fleet/dump-truck/driver-tax/${driverId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification, withholdingPercent }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not update')
      toast.success('Updated')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    } finally {
      setBusyId(null)
    }
  }

  const saveWithholding = (driverId: string) => setClassification(driverId, '1099')

  const loadFilings = (driverId: string) => {
    setExpandedId(expandedId === driverId ? null : driverId)
    if (expandedId !== driverId) {
      fetch(`/api/fleet/dump-truck/driver-tax/${driverId}/1099`).then(r => r.json()).then(b => setFilings(b.filings ?? []))
    }
  }

  const generate = async (driverId: string, driverDisplayName: string) => {
    const taxYear = Number(genYear)
    if (!taxYear) return
    setBusyId(driverId)
    try {
      const res = await fetch(`/api/fleet/dump-truck/driver-tax/${driverId}/1099`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxYear, driverDisplayName }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not generate 1099')
      toast.success(`1099-NEC generated for ${taxYear}`)
      loadFilings(driverId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate 1099')
    } finally {
      setBusyId(null)
    }
  }

  const viewFiling = async (filingId: string) => {
    try {
      const res = await fetch(`/api/fleet/dump-truck/driver-tax/1099-filings/${filingId}/pdf`)
      if (!res.ok) throw new Error('Could not open 1099')
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open 1099')
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>Driver Tax Classification &amp; 1099-NEC</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Classify each driver W-2 or 1099. 1099 drivers see a suggested savings % on their weekly pay (their own
        estimate, not actual backup withholding). Generated 1099-NEC PDFs are Copy B/C for records — the copy
        actually filed with the IRS must go through e-file (irs.gov/iris) or the official Copy A form.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700 }}>Generate for tax year:</span>
        <input style={{ ...inputStyle, width: 90 }} type="number" value={genYear} onChange={e => setGenYear(e.target.value)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {drivers.map(d => {
          const s = summaryFor(d.userId)
          return (
            <div key={d.userId} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 140 }}>{d.name}</span>
                <select
                  style={inputStyle} value={s.classification} disabled={busyId === d.userId}
                  onChange={e => setClassification(d.userId, e.target.value as 'w2' | '1099')}
                >
                  <option value="w2">W-2 Employee</option>
                  <option value="1099">1099 Contractor</option>
                </select>
                {s.classification === '1099' && (
                  <>
                    <input
                      style={{ ...inputStyle, width: 90 }} type="number" step="0.1" placeholder="%"
                      value={withholdingDraft[d.userId] ?? (s.withholdingPercent != null ? String(s.withholdingPercent) : '')}
                      onChange={e => setWithholdingDraft(w => ({ ...w, [d.userId]: e.target.value }))}
                    />
                    <button onClick={() => saveWithholding(d.userId)} disabled={busyId === d.userId} style={btnStyle}>Save %</button>
                    <span style={{ fontSize: '.78rem', color: s.hasW9 ? 'var(--success)' : 'var(--warn)', fontWeight: 700 }}>
                      {s.hasW9 ? '✓ W-9 on file' : '⚠️ No W-9 yet'}
                    </span>
                    <button onClick={() => generate(d.userId, d.name)} disabled={busyId === d.userId || !s.hasW9} style={{ ...btnStyle, opacity: s.hasW9 ? 1 : .5 }}>
                      Generate 1099
                    </button>
                    <button onClick={() => loadFilings(d.userId)} style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '.78rem' }}>
                      {expandedId === d.userId ? 'Hide' : 'Filings'}
                    </button>
                  </>
                )}
              </div>

              {expandedId === d.userId && (
                <div style={{ marginTop: '.6rem', paddingTop: '.6rem', borderTop: '1px solid var(--border)' }}>
                  {filings.length === 0 && <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>No 1099s generated yet.</div>}
                  {filings.map(f => (
                    <button
                      key={f.id} onClick={() => viewFiling(f.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', width: '100%', padding: '.4rem .6rem', borderRadius: 6,
                        background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.78rem', marginBottom: 4,
                      }}
                    >
                      <span>Tax Year {f.taxYear}</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 700 }}>${f.totalCompensation.toFixed(2)} — Download</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {drivers.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No drivers yet.</div>}
      </div>
    </div>
  )
}
