'use client'
import { useState, useEffect, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'

// ── Types ─────────────────────────────────────────────────────────────────────
type Expense = {
  id:            string
  date:          string     // YYYY-MM-DD
  category:      string
  amount:        number
  description:   string
  location:      string
  loadNumber:    string
  deductPct:     number     // 0-100
  isDeductible:  boolean
  createdAt:     string
}

type FilterPeriod = 'today' | 'week' | 'month' | 'year' | 'all'

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'fuel',    label: 'Fuel / DEF',        emoji: '⛽', deduct: 100, note: 'Sch. C Line 9'   },
  { id: 'parking', label: 'Parking / Scales',  emoji: '🅿️', deduct: 100, note: 'Sch. C Line 26'  },
  { id: 'tolls',   label: 'Tolls',             emoji: '🛣️', deduct: 100, note: 'Sch. C Line 26'  },
  { id: 'meals',   label: 'Meals (80%)',        emoji: '🍔', deduct: 80,  note: 'Sch. C Line 24b' },
  { id: 'lodging', label: 'Lodging',            emoji: '🏨', deduct: 100, note: 'Sch. C Line 24a' },
  { id: 'repairs', label: 'Repairs / Maint.',   emoji: '🔧', deduct: 100, note: 'Sch. C Line 21'  },
  { id: 'supplies',label: 'Supplies / Safety',  emoji: '🧤', deduct: 100, note: 'Sch. C Line 22'  },
  { id: 'lumper',  label: 'Lumper Fees',        emoji: '📦', deduct: 100, note: 'Sch. C Line 26'  },
  { id: 'dot',     label: 'DOT Physical',       emoji: '💊', deduct: 100, note: 'Sch. C Line 26'  },
  { id: 'license', label: 'CDL / License',      emoji: '📋', deduct: 100, note: 'Sch. C Line 23'  },
  { id: 'phone',   label: 'Phone (biz use)',    emoji: '📱', deduct: 100, note: 'Sch. C Line 25'  },
  { id: 'eld',     label: 'ELD / Tech',         emoji: '🖥️', deduct: 100, note: 'Sch. C Line 18'  },
  { id: 'def',     label: 'Oil / Fluids',       emoji: '🛢️', deduct: 100, note: 'Sch. C Line 9'   },
  { id: 'other',   label: 'Other',              emoji: '❓', deduct: 100, note: 'Verify w/ CPA'   },
] as const

type CatId = typeof CATEGORIES[number]['id']

const cat = (id: string) => CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]

const STORAGE_KEY = '3b-expenses'

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10)

