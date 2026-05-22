'use client'
import Link from 'next/link'
import type { HOSDisplay, VehicleSetup } from '@/lib/dashboard/types'

interface Props {
  liveClock:    string
  liveDate:     string
  vehicle:      VehicleSetup | null
  hosDisplay:   HOSDisplay | null
  driveColor:   string
  shiftColor:   string
  breakActive:  boolean
  breakSecs:    number
  fmtBreak:     (s: number) => string
  resetActive?: boolean
  onNewLoad:    () => void
  onStartBreak: () => void
  onShowHos:    () => void
  onShowFuel:   () => void
  onShowDocs:   () => void
  onShowReset?: () => void
  onEmergency:  () => void
}

export default function StatusBar({
  liveClock, liveDate, vehicle, hosDisplay, driveColor, shiftColor,
  breakActive, breakSecs, fmtBreak,
  resetActive = false,
  onNewLoad, onStartBreak, onShowHos, onShowFuel, onShowDocs, onShowReset, onEmergency,
}: Props) {
  return (
    <div className="cc-status-bar">
      {/* Clock */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(1.5rem,2.5vw,2rem)', letterSpacing: '-.03em', lineHeight: 1, color: 'var(--text)' }}>{liveClock}</div>
        <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>{liveDate}</div>
      </div>

      {/* Asset chips */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        {vehicle?.truckNum && (
          <div style={{ background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.18)', borderRadius: 8, padding: '.3rem .65rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)' }}>Truck</div>
            <div style={{ fontWeight: 900, fontSize: '.9rem', fontVariantNumeric: 'tabular-nums' }}>#{vehicle.truckNum}</div>
          </div>
        )}
        {vehicle?.trailerNum && (
          <div style={{ background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.18)', borderRadius: 8, padding: '.3rem .65rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)' }}>Trailer</div>
            <div style={{ fontWeight: 900, fontSize: '.9rem', fontVariantNumeric: 'tabular-nums' }}>#{vehicle.trailerNum}</div>
          </div>
        )}
        {!vehicle && (
          <Link href="/settings" style={{ padding: '.3rem .65rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.72rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>🚛 Setup</Link>
        )}
      </div>

      <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0 }} />

      {/* 6 Quick Action Buttons */}
      <div className="cc-qab-row">
        <button className="cc-qab cc-qab-primary" onClick={onNewLoad}>
          <span className="cc-qab-icon">＋</span>
          <span className="cc-qab-label">New Load</span>
        </button>
        <button className="cc-qab" onClick={onStartBreak}
          style={breakActive ? { background: 'rgba(245,194,0,.12)', borderColor: 'rgba(245,194,0,.3)', color: 'var(--warn)' } : undefined}>
          <span className="cc-qab-icon">{breakActive ? '⏸' : '☕'}</span>
          <span className="cc-qab-label">{breakActive ? fmtBreak(breakSecs) : 'Start Break'}</span>
        </button>
        <button className="cc-qab" onClick={onShowHos}>
          <span className="cc-qab-icon">⏱</span>
          <span className="cc-qab-label">Check HOS</span>
        </button>
        <button className="cc-qab" onClick={onShowFuel}>
          <span className="cc-qab-icon">⛽</span>
          <span className="cc-qab-label">Fuel Plan</span>
        </button>
        <button className="cc-qab" onClick={onShowDocs}>
          <span className="cc-qab-icon">📄</span>
          <span className="cc-qab-label">Scan Doc</span>
        </button>
        <button className="cc-qab" onClick={onShowReset}
          style={resetActive ? { background: 'rgba(245,194,0,.12)', borderColor: 'rgba(245,194,0,.3)', color: 'var(--warn)' } : undefined}>
          <span className="cc-qab-icon">{resetActive ? '⏸' : '🛌'}</span>
          <span className="cc-qab-label">{resetActive ? 'Resting' : 'Reset'}</span>
        </button>
        <button className="cc-qab cc-qab-emergency" onClick={onEmergency}>
          <span className="cc-qab-icon">🚨</span>
          <span className="cc-qab-label">Emergency</span>
        </button>
      </div>

      {/* HOS glance pills */}
      {hosDisplay && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
          <div style={{ textAlign: 'center', padding: '.3rem .7rem', borderRadius: 8, background: `${driveColor}18`, border: `1px solid ${driveColor}35` }}>
            <div style={{ fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: driveColor }}>Drive</div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: driveColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{hosDisplay.driveRem.toFixed(1)}h</div>
          </div>
          <div style={{ textAlign: 'center', padding: '.3rem .7rem', borderRadius: 8, background: `${shiftColor}18`, border: `1px solid ${shiftColor}35` }}>
            <div style={{ fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: shiftColor }}>Shift</div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: shiftColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{hosDisplay.shiftRem.toFixed(1)}h</div>
          </div>
          {hosDisplay.cycleRem != null && (
            <div style={{ textAlign: 'center', padding: '.3rem .7rem', borderRadius: 8, background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.15)' }}>
              <div style={{ fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Cycle</div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{hosDisplay.cycleRem.toFixed(1)}h</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
