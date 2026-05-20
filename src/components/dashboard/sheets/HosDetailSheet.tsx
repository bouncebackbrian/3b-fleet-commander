'use client'
import HOSBar from '../shared/HOSBar'
import type { HOSDisplay, EldMode } from '@/lib/dashboard/types'

interface Props {
  open:        boolean
  onClose:     () => void
  hosDisplay:  HOSDisplay | null
  statusLabel: string | null
  statusColor: string
  driveColor:  string
  shiftColor:  string
  hosScanning: boolean
  eldMode:     EldMode
  onScanClick: () => void
  onStartBreak: () => void
}

export default function HosDetailSheet({
  open, onClose, hosDisplay, statusLabel, statusColor,
  driveColor, shiftColor, hosScanning, eldMode, onScanClick, onStartBreak,
}: Props) {
  if (!open) return null
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.2)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '85dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>⏱ HOS Detail</div>
            {statusLabel && (
              <div style={{ fontSize: '.72rem', color: statusColor, fontWeight: 700, marginTop: 2 }}>
                ● {statusLabel} {hosDisplay?.source === 'samsara' ? '— LIVE' : '— from scan'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {eldMode === 'screenshot' && (
              <button onClick={onScanClick} disabled={hosScanning}
                style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', color: 'var(--primary)', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', minHeight: 36 }}>
                {hosScanning ? '⏳' : '📷 Scan'}
              </button>
            )}
            <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        {hosDisplay ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
              {[
                { label: 'Drive Rem',  val: `${hosDisplay.driveRem.toFixed(1)}h`,  color: driveColor },
                { label: 'Shift Rem',  val: `${hosDisplay.shiftRem.toFixed(1)}h`,  color: shiftColor },
                { label: 'Drive Used', val: `${hosDisplay.driveUsed.toFixed(1)}h`, color: 'var(--muted)' },
                { label: 'On-Duty',    val: `${hosDisplay.shiftUsed.toFixed(1)}h`, color: 'var(--muted)' },
                ...(hosDisplay.cycleRem != null ? [{ label: 'Cycle Rem', val: `${hosDisplay.cycleRem.toFixed(1)}h`, color: 'var(--text)' }] : []),
                ...(hosDisplay.breakIn  != null ? [{ label: 'Break In',  val: `${hosDisplay.breakIn.toFixed(1)}h`,  color: hosDisplay.breakIn < 1 ? 'var(--error)' : 'var(--warn)' }] : []),
              ].map(f => (
                <div key={f.label} style={{ textAlign: 'center', padding: '.65rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontWeight: 900, fontSize: '1.3rem', color: f.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{f.val}</div>
                </div>
              ))}
            </div>
            <HOSBar label={`Drive — ${hosDisplay.driveUsed.toFixed(1)}h of 11h`} used={hosDisplay.driveUsed} total={11} color={driveColor} />
            <HOSBar label={`On-duty — ${hosDisplay.shiftUsed.toFixed(1)}h of 14h`} used={hosDisplay.shiftUsed} total={14} color={shiftColor} />
            {hosDisplay.driveRem <= 2 && (
              <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.25)', fontSize: '.88rem', color: 'var(--error)', fontWeight: 800 }}>
                🛑 HOS CRITICAL — Mandatory stop approaching. Find parking immediately.
              </div>
            )}
            {hosDisplay.breakIn != null && hosDisplay.breakIn < 1 && (
              <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.25)', fontSize: '.88rem', color: 'var(--warn)', fontWeight: 800 }}>
                ⏸ 30-min break due in {Math.ceil(hosDisplay.breakIn * 60)} min
              </div>
            )}
            <button onClick={() => { onClose(); onStartBreak() }}
              style={{ padding: '1rem', borderRadius: 12, border: '1px solid rgba(245,194,0,.3)', background: 'rgba(245,194,0,.07)', color: 'var(--warn)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer', minHeight: 56 }}>
              ☕ Start Break Timer
            </button>
          </div>
        ) : (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⏱</div>
            No HOS data — scan your ELD screenshot to populate.
          </div>
        )}
      </div>
    </>
  )
}