function periodStart(p: FilterPeriod): string {
  const d = new Date()
  if (p === 'today') return today()
  if (p === 'week')  { d.setDate(d.getDate() - 7);   return d.toISOString().slice(0, 10) }
  if (p === 'month') { d.setDate(1);                  return d.toISOString().slice(0, 10) }
  if (p === 'year')  { d.setMonth(0, 1);              return d.toISOString().slice(0, 10) }
  return '2000-01-01'
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function exportCSV(expenses: Expense[]) {
  const header = 'Date,Category,Amount,Deductible %,Deductible $,Description,Location,Load #'
  const rows = expenses.map(e => {
    const deductAmt = (e.amount * e.deductPct / 100).toFixed(2)
    return [
      e.date, cat(e.category).label, e.amount.toFixed(2),
      `${e.deductPct}%`, deductAmt,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.location.replace(/"/g, '""')}"`,
      e.loadNumber,
    ].join(',')
  })
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `expenses-${today()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  card:  { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', boxShadow: '0 2px 8px rgba(0,0,0,.2)' } as React.CSSProperties,
  inp:   { width: '100%', padding: '.6rem .85rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  lbl:   { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 } as React.CSSProperties,
  sec:   { fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)', paddingBottom: '.5rem', borderBottom: '1px solid var(--border)', marginBottom: '.9rem' } as React.CSSProperties,
  btnPri:{ padding: '.7rem 1.2rem', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: 'var(--text-sm)', cursor: 'pointer' } as React.CSSProperties,
  btn:   { padding: '.55rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' } as React.CSSProperties,
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [expenses,    setExpenses]    = useState<Expense[]>([])
  const [filter,      setFilter]      = useState<FilterPeriod>('month')
  const [selectedCat, setSelectedCat] = useState<CatId>('fuel')
  const [amount,      setAmount]      = useState('')
  const [description, setDescription] = useState('')
  const [location,    setLocation]    = useState('')
  const [loadNumber,  setLoadNumber]  = useState('')
  const [dateVal,     setDateVal]     = useState(today())
  const [geoLoading,  setGeoLoading]  = useState(false)
  const [added,       setAdded]       = useState(false)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setExpenses(JSON.parse(raw))
      // Pre-fill load number from active trip
      const trip = localStorage.getItem('3b-active-trip')
      if (trip) {
        const t = JSON.parse(trip)
        if (t?.loadNumber) setLoadNumber(t.loadNumber)
      }
    } catch { /* ignore */ }
  }, [])

  function save(list: Expense[]) {
    setExpenses(list)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  }

  function addExpense() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { amountRef.current?.focus(); return }
    const c = cat(selectedCat)
    const entry: Expense = {
      id:           crypto.randomUUID(),
      date:         dateVal,
      category:     selectedCat,
      amount:       Math.round(amt * 100) / 100,
      description,
      location,
      loadNumber,
      deductPct:    c.deduct,
      isDeductible: c.deduct > 0,
      createdAt:    new Date().toISOString(),
    }
    save([entry, ...expenses])
    setAmount(''); setDescription(''); setAdded(true)
    setTimeout(() => setAdded(false), 2000)
    amountRef.current?.focus()
  }

  function getGeoLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const a = data.address || {}
          const city = a.city || a.town || a.village || a.county || ''
          const state = a.state || ''
          setLocation(city && state ? `${city}, ${state}` : data.display_name?.split(',').slice(0, 2).join(', ') ?? '')
        } catch { setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`) }
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { timeout: 10000 }
    )
  }

  // Filtered expenses
  const start   = periodStart(filter)
  const visible = expenses.filter(e => e.date >= start).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  // Summary totals
  const totalSpent    = visible.reduce((s, e) => s + e.amount, 0)
  const totalDeduct   = visible.reduce((s, e) => s + e.amount * e.deductPct / 100, 0)
  const taxSaved      = totalDeduct * 0.25   // estimated 25% bracket
  const byCategory    = CATEGORIES.map(c => ({
    ...c,
    total: visible.filter(e => e.category === c.id).reduce((s, e) => s + e.amount, 0),
    count: visible.filter(e => e.category === c.id).length,
  })).filter(c => c.total > 0)

  const activeCat = cat(selectedCat)

  return (
    <>
      <TopBar title="Expense Tracker" module="ops" subtitle="Tax-deductible road expenses — IRS Schedule C" />

      <style>{`
        @media (max-width: 768px) {
          .expenses-main { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: '.75rem', padding: '1rem 1.2rem 0', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        {[
          { label: 'Total spent',    value: money(totalSpent),  color: 'var(--text)',    sub: `${visible.length} entries` },
          { label: 'Tax deductible', value: money(totalDeduct), color: 'var(--success)', sub: `${totalSpent > 0 ? Math.round(totalDeduct / totalSpent * 100) : 0}% of expenses` },
          { label: '~Tax saved',     value: money(taxSaved),    color: 'var(--primary)', sub: 'est. 25% bracket' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem 1rem' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      <main className="expenses-main" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,360px) 1fr', gap: '1.2rem', padding: '1.2rem', alignItems: 'start' }}>

        {/* ── LEFT: Add Expense ── */}
        <div style={{ display: 'grid', gap: '.75rem' }}>
          <div style={S.card}>
            <div style={S.sec}>➕ Add Expense</div>

            {/* Category picker */}
            <div style={{ marginBottom: '.85rem' }}>
              <label style={S.lbl}>Category</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.35rem' }}>
                {CATEGORIES.map(c => (
                  <button key={c.id} onClick={() => setSelectedCat(c.id as CatId)}
                    title={`${c.label} — ${c.deduct}% deductible · ${c.note}`}
                    style={{
                      padding: '.5rem .2rem', borderRadius: 8, border: `1px solid ${selectedCat === c.id ? 'rgba(0,232,176,.4)' : 'var(--border)'}`,
                      background: selectedCat === c.id ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                    <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{c.emoji}</span>
                    <span style={{ fontSize: '.52rem', fontWeight: 700, color: selectedCat === c.id ? 'var(--primary)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.2, letterSpacing: '.01em' }}>
                      {c.label.length > 10 ? c.label.slice(0, 10) : c.label}
                    </span>
                  </button>
                ))}
              </div>
              {/* Selected category detail */}
              <div style={{ marginTop: '.6rem', padding: '.45rem .75rem', background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text)' }}>{activeCat.emoji} {activeCat.label}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '.6rem', color: 'var(--primary)', fontWeight: 800 }}>{activeCat.deduct}% deductible</span>
                  <span style={{ fontSize: '.58rem', color: 'var(--faint)', marginLeft: 6 }}>{activeCat.note}</span>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div style={{ marginBottom: '.75rem' }}>
              <label style={S.lbl}>Amount *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>$</span>
                <input
                  ref={amountRef}
                  type="text" inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addExpense()}
                  placeholder="0.00"
                  style={{ ...S.inp, paddingLeft: '1.6rem', fontSize: '1.3rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
              {amount && parseFloat(amount) > 0 && activeCat.deduct > 0 && (
                <div style={{ fontSize: '.65rem', color: 'var(--success)', marginTop: 4, fontWeight: 700 }}>
                  ✅ ${(parseFloat(amount) * activeCat.deduct / 100).toFixed(2)} deductible ({activeCat.deduct}%)
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: '.75rem' }}>
              <label style={S.lbl}>Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExpense()} placeholder="e.g. Love's #478 diesel fill" style={S.inp} />
            </div>

            {/* Location */}
            <div style={{ marginBottom: '.75rem' }}>
              <label style={S.lbl}>Location</label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, ST" style={{ ...S.inp, flex: 1 }} />
                <button onClick={getGeoLocation} disabled={geoLoading} title="Use GPS location"
                  style={{ ...S.btn, padding: '.55rem .7rem', flexShrink: 0, fontSize: '.75rem', opacity: geoLoading ? .6 : 1 }}>
                  {geoLoading ? '…' : '📍'}
                </button>
              </div>
            </div>

            {/* Date + Load # */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem', marginBottom: '.9rem' }}>
              <div>
                <label style={S.lbl}>Date</label>
                <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} style={S.inp} />
              </div>
              <div>
                <label style={S.lbl}>Load # (opt.)</label>
                <input value={loadNumber} onChange={e => setLoadNumber(e.target.value)} placeholder="optional" style={S.inp} />
              </div>
            </div>

            <button onClick={addExpense} style={{ ...S.btnPri, width: '100%', padding: '.85rem', textAlign: 'center', background: added ? 'var(--success)' : 'var(--primary)' }}>
              {added ? '✅ Added!' : `➕ Add ${activeCat.emoji} ${activeCat.label}`}
            </button>
          </div>

          {/* By category breakdown */}
          {byCategory.length > 0 && (
            <div style={S.card}>
              <div style={S.sec}>By Category</div>
              <div style={{ display: 'grid', gap: '.4rem' }}>
                {byCategory.sort((a, b) => b.total - a.total).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.45rem .65rem', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{c.emoji}</span> {c.label}
                      <span style={{ fontSize: '.6rem', color: 'var(--faint)' }}>×{c.count}</span>
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(c.total)}</div>
                      <div style={{ fontSize: '.58rem', color: 'var(--success)' }}>{money(c.total * c.deduct / 100)} deduct.</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
            <button onClick={() => exportCSV(visible)} disabled={visible.length === 0}
              style={{ ...S.btnPri, textAlign: 'center', padding: '.75rem', fontSize: 'var(--text-xs)', opacity: visible.length === 0 ? .5 : 1 }}>
              📥 Export CSV
            </button>
            <button onClick={() => exportCSV(expenses)} disabled={expenses.length === 0}
              style={{ ...S.btn, textAlign: 'center', padding: '.75rem', fontSize: 'var(--text-xs)', opacity: expenses.length === 0 ? .5 : 1 }}>
              📥 All-time CSV
            </button>
          </div>

          {/* Tax info card */}
          <div style={{ ...S.card, border: '1px solid rgba(0,232,176,.15)', background: 'rgba(0,232,176,.03)' }}>
            <div style={{ ...S.sec, color: 'var(--primary)' }}>📋 IRS Schedule C — Owner-Operator</div>
            <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>100% deductible:</strong> Fuel, DEF, parking, scales, tolls, lumper fees, repairs, maintenance, DOT physicals, CDL renewal, ELD, supplies, lodging away from home, business phone.
              <br /><br />
              <strong style={{ color: 'var(--text)' }}>80% deductible:</strong> Meals while away from home overnight for business (IRS §162(a)).
              <br /><br />
              <strong style={{ color: 'var(--warn)' }}>⚠️ Keep all receipts.</strong> Digital photos count. Consult a CPA for exact deductibility — especially mixed-use items.
            </div>
          </div>
        </div>

        {/* ── RIGHT: Expense list ── */}
        <div>
          {/* Filter tabs */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: 3, gap: 2, marginBottom: '1rem' }}>
            {([['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year'], ['all', 'All Time']] as [FilterPeriod, string][]).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{ flex: 1, padding: '.45rem .3rem', borderRadius: 8, fontSize: 'var(--text-xs)', fontWeight: 700, border: filter === id ? '1px solid var(--border)' : '1px solid transparent', background: filter === id ? 'var(--surface-2)' : 'transparent', color: filter === id ? 'var(--text)' : 'var(--muted)', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem' }}>🧾</div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--text)' }}>No expenses yet</div>
              <div style={{ fontSize: 'var(--text-sm)', maxWidth: 320, lineHeight: 1.65 }}>
                Add your first expense on the left. Every receipt you log is a potential tax deduction — fuel, meals, parking, repairs, and more.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.6rem' }}>
              {visible.map(e => {
                const c = cat(e.category)
                const deductAmt = e.amount * e.deductPct / 100
                return (
                  <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '.85rem 1rem', display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: '.75rem', alignItems: 'start' }}>
                    {/* Icon */}
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                      {c.emoji}
                    </div>

                    {/* Details */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontWeight: 900, fontSize: 'var(--text-sm)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(e.amount)}</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700 }}>{c.label}</span>
                        {e.deductPct === 100
                          ? <span style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--success)', background: 'rgba(40,192,72,.1)', border: '1px solid rgba(40,192,72,.2)', borderRadius: 4, padding: '.1rem .35rem' }}>100% deduct.</span>
                          : e.deductPct > 0
                            ? <span style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--warn)', background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.2)', borderRadius: 4, padding: '.1rem .35rem' }}>{e.deductPct}% deduct. = {money(deductAmt)}</span>
                            : null
                        }
                      </div>
                      {e.description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', lineHeight: 1.4, marginBottom: 2 }}>{e.description}</div>}
                      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', fontSize: '.62rem', color: 'var(--faint)' }}>
                        <span>📅 {e.date}</span>
                        {e.location && <span>📍 {e.location}</span>}
                        {e.loadNumber && <span>📦 Load #{e.loadNumber}</span>}
                      </div>
                    </div>

                    {/* Delete */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {deleteId === e.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { save(expenses.filter(x => x.id !== e.id)); setDeleteId(null) }}
                            style={{ padding: '.25rem .5rem', borderRadius: 6, border: 'none', background: 'var(--error)', color: '#fff', fontSize: '.6rem', fontWeight: 800, cursor: 'pointer' }}>
                            Delete
                          </button>
                          <button onClick={() => setDeleteId(null)}
                            style={{ padding: '.25rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteId(e.id)}
                          style={{ padding: '.25rem .45rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--faint)', fontSize: '.7rem', cursor: 'pointer', lineHeight: 1 }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
