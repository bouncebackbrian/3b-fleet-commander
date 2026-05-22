'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Expense } from '@/lib/dashboard/types'
import { QUICK_CATS, todayISO } from '@/lib/dashboard/helpers'
import ExpenseScanSheet from '@/components/expenses/ExpenseScanSheet'

export default function ExpensesCard() {
  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([])
  const [showQuickAdd,  setShowQuickAdd]  = useState(false)
  const [showScan,      setShowScan]      = useState(false)
  const [qaCategory,    setQaCategory]    = useState('fuel')
  const [qaAmount,      setQaAmount]      = useState('')
  const [qaDesc,        setQaDesc]        = useState('')
  const [qaAdding,      setQaAdding]      = useState(false)

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('3b-expenses')
      if (!raw) return
      const all: Expense[] = JSON.parse(raw)
      setTodayExpenses(all.filter(e => e.date === todayISO()))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleAdd = () => {
    const amt = parseFloat(qaAmount)
    if (!amt || amt <= 0) return
    setQaAdding(true)
    const cat = QUICK_CATS.find(c => c.id === qaCategory) ?? QUICK_CATS[0]
    const expense: Expense = {
      id: crypto.randomUUID(),
      date: todayISO(),
      category: cat.id,
      amount: amt,
      description: qaDesc.trim(),
      location: '',
      loadNumber: '',
      deductPct: cat.deductPct,
      isDeductible: true,
      createdAt: new Date().toISOString(),
    }
    try {
      const raw = localStorage.getItem('3b-expenses')
      const all: Expense[] = raw ? JSON.parse(raw) : []
      all.unshift(expense)
      localStorage.setItem('3b-expenses', JSON.stringify(all))
    } catch { /* ignore */ }
    setQaAmount('')
    setQaDesc('')
    setQaAdding(false)
    setShowQuickAdd(false)
    refresh()
  }

  const todayTotal  = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const todayDeduct = todayExpenses.reduce((s, e) => s + e.amount * e.deductPct / 100, 0)
  const todayTaxSave = Math.round(todayDeduct * 0.25)

  return (
    <div className="cc-card">
      <ExpenseScanSheet
        open={showScan}
        onClose={() => setShowScan(false)}
        onSaved={() => { setShowScan(false); refresh() }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
        <span style={{ fontWeight: 800, fontSize: '1rem' }}>💵 Today</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowScan(true)}
            style={{ fontSize: '.72rem', fontWeight: 700, padding: '.3rem .7rem', borderRadius: 7, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', color: 'var(--primary)', cursor: 'pointer', minHeight: 34 }}>
            📷
          </button>
          <button onClick={() => setShowQuickAdd(v => !v)}
            style={{ fontSize: '.72rem', fontWeight: 700, padding: '.3rem .7rem', borderRadius: 7, border: '1px solid rgba(0,232,176,.3)', background: showQuickAdd ? 'rgba(0,232,176,.12)' : 'rgba(0,232,176,.06)', color: 'var(--primary)', cursor: 'pointer', minHeight: 34 }}>
            {showQuickAdd ? '✕' : '➕ Add'}
          </button>
          <Link href="/expenses" style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, padding: '.3rem .6rem', border: '1px solid var(--border)', borderRadius: 7, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>All →</Link>
        </div>
      </div>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: '1.6rem', lineHeight: 1, color: todayTotal > 0 ? 'var(--text)' : 'var(--faint)' }}>
        ${todayTotal.toFixed(2)}
      </div>
      {todayDeduct > 0 && <div style={{ fontSize: '.72rem', color: 'var(--primary)', marginTop: 3, fontWeight: 700 }}>~${todayTaxSave} tax savings</div>}

      {showQuickAdd && (
        <div style={{ marginTop: '.65rem', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {QUICK_CATS.map(c => (
              <button key={c.id} onClick={() => setQaCategory(c.id)}
                style={{ fontSize: '.65rem', fontWeight: 700, padding: '.25rem .5rem', borderRadius: 6, border: '1px solid', cursor: 'pointer',
                  background:   qaCategory === c.id ? 'rgba(0,232,176,.15)' : 'transparent',
                  borderColor:  qaCategory === c.id ? 'rgba(0,232,176,.4)'  : 'var(--border)',
                  color:        qaCategory === c.id ? 'var(--primary)'       : 'var(--muted)',
                }}>{c.emoji} {c.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" inputMode="decimal" placeholder="0.00"
              value={qaAmount} onChange={e => setQaAmount(e.target.value)}
              style={{ flex: '0 0 90px', padding: '.4rem .6rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
            <input type="text" placeholder="Note"
              value={qaDesc} onChange={e => setQaDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ flex: 1, padding: '.4rem .6rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.82rem' }} />
            <button onClick={handleAdd} disabled={qaAdding || !qaAmount}
              style={{ padding: '.4rem .75rem', borderRadius: 7, border: 'none', background: !qaAmount ? 'var(--surface-off)' : 'rgba(0,232,176,.15)', color: !qaAmount ? 'var(--muted)' : 'var(--primary)', fontWeight: 800, fontSize: '.8rem', cursor: !qaAmount ? 'not-allowed' : 'pointer', minHeight: 36 }}>✓</button>
          </div>
        </div>
      )}
    </div>
  )
}
