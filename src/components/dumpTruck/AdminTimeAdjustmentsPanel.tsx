'use client'
/**
 * AdminTimeAdjustmentsPanel — management time adjustment entry (spec).
 *
 * Explanation is mandatory (also enforced server-side/DB). Every submit
 * creates a new fleet_dt_time_adjustments row — corrections happen by
 * submitting a new one for the same driver/date/category, never by editing
 * history. Payroll/billing/admin manage-level only (enforced server-side).
 */
import { useState, useEffect, useCallback } from 'react'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'
import { toast } from '@/hooks/useToast'

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'breakdown_roadside', label: 'Breakdown / Roadside' },
  { value: 'shop_repair_waiting', label: 'Shop / Repair Waiting' },
  { value: 'return_to_yard', label: 'Return to Yard' },
  { value: 'posttrip', label: 'Post-Trip' },
  { value: 'fueling', label: 'Fueling' },
  { value: 'paperwork', label: 'Paperwork' },
  { value: 'dispatch_required_waiting', label: 'Dispatch-Required Waiting' },
  { value: 'customer_delay', label: 'Customer Delay' },
  { value: 'scale_delay', label: 'Scale Delay' },
  { value: 'weather', label: 'Weather' },
  { value: 'road_closure', label: 'Road Closure' },
  { value: 'truck_dropoff', label: 'Truck Drop-off' },
  { value: 'training', label: 'Training' },
  { value: 'drug_testing', label: 'Drug Testing' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'corrected_paper_sheet_hours', label: 'Corrected Paper-Sheet Hours' },
  { value: 'other', label: 'Other' },
]

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.65rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }

interface AdjustmentRow {
  id: string
  driverId: string
  workDate: string
  category: string
  durationMinutes: number
  explanation: string
  driverPayable: 'yes' | 'no' | 'pending'
  customerBillable: 'yes' | 'no' | 'pending'
  createdAt: string
}

const EMPTY_FORM = {
  driverId: '', truckId: '', jobId: '', workDate: '', durationMinutes: '',
  category: 'breakdown_roadside', explanation: '',
  driverPayable: 'pending' as 'yes' | 'no' | 'pending', payableHours: '',
  customerBillable: 'no' as 'yes' | 'no' | 'pending', billableHours: '',
}

export default function AdminTimeAdjustmentsPanel({ drivers, trucks }: { drivers: DriverOption[]; trucks: EquipmentOption[] }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState<AdjustmentRow[]>([])

  const loadRecent = useCallback(() => {
    fetch('/api/fleet/dump-truck/adjustments').then(r => r.json()).then(b => setRecent(b.adjustments ?? [])).catch(() => {})
  }, [])
  useEffect(loadRecent, [loadRecent])

  const driverName = (id: string) => drivers.find(d => d.userId === id)?.name ?? id

  const submit = async () => {
    if (!form.driverId || !form.workDate || !form.durationMinutes || !form.explanation.trim()) {
      toast.error('Driver, date, duration, and explanation are required'); return
    }
    if (form.category === 'other' && !form.explanation.trim()) {
      toast.error('Explanation is required when category is Other'); return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/adjustments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: form.driverId, truckId: form.truckId || null, jobId: form.jobId || null,
          workDate: form.workDate, durationMinutes: Number(form.durationMinutes),
          category: form.category, explanation: form.explanation.trim(),
          driverPayable: form.driverPayable, payableHours: form.payableHours ? Number(form.payableHours) : null,
          customerBillable: form.customerBillable, billableHours: form.billableHours ? Number(form.billableHours) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save adjustment')
      toast.success('Time adjustment saved')
      setForm(EMPTY_FORM)
      loadRecent()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save adjustment')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>Time Adjustments</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Classify breakdown, return-to-yard, or other operational time as payable/billable — explanation required,
        never silent. This never edits raw clock times; it only decides how much counts toward pay/billing.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem', marginBottom: '.75rem' }}>
        <Field label="Driver">
          <select style={inputStyle} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
            <option value="">Select…</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Truck">
          <select style={inputStyle} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
            <option value="">None</option>
            {trucks.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
          </select>
        </Field>
        <Field label="Date"><input style={inputStyle} type="date" value={form.workDate} onChange={e => setForm({ ...form, workDate: e.target.value })} /></Field>
        <Field label="Duration (minutes)"><input style={inputStyle} type="number" min="0" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} /></Field>
        <Field label="Category">
          <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Explanation (required)">
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem', margin: '.75rem 0' }}>
        <Field label="Driver Payable">
          <select style={inputStyle} value={form.driverPayable} onChange={e => setForm({ ...form, driverPayable: e.target.value as typeof form.driverPayable })}>
            <option value="pending">Pending Review</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.driverPayable === 'yes' && (
          <Field label="Payable Hours (partial split, optional)"><input style={inputStyle} type="number" step="0.01" value={form.payableHours} onChange={e => setForm({ ...form, payableHours: e.target.value })} placeholder="full duration if blank" /></Field>
        )}
        <Field label="Customer Billable">
          <select style={inputStyle} value={form.customerBillable} onChange={e => setForm({ ...form, customerBillable: e.target.value as typeof form.customerBillable })}>
            <option value="no">No</option>
            <option value="pending">Pending Review</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        {form.customerBillable === 'yes' && (
          <Field label="Billable Hours (partial split, optional)"><input style={inputStyle} type="number" step="0.01" value={form.billableHours} onChange={e => setForm({ ...form, billableHours: e.target.value })} placeholder="full duration if blank" /></Field>
        )}
      </div>

      <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save Adjustment'}</button>

      <table style={{ width: '100%', marginTop: '1.5rem', fontSize: '.82rem' }}>
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>Date</th><th>Driver</th><th>Category</th><th>Hrs</th><th>Payable</th><th>Billable</th><th>Explanation</th></tr></thead>
        <tbody>
          {recent.slice(0, 20).map(a => (
            <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{a.workDate}</td>
              <td>{driverName(a.driverId)}</td>
              <td>{CATEGORIES.find(c => c.value === a.category)?.label ?? a.category}</td>
              <td>{(a.durationMinutes / 60).toFixed(2)}</td>
              <td style={{ color: a.driverPayable === 'yes' ? 'var(--success)' : a.driverPayable === 'no' ? 'var(--error)' : 'var(--warn, #d99a2b)' }}>{a.driverPayable}</td>
              <td style={{ color: a.customerBillable === 'yes' ? 'var(--success)' : a.customerBillable === 'no' ? 'var(--error)' : 'var(--warn, #d99a2b)' }}>{a.customerBillable}</td>
              <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.explanation}>{a.explanation}</td>
            </tr>
          ))}
          {recent.length === 0 && <tr><td colSpan={7} style={{ padding: '1rem 0', color: 'var(--muted)' }}>No adjustments yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>
}
