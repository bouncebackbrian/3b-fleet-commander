'use client'
import HOSBar from '../shared/HOSBar'
import type { HOSDisplay, EldMode, SamsaraData } from '@/lib/dashboard/types'

interface Props {
  hosDisplay:  HOSDisplay | null
  hosError:    string
  hosScanning: boolean
  eldMode:     EldMode
  setEldMode:  (m: EldMode) => void
  driveColor:  string
  shiftColor:  string
  statusLabel: string | null
  statusColor: string
  samsara:     SamsaraData | null
  onScanClick: () => void
  onClearHos:  () => void
}

export default function HosCard({
  hosDisplay, hosError, hosScanning, eldMode, setEldMode,
  driveColor, shiftColor, statusLabel, statusColor,
  samsara, onScanClick, onClearHos,
}: Props) {
  return (
    <div className="cc-card" style={{ border: `1px solid ${hosDisplay ? 'rgba(0,232,176,.2)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>HOS Status</span>
          {statusLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '.2rem .65rem', borderRadius: 6, background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
              <span style={{ fontSize: '.72rem', fontWeight: 800, color: statusColor }}>{statusLabel}</span>
            </div>
          )}
          {hosDisplay?.source === 'samsara' && (
            <span style={{ fontSize: '.6rem', color: 'var(--success)', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 4, background: 'rgba(40,192,72,.1)', border: '1px solid rgba(40,192,72,.2)' }}>LIVE</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ display: 'flex', background: 'var(--surface-off)', borderRadius: 7, padding: 2, gap: 2 }}>
            {(['screenshot', 'samsara'] as EldMode[]).map(m => (
              <button key={m} onClick={() => { setEldMode(m); localStorage.setItem('3b-eld-mode', m) }}
                style={{ fontSize: '.62rem', fontWeight: 700, padding: '.22rem .5rem', borderRadius: 5, border: 'none', cursor: 'pointer', background: eldMode === m ? 'var(--surface)' : 'transparent', color: eldMode === m ? 'var(--primary)' : 'var(--muted)', transition: 'all .15s' }}>
                {m === 'screenshot' ? '📷' : '📡'}
              </button>
            ))}
          </div>
          {eldMode === 'screenshot' && (
            <button onClick={onScanClick} disabled={hosScanning}
              style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', padding: '.3rem .75rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', cursor: hosScanning ? 'not-allowed' : 'pointer', opacity: hosScanning ? .6 : 1, minHeight: 36 }}>
              {hosScanning ? '⏳' : '📷 Scan'}
            </button>
          )}
          {hosDisplay && (
            <button onClick={onClearHos}
              style={{ fontSize: '.65rem', color: 'var(--muted)', padding: '.28rem .55rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>Clear</button>
          )}
        </div>
      </div>

      {hosError && <div style={{ fontSize: '.75rem', color: 'var(--error)', padding: '.4rem .7rem', background: 'rgba(232,64,0,.08)', borderRadius: 8, marginBottom: '.5rem' }}>{hosError}</div>}

      {hosDisplay ? (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: driveColor, marginBottom: 2 }}>Drive</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(2rem,5vw,2.8rem)', lineHeight: 1, color: driveColor, textShadow: `0 0 20px ${driveColor}40` }}>
                {hosDisplay.driveRem.toFixed(1)}<span style={{ fontSize: '.9rem', fontWeight: 700, marginLeft: 2 }}>h</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: shiftColor, marginBottom: 2 }}>Shift</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(1.5rem,3.5vw,2rem)', lineHeight: 1, color: shiftColor }}>
                {hosDisplay.shiftRem.toFixed(1)}<span style={{ fontSize: '.78rem', fontWeight: 700, marginLeft: 2 }}>h</span>
              </div>
            </div>
            {hosDisplay.cycleRem != null && (
              <div>
                <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 2 }}>70h Cycle</div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '1.15rem', lineHeight: 1, color: 'var(--text)' }}>
                  {hosDisplay.cycleRem.toFixed(1)}<span style={{ fontSize: '.7rem', fontWeight: 600, marginLeft: 2 }}>h</span>
                </div>
              </div>
            )}
          </div>
          <HOSBar label={`Drive — ${hosDisplay.driveUsed.toFixed(1)}h of 11h`} used={hosDisplay.driveUsed} total={11} color={driveColor} />
          <HOSBar label={`On-duty — ${hosDisplay.shiftUsed.toFixed(1)}h of 14h`} used={hosDisplay.shiftUsed} total={14} color={shiftColor} />
          {hosDisplay.breakIn != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.55rem .85rem', borderRadius: 10, background: hosDisplay.breakIn < 1 ? 'rgba(232,64,0,.1)' : 'rgba(245,194,0,.07)', border: `1px solid ${hosDisplay.breakIn < 1 ? 'rgba(232,64,0,.25)' : 'rgba(245,194,0,.2)'}` }}>
              <span style={{ fontSize: '.82rem', color: hosDisplay.breakIn < 1 ? 'var(--error)' : 'var(--warn)', fontWeight: 700 }}>⏸ Break due in</span>
              <span style={{ fontWeight: 900, fontSize: '.9rem', color: hosDisplay.breakIn < 1 ? 'var(--error)' : 'var(--warn)', fontVariantNumeric: 'tabular-nums' }}>{hosDisplay.breakIn.toFixed(1)}h</span>
            </div>
          )}
          {eldMode === 'samsara' && samsara?.location?.address && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '.35rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 4 }}>
              <span style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600 }}>📍 {samsara.location.address}</span>
              {samsara.location.speedMph != null && <span style={{ fontSize: '.75rem', fontWeight: 800 }}>{Math.round(samsara.location.speedMph)} mph</span>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.6rem', opacity: .5 }}>
          <HOSBar label="Drive — 0h of 11h" used={0} total={11} color="var(--primary)" />
          <HOSBar label="On-duty — 0h of 14h" used={0} total={14} color="#6c9bd2" />
          <p style={{ fontSize: '.78rem', color: 'var(--faint)', marginTop: 4 }}>
            {eldMode === 'screenshot' ? 'Tap Scan HOS to upload your ELD screenshot.' : 'Add SAMSARA_API_TOKEN for live HOS data.'}
          </p>
        </div>
      )}
    </div>
  )
}
