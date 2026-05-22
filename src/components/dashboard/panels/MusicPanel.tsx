'use client'
import SpotifyWidget from '@/components/spotify/SpotifyWidget'
import type { SpotifyTrack, SpotifyStatus } from '@/hooks/useSpotify'

// ── Preset catalogue (fallback when Spotify not connected) ────────────────────
const PRESETS = [
  { icon: '🚛', label: "Truckin' Playlist",  url: 'https://open.spotify.com/search/trucking%20road%20trip/playlists',   desc: 'Classic country & road anthems'     },
  { icon: '🎵', label: 'Chill / Focus',       url: 'https://open.spotify.com/genre/focus',                               desc: 'Low-key focus for long hauls'       },
  { icon: '⚡', label: 'High Energy',          url: 'https://open.spotify.com/search/driving%20energy/playlists',         desc: 'Pump it up on empty interstates'    },
  { icon: '🎙', label: 'Podcasts',             url: 'https://open.spotify.com/genre/podcasts-page',                       desc: 'Trucker radio & talk shows'         },
  { icon: '🤠', label: 'Country Roads',        url: 'https://open.spotify.com/search/country%20roads%20hits/playlists',   desc: 'Country classics, mile after mile'  },
  { icon: '🎸', label: 'Classic Rock',         url: 'https://open.spotify.com/search/classic%20rock%20highway/playlists', desc: 'Rock & roll for the long stretch'   },
]

interface Props {
  open:         boolean
  onClose:      () => void
  drivingMode?: boolean
  // Spotify live state
  spotifyTrack?:      SpotifyTrack | null
  spotifyStatus?:     SpotifyStatus
  spotifyTrackSaved?: boolean
  onSpotifyToggle?:   () => void
  onSpotifyNext?:     () => void
  onSpotifyPrev?:     () => void
  onSpotifyLike?:     () => void
}

export default function MusicPanel({
  open, onClose, drivingMode,
  spotifyTrack, spotifyStatus, spotifyTrackSaved,
  onSpotifyToggle, onSpotifyNext, onSpotifyPrev, onSpotifyLike,
}: Props) {
  if (!open) return null

  const go = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')
  const isConnected = spotifyStatus && spotifyStatus !== 'disconnected'

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(3,13,11,.75)' }} onClick={onClose} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)',
        borderTop: '2px solid rgba(30,215,96,.3)',
        borderRadius: '20px 20px 0 0',
        padding: '1.5rem 1.5rem 2.5rem',
        maxHeight: '92dvh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.5rem' }}>🎵</span> Music
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
              {isConnected ? 'Spotify connected · controls below' : 'Connect Spotify in Settings for live controls'}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem', flexShrink: 0 }}>
            ✕
          </button>
        </div>

        {/* Driving mode warning */}
        {drivingMode && (
          <div style={{ padding: '.65rem .9rem', borderRadius: 10, marginBottom: '1rem', background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.25)', fontSize: '.72rem', fontWeight: 700, color: 'var(--warn)', lineHeight: 1.5 }}>
            ⚠ Driving Mode is ON — control music before moving. Use steering wheel buttons while driving.
          </div>
        )}

        {/* ── Live Spotify widget ── */}
        {isConnected ? (
          <div style={{ marginBottom: '1.1rem' }}>
            <SpotifyWidget
              track={spotifyTrack ?? null}
              status={spotifyStatus!}
              driving={false}
              trackSaved={spotifyTrackSaved}
              onToggle={onSpotifyToggle ?? (() => {})}
              onNext={onSpotifyNext ?? (() => {})}
              onPrevious={onSpotifyPrev ?? (() => {})}
              onLike={onSpotifyLike}
              onOpen={() => go('https://open.spotify.com')}
            />
          </div>
        ) : (
          /* Open Spotify CTA when not connected */
          <button
            onClick={() => go('https://open.spotify.com')}
            style={{ width: '100%', padding: '1.05rem', borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(30,215,96,.4)', background: 'rgba(30,215,96,.09)', color: '#1ed760', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: '1.1rem' }}
          >
            <span style={{ fontSize: '1.35rem' }}>🎵</span> Open Spotify
          </button>
        )}

        {/* Connect Spotify CTA (when not connected) */}
        {!isConnected && (
          <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'rgba(30,215,96,.04)', border: '1px solid rgba(30,215,96,.15)', marginBottom: '1rem', fontSize: '.75rem', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span>Connect Spotify for play/pause + live track info directly in Fleet Commander</span>
            <a href="/settings#spotify" style={{ flexShrink: 0, padding: '.4rem .8rem', borderRadius: 8, background: 'rgba(30,215,96,.12)', border: '1px solid rgba(30,215,96,.3)', color: '#1ed760', fontWeight: 800, fontSize: '.72rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Connect →
            </a>
          </div>
        )}

        {/* Presets grid — always show as quick-launch shortcuts */}
        <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.65rem' }}>
          {isConnected ? 'Open Playlist in Spotify' : 'Quick Presets'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => go(p.url)}
              style={{ padding: '1rem .9rem', borderRadius: 13, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)', minHeight: drivingMode ? 80 : 76 }}
            >
              <div style={{ fontSize: drivingMode ? '1.75rem' : '1.45rem', marginBottom: 4, lineHeight: 1 }}>{p.icon}</div>
              <div style={{ fontSize: drivingMode ? '.88rem' : '.8rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>{p.label}</div>
              {!drivingMode && <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{p.desc}</div>}
            </button>
          ))}
        </div>

        {/* Safety note */}
        <div style={{ marginTop: '1.25rem', padding: '.7rem .9rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.65 }}>
          🛡 <strong style={{ color: 'var(--text)' }}>Safety:</strong> Select music before you start moving.
          Never interact with audio controls while the vehicle is in motion.
          Use steering wheel buttons or voice commands while driving.
        </div>

      </div>
    </>
  )
}
