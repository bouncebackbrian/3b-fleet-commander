'use client'
/**
 * BrokerPicker — select a broker from the directory (src/lib/fleet/dumpTruck/brokers.ts),
 * or quick-add a new one inline (name only — the rest can be filled in later).
 * Shared by the admin Jobs form and the Broker portal's "Propose New Deal" form.
 */
import { useState } from 'react'

export interface BrokerOption {
  id: string
  name: string
}

const selectStyle: React.CSSProperties = {
  padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', width: '100%',
}

export default function BrokerPicker({ brokers, brokerId, onChange, onBrokerCreated }: {
  brokers: BrokerOption[]
  brokerId: string | null
  onChange: (brokerId: string | null, brokerName: string) => void
  onBrokerCreated: (broker: BrokerOption) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const addBroker = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/brokers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not add broker')
      const { broker } = await res.json()
      onBrokerCreated({ id: broker.id, name: broker.name })
      onChange(broker.id, broker.name)
      setNewName('')
      setAdding(false)
    } catch {
      // caller's toast/error handling is out of scope here — keep the inline form open to retry
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={selectStyle} autoFocus placeholder="Broker company name"
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addBroker() }}
        />
        <button
          onClick={addBroker} disabled={saving || !newName.trim()}
          style={{ padding: '0 .8rem', borderRadius: 8, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.78rem', opacity: saving ? .5 : 1 }}
        >
          {saving ? '…' : 'Add'}
        </button>
        <button
          onClick={() => { setAdding(false); setNewName('') }}
          style={{ padding: '0 .6rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem' }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <select
      style={selectStyle}
      value={brokerId ?? ''}
      onChange={e => {
        if (e.target.value === '__add__') { setAdding(true); return }
        const b = brokers.find(x => x.id === e.target.value)
        onChange(b?.id ?? null, b?.name ?? '')
      }}
    >
      <option value="">— None —</option>
      {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      <option value="__add__">+ Add new broker…</option>
    </select>
  )
}
