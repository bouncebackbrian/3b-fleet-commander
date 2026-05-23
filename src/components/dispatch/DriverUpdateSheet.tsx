'use client'
/**
 * DriverUpdateSheet — Mobile-first structured driver update sender.
 *
 * Driver picks an update type → fills location / notes / HOS →
 * postDriverUpdate() creates the update + alert + escalation (if needed).
 *
 * Designed to be fast enough to use while stopped — big buttons,
 * minimal typing, auto-fills location.
 */
import { useState, useEffect } from 'react'
import {
  postDriverUpdate,
  UPDATE_META,
  type UpdateType,
  type DriverUpdate,
} from '@/lib/dispatchEngine'

// ── Update type groups ────────────────────────────────────────────────────────

const UPDATE_GROUPS: { label: string; types: UpdateType[] }[] = [
  {
    label: 'Status',
    types: ['arrived_pickup', 'loaded', 'departed', 'delivered', 'pod_uploaded'],
  },
  {
    label: 'En Route',
    types: ['fuel_stop', 'break_started', 'break_ended', 'hos_update'],
  },
  {
    label: 'Issues',
    types: ['delay_reported', 'detention_started', 'detention_ended', 'issue_reported', 'accident_incident'],
  },
  {
    label: 'Custom',
    types: ['custom'],
  },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:        boolean
  onClose:     () => void
  loadNumber?: string
  driverName?: string
  onSent?:     (update: DriverUpdate) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DriverUpdateSheet({ open, onClose, loadNumber: defaultLoad, driverName: defaultDriver, onSent }: Props) {
  const [step,       setStep]       = useState<'type' | 'detail'>('type')
  const [selected,   setSelected]   = useState<UpdateType | null>(null)
  const [loadNum,    setLoadNum]    = useState(defaultLoad ?? '')
  const [driverName, setDriverName] = useState(defaultDriver ?? '')
  const [location,   setLocation]   = useState('')
  const [notes,      setNotes]      = useState('')
  const [hosDrive,   setHosDrive]   = useState('')
  const [hosShift,   setHosShift]   = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [sent,       setSent]       = useState(false)
  const [lastSent,   setLastSent]   = useState<DriverUpdate | null>(null)

  // Pre-fill from localStorage on open
  useEffect(() => {
    if (!open) return
    try {
      if (!defaultLoad) {
        const trip = localStorage.getItem('3b-active-trip')
        if (trip) {
          const t = JSON.parse(trip)
          if (t?.loadNumber) setLoadNum(t.loadNumber)
        }
      }
      if (!defaultDriver) {
        const settings = localStorage.getItem('3b-fleet-settings')
        if (settings) {
          const s = JSON.parse(settings)
          if (s?.driverName) setDriverName(s.driverName)
        }
      }
      const hos = localStorage.getItem('3b-hos-data')
      if (hos) {
        const h = JSON.parse(hos)
        if (h?.driveRemaining  != null) setHosDrive(String(h.driveRemaining))
        if (h?.shiftRemaining  != null) setHosShift(String(h.shiftRemaining))
      }
    } catch { /* ignore */ }
  }, [open, defaultLoad, defaultDriver])

  function reset() {
    setStep('type'); setSelected(null); setNotes(''); setSent(false); setLastSent(null)
  }

  function handleClose() { reset(); onClose() }

  function selectType(type: UpdateType) {
    setSelected(type)
    // Auto-jump to detail for critical types
    setStep('detail')
  }

  function getLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const a    = data.address || {}
          const city = a.city || a.town || a.village || a.county || ''
          const state = a.state || ''
          setLocation(city && state ? `${city}, ${state}` : data.display_name?.split(',').slice(0,2).join(', ') ?? '')
        } catch {
          setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
        }
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { timeout: 10000 }
    )
  }

  function send() {
    if (!selected) return
    const update = postDriverUpdate({
      type:       selected,
      loadNumber: loadNum || 'UNKNOWN',
      driverName: driverName || 'Driver',
      location,
      notes,
      hosDrive:   hosDrive ? parseFloat(hosDrive) : undefined,
      hosShift:   hosShift ? parseFloat(hosShift) : undefined,
    })
    setLastSent(update)
    setSent(true)
    onSent?.(update)
    setTimeout(() => { reset(); onClose() }, 2200)
  }

  if (!open) return null

  const meta = selected ? UPDATE_META[selected] : null
  const isCritical = meta?.severity === 'critical'
  const isWarning  = meta?.severity === 'warning'

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '22px 22px 0 0',
          padding: '1rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom))',
          maxHeight: '90dvh', overflowY: 'auto',
          border: '1px solid var(--border)', borderBottom: 'none',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto .9rem' }} />

        {/* Sent confirmation */}
        {sent && lastSent && (
          <div style={{
            textAlign: 'center', padding: '2rem 1rem',
            background: isCritical ? 'rgba(232,64,0,.08)' : 'rgba(0,232,176,.06)',
            borderRadius: 16, border: `1px solid ${isCritical ? 'rgba(232,64,0,.2)' : 'rgba(0,232,176,.18)'}`,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{isCritical ? '🚨' : '✅'}</div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: isCritical ? 'var(--error)' : 'var(--primary)' }}>
              Update Sent
            </div>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 4 }}>
              {UPDATE_META[lastSent.type].label}
              {isCritical && (
                <div style={{ marginTop: 6, color: 'var(--error)', fontWeight: 700 }}>
                  🚨 Dispatch has been notified — escalation created
                </div>
              )}
              {isWarning && (
                <div style={{ marginTop: 6, color: 'var(--warn)', fontWeight: 700 }}>
                  ⚠️ Dispatch alert created
                </div>
              )}
            </div>
          </div>
        )}

        {!sent && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>
                  {step === 'type' ? '📡 Send Update' : `${meta?.emoji} ${meta?.label}`}
                </div>
                {step === 'detail' && (
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                    {isCritical && <span style={{ color: 'var(--error)', fontWeight: 800 }}>🚨 CRITICAL — dispatch will be alerted immediately · </span>}
                    {isWarning  && <span style={{ color: 'var(--warn)',  fontWeight: 800 }}>⚠️ Warning — dispatch alert will be created · </span>}
                    {loadNum ? `Load #${loadNum}` : 'No load # set'}
                  </div>
                )}
              </div>
              {step === 'detail' ? (
                <button onClick={() => setStep('type')} style={btnSm}>← Back</button>
              ) : (
                <button onClick={handleClose} style={btnSm}>✕</button>
              )}
            </div>

            {/* Step 1: Type picker */}
            {step === 'type' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
                {/* Load # / driver quick-fill */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.25rem' }}>
                  <div>
                    <div style={fieldLabel}>Load #</div>
                    <input value={loadNum} onChange={e => setLoadNum(e.target.value)} placeholder="0241482" style={inp} />
                  </div>
                  <div>
                    <div style={fieldLabel}>Driver</div>
                    <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Your name" style={inp} />
                  </div>
                </div>

                {UPDATE_GROUPS.map(group => (
                  <div key={group.label}>
                    <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.4rem' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.4rem' }}>
                      {group.types.map(type => {
                        const m = UPDATE_META[type]
                        const isRed  = m.severity === 'critical'
                        const isAmber = m.severity === 'warning'
                        return (
                          <button
                            key={type}
                            onClick={() => selectType(type)}
                            style={{
                              padding: '.7rem .6rem',
                              borderRadius: 12,
                              border: `1px solid ${isRed ? 'rgba(232,64,0,.3)' : isAmber ? 'rgba(245,194,0,.3)' : 'var(--border)'}`,
                              background: isRed ? 'rgba(232,64,0,.06)' : isAmber ? 'rgba(245,194,0,.06)' : 'var(--surface-2)',
                              color: isRed ? 'var(--error)' : isAmber ? 'var(--warn)' : 'var(--text)',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 8,
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{m.emoji}</span>
                            <span style={{ fontSize: '.78rem', fontWeight: 700, lineHeight: 1.3 }}>{m.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Detail form */}
            {step === 'detail' && meta && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>

                {/* Critical banner */}
                {isCritical && (
                  <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'rgba(232,64,0,.09)', border: '1px solid rgba(232,64,0,.3)', color: 'var(--error)', fontWeight: 800, fontSize: '.85rem' }}>
                    🚨 This update will immediately escalate to dispatch and require acknowledgment.
                  </div>
                )}

                {/* Location */}
                <div>
                  <div style={fieldLabel}>Current Location</div>
                  <div style={{ display: 'flex', gap: '.45rem' }}>
                    <input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="City, ST or milestone"
                      style={{ ...inp, flex: 1 }}
                    />
                    <button onClick={getLocation} disabled={geoLoading} style={{ ...btnSm, padding: '.55rem .7rem', flexShrink: 0, fontSize: '.8rem', opacity: geoLoading ? .6 : 1 }}>
                      {geoLoading ? '…' : '📍'}
                    </button>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div style={fieldLabel}>Notes {isCritical ? '(required)' : '(optional)'}</div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={
                      isCritical    ? 'Describe the incident clearly…' :
                      isWarning     ? 'What caused the delay / issue?' :
                      selected === 'detention_started' ? 'Facility not ready — detention clock started' :
                      selected === 'fuel_stop'  ? 'Fuel stop, approx 15 min' :
                      selected === 'hos_update' ? 'Drive hours remaining, current status…' :
                      'Additional details…'
                    }
                    rows={isCritical ? 4 : 2}
                    style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
                  />
                </div>

                {/* HOS fields for relevant types */}
                {(selected === 'hos_update' || selected === 'departed' || selected === 'break_ended') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                    <div>
                      <div style={fieldLabel}>Drive hrs remaining</div>
                      <input type="number" step="0.1" value={hosDrive} onChange={e => setHosDrive(e.target.value)} placeholder="e.g. 8.5" style={inp} />
                    </div>
                    <div>
                      <div style={fieldLabel}>Shift hrs remaining</div>
                      <input type="number" step="0.1" value={hosShift} onChange={e => setHosShift(e.target.value)} placeholder="e.g. 11.0" style={inp} />
                    </div>
                  </div>
                )}

                {/* Send button */}
                <button
                  onClick={send}
                  disabled={isCritical && !notes.trim()}
                  style={{
                    width: '100%', padding: '1rem', borderRadius: 14, border: 'none', cursor: 'pointer',
                    fontWeight: 900, fontSize: '1rem',
                    background: isCritical ? 'var(--error)' : isWarning ? 'rgba(245,194,0,.9)' : 'var(--primary)',
                    color: isCritical ? '#fff' : isWarning ? '#1a0f00' : '#061210',
                    opacity: isCritical && !notes.trim() ? .5 : 1,
                    boxShadow: isCritical ? '0 4px 20px rgba(232,64,0,.35)' : '0 4px 16px rgba(0,232,176,.25)',
                  }}
                >
                  {meta.emoji} Send {meta.label}
                  {isCritical && ' — Alert Dispatch'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const btnSm: React.CSSProperties = {
  padding: '.4rem .75rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--muted)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '.55rem .8rem', borderRadius: 9,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
}

const fieldLabel: React.CSSProperties = {
  fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4,
}
