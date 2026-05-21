'use client'
import { useState } from 'react'
import type { MissionStop, StopType } from '@/lib/dashboard/types'

type Position = 'after_current' | 'before_final' | 'end'

interface Props {
  open:        boolean
  onClose:     () => void
  onAdd:       (stop: MissionStop, position: Position) => void
  driverMode?: boolean
}

// Operational flag: true = visible in Driver Mode; false = owner/operator only
const STOP_TYPES: { type: StopType; emoji: string; label: string; operational: boolean }[] = [
  { type: 'pickup',   emoji: '📦', label: 'Pickup',   operational: false },
  { type: 'delivery', emoji: '🏪', label: 'Delivery', operational: false },
  { type: 'relay',    emoji: '🔄', label: 'Relay',    operational: false },
  { type: 'fuel',     emoji: '⛽', label: 'Fuel',     operational: true  },
  { type: 'rest',     emoji: '🛏️', label: 'Rest',     operational: true  },
  { type: 'scale',    emoji: '⚖️',  label: 'Scale',    operational: true  },
  { type: 'repair',   emoji: '🔧', label: 'Repair',   operational: true  },
  { type: 'washout',  emoji: '🚿', label: 'Washout',  operational: true  },
  { type: 'yard',     emoji: '🏠', label: 'Yard',     operational: true  },
  { type: 'other',    emoji: '📍', label: 'Other',    operational: true  },
]

const POSITIONS = [
  { val: 'after_current' as Position, label: 'Next Stop',    desc: 'After current' },
  { val: 'before_final'  as Position, label: 'Before Final', desc: 'Before delivery' },
  { val: 'end'           as Position, label: 'End',          desc: 'Last stop' },
]

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '.6rem .75rem', fontSize: '.9rem', color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '.08em', color: 'var(--muted)', display: 'block', marginBottom: '.35rem',
}

export default function AddStopSheet({ open, onClose, onAdd, driverMode = false }: Props) {
  const [type,     setType]     = useState<StopType>('fuel')
  const [name,     setName]     = useState('')
  const [address,  setAddress]  = useState('')
  const [city,     setCity]     = useState('')
  const [stateCd,  setStateCd]  = useState('')
  const [phone,    setPhone]    = useState('')
  const [appt,     setAppt]     = useState('')
  const [notes,    setNotes]    = useState('')
  const [position, setPosition] = useState<Position>('after_current')

  const available = driverMode
    ? STOP_TYPES.filter(t => t.operational)
    : STOP_TYPES

  const reset = () => {
    setType('fuel'); setName(''); setAddress(''); setCity(''); setStateCd('')
    setPhone(''); setAppt(''); setNotes(''); setPosition('after_current')
  }

  const handleAdd = () => {
    if (!name.trim()) return
    const stop: MissionStop = {
      id:               crypto.randomUUID(),
      sequence:         0,           // re-sequenced by insertStop
      type,
      name:             name.trim(),
      address:          address.trim()  || undefined,
      city:             city.trim()     || undefined,
      state:            stateCd.trim()  || undefined,
      phone:            phone.trim()    || undefined,
      appointmentStart: appt            || undefined,
      notes:            notes.trim()    || undefined,
    }
    onAdd(stop, position)
    reset()
    onClose()
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2rem',
        boxShadow: '0 -4px 30px rgba(0,0,0,.35)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.2rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>➕ Add Stop</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', padding: '.2rem .4rem', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Stop type chips */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={LABEL}>Stop Type</div>
          <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
            {available.map(t => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                style={{
                  padding: '.38rem .72rem', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
                  border:      type === t.type ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background:  type === t.type ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                  color:       type === t.type ? 'var(--primary)' : 'var(--muted)',
                  transition: 'all .15s',
                }}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Location name */}
        <div style={{ marginBottom: '.85rem' }}>
          <label style={LABEL}>Location / Facility Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Love's Travel Stop, Flying J, DC #42…"
            style={INPUT}
          />
        </div>

        {/* Street address */}
        <div style={{ marginBottom: '.85rem' }}>
          <label style={LABEL}>Street Address</label>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="123 Industrial Blvd, Building A…"
            style={INPUT}
          />
        </div>

        {/* City + State */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: '.65rem', marginBottom: '.85rem' }}>
          <div>
            <label style={LABEL}>City</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="City"
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>State</label>
            <input
              value={stateCd}
              onChange={e => setStateCd(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="TX"
              maxLength={2}
              style={{ ...INPUT, textTransform: 'uppercase' }}
            />
          </div>
        </div>

        {/* Phone number */}
        <div style={{ marginBottom: '.85rem' }}>
          <label style={LABEL}>Phone Number</label>
          <input
            type="text"
            inputMode="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(800) 555-0100"
            style={INPUT}
          />
        </div>

        {/* Appointment */}
        <div style={{ marginBottom: '.85rem' }}>
          <label style={LABEL}>Appointment (optional)</label>
          <input
            type="datetime-local"
            value={appt}
            onChange={e => setAppt(e.target.value)}
            style={INPUT}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '1.1rem' }}>
          <label style={LABEL}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Gate code, dock number, special instructions…"
            rows={2}
            style={{ ...INPUT, resize: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* Insert position */}
        <div style={{ marginBottom: '1.3rem' }}>
          <div style={LABEL}>Insert Position</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.45rem' }}>
            {POSITIONS.map(p => (
              <button
                key={p.val}
                onClick={() => setPosition(p.val)}
                style={{
                  padding: '.55rem .45rem', borderRadius: 9, cursor: 'pointer', textAlign: 'center',
                  border:     position === p.val ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: position === p.val ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
                  transition: 'all .15s',
                }}
              >
                <div style={{ fontSize: '.73rem', fontWeight: 800, color: position === p.val ? 'var(--primary)' : 'var(--text)' }}>
                  {p.label}
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          style={{
            width: '100%', padding: '.9rem', borderRadius: 12, fontWeight: 900, fontSize: '.95rem',
            border: 'none', cursor: name.trim() ? 'pointer' : 'not-allowed',
            background: name.trim() ? 'var(--primary)' : 'var(--surface-2)',
            color:      name.trim() ? '#000' : 'var(--muted)',
            transition: 'opacity .15s',
          }}
        >
          Add Stop to Mission
        </button>
      </div>
    </>
  )
}
