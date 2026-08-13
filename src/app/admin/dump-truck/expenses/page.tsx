'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.55rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.6rem 1rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }

type ExpenseCategory = 'fuel' | 'repairs' | 'tires' | 'tolls' | 'parking' | 'permit' | 'wash' | 'supplies' | 'maintenance' | 'reimbursement' | 'other'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'

const CATEGORIES: ExpenseCategory[] = ['repairs', 'tires', 'tolls', 'parking', 'permit', 'wash', 'supplies', 'maintenance', 'reimbursement', 'other', 'fuel']

interface ExpenseDTO {
  id: string; truckId: string | null; driverId: string | null; category: ExpenseCategory; vendor: string | null
  amount: number; paymentMethod: string | null; reimbursable: boolean; approvalStatus: ApprovalStatus
  notes: string | null; occurredAt: string
}
interface EquipmentOption { id: string; unitNumber: string }
interface DriverOption { userId: string; name: string }

function todayIso(): string { return new Date().toISOString().slice(0, 10) }
function monthStartIso(): string { return `${new Date().toISOString().slice(0, 7)}-01` }

/**
 * Operating expense capture (spec §9.1) — repairs/tires/tolls/etc. Fuel
 * continues to be entered via the driver fuel-stop flow (fleet_dt_fuel_entries);
 * "fuel" is still selectable here only for a one-off cash purchase logged after
 * the fact, kept out of the truck-P&L fuel figure to avoid double counting
 * (see sqcdpCompute.ts — cost KPIs read fleet_dt_fuel_entries for fuel cost
 * and exclude category='fuel' rows from this table).
 */
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([])
  const [trucks, setTrucks] = useState<EquipmentOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ category: 'repairs' as ExpenseCategory, truckId: '', vendor: '', amount: '', paymentMethod: '', occurredAt: todayIso(), notes: '', reimbursable: false })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/fleet/dump-truck/admin/expenses?from=${from}&to=${to}`).then(r => r.json()),
      fetch('/api/fleet/dump-truck/equipment').then(r => r.json()),
      fetch('/api/fleet/dump-truck/drivers').then(r => r.json()),
    ]).then(([exp, equip, drv]) => {
      setExpenses(exp.expenses ?? [])
      setTrucks(equip.trucks ?? [])
      setDrivers(drv.drivers ?? [])
    }).finally(() => setLoading(false))
  }, [from, to])
  useEffect(load, [load])

  const unitFor = (id: string | null) => trucks.find(t => t.id === id)?.unitNumber ?? '—'
  const driverName = (id: string | null) => drivers.find(d => d.userId === id)?.name ?? '—'

  const submit = async () => {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Enter a valid amount'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/admin/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category, truckId: form.truckId || null, vendor: form.vendor || null, amount,
          paymentMethod: form.paymentMethod || null, occurredAt: form.occurredAt, notes: form.notes || null, reimbursable: form.reimbursable,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save expense')
      toast.success('Expense logged')
      setForm({ category: 'repairs', truckId: '', vendor: '', amount: '', paymentMethod: '', occurredAt: todayIso(), notes: '', reimbursable: false })
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save expense')
    } finally {
      setBusy(false)
    }
  }

  const setApproval = async (id: string, approvalStatus: ApprovalStatus) => {
    try {
      const res = await fetch(`/api/fleet/dump-truck/admin/expenses/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalStatus }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not update expense')
      toast.success(approvalStatus === 'approved' ? 'Approved' : approvalStatus === 'rejected' ? 'Rejected' : 'Marked pending')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update expense')
    }
  }

  const totalByCategory = expenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc }, {})
  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Operating Expenses</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Repairs, tires, tolls, and other truck-day costs (spec §9.1). Feeds Truck Contribution Margin on the{' '}
          <Link href="/admin/dump-truck/sqcdp" style={{ color: 'var(--primary)', fontWeight: 700 }}>SQCDP Review</Link>.{' '}
          <Link href="/admin/dump-truck" style={{ color: 'var(--primary)', fontWeight: 700 }}>← Back to Dump Truck Setup</Link>
        </p>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Log an Expense</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
          <div><div style={labelStyle}>Category</div>
            <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><div style={labelStyle}>Truck</div>
            <select style={inputStyle} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
              <option value="">Unassigned</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
            </select>
          </div>
          <div><div style={labelStyle}>Vendor</div><input style={inputStyle} value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div>
          <div><div style={labelStyle}>Amount ($)</div><input style={inputStyle} type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <div><div style={labelStyle}>Payment Method</div><input style={inputStyle} value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} placeholder="card, cash, check…" /></div>
          <div><div style={labelStyle}>Date</div><input style={inputStyle} type="date" value={form.occurredAt} onChange={e => setForm({ ...form, occurredAt: e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <div style={labelStyle}>Notes</div>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', marginBottom: '1rem' }}>
          <input type="checkbox" checked={form.reimbursable} onChange={e => setForm({ ...form, reimbursable: e.target.checked })} /> Reimbursable to driver
        </label>
        <button style={{ ...btnStyle, opacity: busy ? .6 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Log Expense'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" style={inputStyle} value={from} onChange={e => setFrom(e.target.value)} />
        <span style={{ color: 'var(--muted)' }}>to</span>
        <input type="date" style={inputStyle} value={to} onChange={e => setTo(e.target.value)} />
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>}

      {!loading && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Expenses ({expenses.length})</h2>
            <div style={{ fontWeight: 800 }}>Total: ${grandTotal.toFixed(2)}</div>
          </div>
          {Object.keys(totalByCategory).length > 0 && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.75rem', paddingBottom: '.75rem', borderBottom: '1px solid var(--border)' }}>
              {Object.entries(totalByCategory).map(([cat, total]) => (
                <span key={cat}>{cat}: <strong style={{ color: 'var(--text)' }}>${total.toFixed(0)}</strong></span>
              ))}
            </div>
          )}
          {expenses.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No expenses in this range.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map(e => (
              <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.7rem .85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.85rem' }}>
                    {e.category} — ${e.amount.toFixed(2)} {e.vendor && `· ${e.vendor}`}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                    {e.occurredAt} · Truck {unitFor(e.truckId)} {e.driverId && `· ${driverName(e.driverId)}`} {e.reimbursable && '· Reimbursable'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '.72rem', fontWeight: 700, padding: '.25rem .55rem', borderRadius: 6,
                    color: e.approvalStatus === 'approved' ? 'var(--success)' : e.approvalStatus === 'rejected' ? 'var(--error)' : 'var(--warn)',
                  }}>
                    {e.approvalStatus}
                  </span>
                  {e.approvalStatus !== 'approved' && <button onClick={() => setApproval(e.id, 'approved')} style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)' }}>Approve</button>}
                  {e.approvalStatus !== 'rejected' && <button onClick={() => setApproval(e.id, 'rejected')} style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--error)' }}>Reject</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
