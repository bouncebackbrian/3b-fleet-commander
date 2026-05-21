import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt     = '3B Fleet Commander — Operational Command Center for Owner-Operators'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#030c0a',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,232,176,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,232,176,.06) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          display: 'flex',
        }} />

        {/* Glow */}
        <div style={{
          position: 'absolute', top: -120, left: '50%',
          transform: 'translateX(-50%)',
          width: 900, height: 500,
          background: 'radial-gradient(ellipse, rgba(0,232,176,.09) 0%, transparent 65%)',
          display: 'flex',
        }} />

        {/* Top badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 22px', borderRadius: 999,
          border: '1px solid rgba(0,232,176,.28)',
          background: 'rgba(0,232,176,.06)',
          marginBottom: 36,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e8b0' }} />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#00e8b0' }}>
            Built for owner-operators
          </span>
        </div>

        {/* Main headline */}
        <div style={{
          fontSize: 88, fontWeight: 900, color: '#f0fdf8',
          lineHeight: 1.05, letterSpacing: '-0.03em',
          textAlign: 'center', marginBottom: 28,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <span>One screen.</span>
          <span style={{ color: '#f5c200' }}>Every load.</span>
        </div>

        {/* Sub copy */}
        <div style={{
          fontSize: 26, color: '#6aaa96', textAlign: 'center',
          maxWidth: 760, lineHeight: 1.55, marginBottom: 52,
          display: 'flex',
        }}>
          Live HOS · Multi-stop missions · Route risk intelligence · ELD movement alerts
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56 }}>
          {[
            { label: 'ELD Alerts',     color: '#00e8b0' },
            { label: 'Multi-Stop',     color: '#4ac4ff' },
            { label: 'Route Risk',     color: '#f5c200' },
            { label: 'Offline PWA',    color: '#a78bfa' },
            { label: 'Samsara Ready',  color: '#e05c0a' },
          ].map(b => (
            <div key={b.label} style={{
              padding: '8px 20px', borderRadius: 999,
              border: `1px solid ${b.color}40`,
              background: `${b.color}12`,
              fontSize: 18, fontWeight: 700,
              letterSpacing: '.07em', color: b.color,
              display: 'flex',
            }}>
              {b.label}
            </div>
          ))}
        </div>

        {/* Bottom brand bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3,
          background: 'linear-gradient(90deg, transparent, #00e8b0, #f5c200, #00e8b0, transparent)',
          display: 'flex',
        }} />

        <div style={{
          position: 'absolute', bottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#f5c200', letterSpacing: '.06em' }}>
            3B FLEET COMMANDER
          </span>
          <span style={{ fontSize: 16, color: '#2e5c50', fontWeight: 600 }}>·</span>
          <span style={{ fontSize: 16, color: '#2e5c50', fontWeight: 600 }}>
            fleet.bouncebackbrian.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
