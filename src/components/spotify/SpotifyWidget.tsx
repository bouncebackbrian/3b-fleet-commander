'use client'
/**
 * SpotifyWidget — reusable Spotify now-playing + controls component
 *
 * driving={true}  → used inside DrivingModeOverlay — BIG touch targets, prominent
 * driving={false} → used inside MusicPanel — compact
 */
import type { SpotifyTrack, SpotifyStatus } from '@/hooks/useSpotify'

interface Props {
  track:      SpotifyTrack | null
  status:     SpotifyStatus
  driving?:   boolean
  onToggle:   () => void
  onNext:     () => void
  onPrevious: () => void
  onOpen?:    () => void   // open Spotify app
}

const SPOTIFY_GREEN = '#1ed760'

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function SpotifyWidget({
  track, status, driving = false, onToggle, onNext, onPrevious, onOpen,
}: Props) {
  const btnSize = driving ? 72 : 52
  const iconSz  = driving ? '2rem' : '1.35rem'

  // ── Not connected ─────────────────────────────────────────────────────────
  if (status === 'disconnected') {
    return (
      <div style={{
        padding: driving ? '1rem 1.25rem' : '.65rem .9rem',
        borderRadius: 14, border: '1px solid rgba(30,215,96,.2)',
        background: 'rgba(30,215,96,.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: driving ? '.95rem' : '.8rem', color: 'var(--muted)' }}>🎵 Spotify not connected</div>
          {!driving && <div style={{ fontSize: '.62rem', color: 'var(--faint)', marginTop: 2 }}>Connect in Settings → Spotify</div>}
        </div>
        {onOpen && (
          <button
            onClick={onOpen}
            style={{ padding: '.45rem .85rem', borderRadius: 9, border: '1px solid rgba(30,215,96,.3)', background: 'rgba(30,215,96,.08)', color: SPOTIFY_GREEN, fontWeight: 800, fontSize: '.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Open Spotify
          </button>
        )}
      </div>
    )
  }

  // ── Connected but no device active ───────────────────────────────────────
  if (status === 'no_device' || !track) {
    return (
      <div style={{
        padding: driving ? '1rem 1.25rem' : '.65rem .9rem',
        borderRadius: 14, border: '1px solid rgba(30,215,96,.2)',
        background: 'rgba(30,215,96,.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: driving ? '.95rem' : '.8rem', color: SPOTIFY_GREEN }}>🎵 Spotify connected</div>
          <div style={{ fontSize: driving ? '.78rem' : '.62rem', color: 'var(--muted)', marginTop: 2 }}>
            No active device — open Spotify on your phone first
          </div>
        </div>
        <button
          onClick={onOpen ?? (() => window.open('https://open.spotify.com', '_blank', 'noopener'))}
          style={{ padding: '.45rem .85rem', borderRadius: 9, border: `1px solid ${SPOTIFY_GREEN}40`, background: `${SPOTIFY_GREEN}10`, color: SPOTIFY_GREEN, fontWeight: 800, fontSize: '.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Open ↗
        </button>
      </div>
    )
  }

  // ── Premium-only notice ───────────────────────────────────────────────────
  if (status === 'premium_only') {
    return (
      <div style={{ padding: '.65rem .9rem', borderRadius: 12, border: '1px solid rgba(245,194,0,.3)', background: 'rgba(245,194,0,.07)', fontSize: '.72rem', color: 'var(--warn)', fontWeight: 700 }}>
        ⚠ Playback control requires Spotify Premium. Track info is still shown.
      </div>
    )
  }

  const progress = track.durationMs > 0 ? (track.progressMs / track.durationMs) : 0

  // ── DRIVING MODE — big, glanceable ───────────────────────────────────────
  if (driving) {
    return (
      <div style={{
        width: '100%',
        padding: '1rem 1.25rem',
        borderRadius: 18,
        background: 'rgba(0,0,0,.35)',
        border: `1px solid ${SPOTIFY_GREEN}30`,
        display: 'flex', flexDirection: 'column', gap: '.75rem',
      }}>
        {/* Track info row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Album art */}
          {track.albumArt ? (
            <img
              src={track.albumArt} alt="album"
              style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0, boxShadow: `0 0 16px ${SPOTIFY_GREEN}30` }}
            />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 10, background: 'rgba(30,215,96,.1)', border: `1px solid ${SPOTIFY_GREEN}25`, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: '1.75rem' }}>
              🎵
            </div>
          )}

          {/* Track name + artist */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncate(track.trackName, 30)}
            </div>
            <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.65)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {truncate(track.artistName, 36)}
            </div>
            {track.deviceName && (
              <div style={{ fontSize: '.6rem', color: `${SPOTIFY_GREEN}90`, marginTop: 3 }}>
                ▶ {track.deviceName}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: SPOTIFY_GREEN, borderRadius: 2, transition: 'width .5s linear' }} />
        </div>

        {/* Controls row — large touch targets */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          {/* Previous */}
          <button
            onClick={onPrevious}
            style={{
              width: btnSize, height: btnSize, borderRadius: '50%',
              background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
              color: '#fff', fontSize: iconSz, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
            aria-label="Previous track"
          >
            ⏮
          </button>

          {/* Play / Pause — biggest button */}
          <button
            onClick={onToggle}
            style={{
              width: btnSize + 24, height: btnSize + 24, borderRadius: '50%',
              background: SPOTIFY_GREEN, border: 'none',
              color: '#000', fontSize: '2.25rem', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              boxShadow: `0 0 24px ${SPOTIFY_GREEN}55`,
            }}
            aria-label={track.isPlaying ? 'Pause' : 'Play'}
          >
            {track.isPlaying ? '⏸' : '▶'}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            style={{
              width: btnSize, height: btnSize, borderRadius: '50%',
              background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
              color: '#fff', fontSize: iconSz, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
            aria-label="Next track"
          >
            ⏭
          </button>
        </div>

        {/* Time */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', color: 'rgba(255,255,255,.4)', fontVariantNumeric: 'tabular-nums' }}>
          <span>{fmtMs(track.progressMs)}</span>
          <span>{fmtMs(track.durationMs)}</span>
        </div>
      </div>
    )
  }

  // ── NORMAL MODE — compact card ────────────────────────────────────────────
  return (
    <div style={{
      padding: '.75rem 1rem',
      borderRadius: 14,
      background: `${SPOTIFY_GREEN}08`,
      border: `1px solid ${SPOTIFY_GREEN}25`,
      display: 'flex', flexDirection: 'column', gap: '.5rem',
    }}>
      {/* Track info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
        {track.albumArt ? (
          <img src={track.albumArt} alt="album" style={{ width: 44, height: 44, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 7, background: `${SPOTIFY_GREEN}15`, display: 'grid', placeItems: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🎵</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {truncate(track.trackName, 32)}
          </div>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {truncate(track.artistName, 36)}
          </div>
        </div>
        {/* Inline controls */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button onClick={onPrevious} style={{ width: btnSize, height: btnSize, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: iconSz, cursor: 'pointer', display: 'grid', placeItems: 'center' }} aria-label="Previous">⏮</button>
          <button
            onClick={onToggle}
            style={{ width: btnSize, height: btnSize, borderRadius: '50%', background: SPOTIFY_GREEN, border: 'none', color: '#000', fontSize: iconSz, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            aria-label={track.isPlaying ? 'Pause' : 'Play'}
          >
            {track.isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={onNext} style={{ width: btnSize, height: btnSize, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: iconSz, cursor: 'pointer', display: 'grid', placeItems: 'center' }} aria-label="Next">⏭</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: SPOTIFY_GREEN, borderRadius: 2, transition: 'width .5s linear' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.58rem', color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
        <span>{fmtMs(track.progressMs)}</span>
        <span>{fmtMs(track.durationMs)}</span>
      </div>
    </div>
  )
}
