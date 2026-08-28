'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useMovementDetector } from '@/hooks/useMovementDetector'
import { useSpotify } from '@/hooks/useSpotify'

const MODE_LABELS: Record<string, string> = {
  'dump-truck': 'Dump Truck',
  'water-truck': 'Water Truck',
  hotshot: 'Hotshot',
  otr: 'OTR',
  regional: 'Regional',
  local: 'Local',
  'business-vehicle': 'Business Vehicle',
}

function modeLabel(pathname: string) {
  const mode = pathname.split('/').filter(Boolean)[1] ?? ''
  return MODE_LABELS[mode] ?? 'Driver'
}

export default function SafeDriveGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const movement = useMovementDetector(true)
  const spotify = useSpotify(movement.movementState === 'moving')

  return (
    <>
      {children}
      {movement.movementState === 'moving' && (
        <div role="dialog" aria-modal="true" aria-label="Safe Drive mode" style={{
          position: 'fixed', inset: 0, zIndex: 100000, background: '#020806', color: '#eefcf8',
          padding: 'max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))',
          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', overflowY: 'auto',
        }}>
          <div style={{ maxWidth: 720, minHeight: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ color: '#00e8b0', fontSize: '.68rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }}>Fleet Commander · Safe Drive</div>
                <div style={{ marginTop: 3, fontSize: '1.15rem', fontWeight: 900 }}>{modeLabel(pathname)} Mode</div>
              </div>
              <div style={{ minWidth: 84, textAlign: 'center', borderRadius: 14, border: '1px solid rgba(0,232,176,.28)', background: 'rgba(0,232,176,.08)', padding: '.55rem .7rem' }}>
                <div style={{ fontSize: '1.6rem', lineHeight: 1, fontWeight: 950 }}>{movement.speedMph ?? '—'}</div>
                <div style={{ marginTop: 3, color: '#6fae9d', fontSize: '.58rem', fontWeight: 800 }}>MPH</div>
              </div>
            </div>

            <div style={{ padding: '1.15rem', borderRadius: 18, textAlign: 'center', border: '1px solid rgba(245,194,0,.26)', background: 'rgba(245,194,0,.055)' }}>
              <div style={{ fontSize: '2rem' }}>🚛</div>
              <div style={{ marginTop: 5, fontSize: '1.2rem', fontWeight: 950 }}>Vehicle is moving</div>
              <div style={{ marginTop: 7, color: '#9bc8bc', fontSize: '.83rem', lineHeight: 1.55 }}>
                Detailed forms, reports, settings and administrative controls are locked until the vehicle is safely stopped.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              <Evidence label="GPS evidence" value={movement.geo ? 'Geotag active' : 'Acquiring…'} />
              <Evidence label="GPS accuracy" value={movement.geo?.accuracyM != null ? `±${Math.round(movement.geo.accuracyM)} m` : '—'} />
            </div>

            <div style={{ flex: 1 }} />

            {spotify.isConnected && (
              <div style={{ padding: '1rem', borderRadius: 18, border: '1px solid rgba(30,215,96,.25)', background: 'rgba(30,215,96,.055)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '.8rem' }}>
                  {spotify.track?.albumArt ? <img src={spotify.track.albumArt} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 48, height: 48, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)', fontSize: '1.3rem' }}>🎵</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: '#54d886', fontSize: '.6rem', fontWeight: 850, letterSpacing: '.09em', textTransform: 'uppercase' }}>Spotify</div>
                    <div style={{ marginTop: 2, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spotify.track?.trackName ?? 'No active track'}</div>
                    <div style={{ color: '#8db8aa', fontSize: '.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spotify.track?.artistName ?? 'Open Spotify on your audio device'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  <MediaButton label="⏮" aria="Previous song" onClick={spotify.previous} />
                  <MediaButton label={spotify.track?.isPlaying ? '⏸' : '▶️'} aria="Play or pause" onClick={spotify.toggle} />
                  <MediaButton label="⏭" aria="Next song" onClick={spotify.next} />
                  <MediaButton label={spotify.trackSaved ? '💚' : '♡'} aria="Like or unlike song" onClick={spotify.toggleLike} />
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', color: '#537b70', fontSize: '.68rem', lineHeight: 1.45 }}>
              Normal driver controls return automatically after Fleet Commander confirms the vehicle has stopped.
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: '.8rem', borderRadius: 12, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.025)' }}><div style={{ color: '#668f83', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 4, fontSize: '.82rem', fontWeight: 850 }}>{value}</div></div>
}

function MediaButton({ label, aria, onClick }: { label: string; aria: string; onClick: () => void }) {
  return <button aria-label={aria} onClick={onClick} style={{ minHeight: 56, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: '1.25rem', fontWeight: 900 }}>{label}</button>
}
