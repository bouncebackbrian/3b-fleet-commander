'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  hasMission?:      boolean
  resetActive?:     boolean
  onNewLoad?:       () => void
  onReset?:         () => void
  onMusic?:         () => void
  onGym?:           () => void
  onSettlement?:    () => void
  onTimeline?:      () => void
  onReceiverIntel?: () => void
  onEmergency?:     () => void
}

const NAV_LINKS = [
  { href: '/dashboard', icon: '🏠', label: 'Home'     },
  { href: '/trips',     icon: '🗺',  label: 'Trips'    },
  { href: '/dispatch',  icon: '💬', label: 'Dispatch' },
  { href: '/loads',     icon: '📦', label: 'Loads'    },
  { href: '/fuel',      icon: '⛽', label: 'Fuel'     },
  { href: '/expenses',  icon: '💵', label: 'Expenses' },
  { href: '/settings',  icon: '⚙️', label: 'Settings' },
]

export default function CcSidebar({
  hasMission = false,
  resetActive = false,
  onNewLoad, onReset, onMusic, onGym, onSettlement, onTimeline, onReceiverIntel, onEmergency,
}: Props) {
  const pathname = usePathname()

  return (
    <nav className="cc-col-nav" aria-label="Command Center Navigation">
      {/* Brand mark */}
      <div style={{
        textAlign: 'center', padding: '.4rem 0 .65rem',
        borderBottom: '1px solid var(--border)', marginBottom: '.35rem',
      }}>
        <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>🚛</div>
        <div style={{
          fontSize: '.52rem', fontWeight: 900, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--primary)', marginTop: 3,
        }}>Fleet</div>
      </div>

      {/* New Load — primary action */}
      <button
        className="cc-nav-btn active"
        onClick={onNewLoad}
        style={{ background: 'rgba(0,232,176,.12)', borderColor: 'rgba(0,232,176,.3)', marginBottom: 2 }}
      >
        <span className="cc-nav-btn-icon">＋</span>
        <span className="cc-nav-btn-label">New Load</span>
      </button>

      {/* Navigation links */}
      {NAV_LINKS.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className={`cc-nav-btn${pathname === link.href ? ' active' : ''}`}
        >
          <span className="cc-nav-btn-icon">{link.icon}</span>
          <span className="cc-nav-btn-label">{link.label}</span>
        </Link>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1, minHeight: 12 }} />

      {/* Panel shortcuts */}
      <div style={{
        borderTop: '1px solid var(--border)', paddingTop: '.4rem',
        marginTop: '.2rem', display: 'flex', flexDirection: 'column', gap: '.3rem',
      }}>
        {/* Reset / Rest — with active indicator */}
        <button
          className={`cc-nav-btn${resetActive ? ' active' : ''}`}
          onClick={onReset}
          style={resetActive ? { background: 'rgba(245,194,0,.1)', borderColor: 'rgba(245,194,0,.3)', color: 'var(--warn)' } : undefined}
        >
          <span className="cc-nav-btn-icon">{resetActive ? '⏸' : '🛌'}</span>
          <span className="cc-nav-btn-label">{resetActive ? 'Resting' : 'Rest'}</span>
        </button>
        {onReceiverIntel && (
          <button className="cc-nav-btn" onClick={onReceiverIntel}>
            <span className="cc-nav-btn-icon">📍</span>
            <span className="cc-nav-btn-label">Location</span>
          </button>
        )}
        <button className="cc-nav-btn" onClick={onMusic}>
          <span className="cc-nav-btn-icon">🎵</span>
          <span className="cc-nav-btn-label">Music</span>
        </button>
        <button className="cc-nav-btn" onClick={onGym}>
          <span className="cc-nav-btn-icon">💪</span>
          <span className="cc-nav-btn-label">Gym</span>
        </button>
        <button className="cc-nav-btn" onClick={onSettlement}>
          <span className="cc-nav-btn-icon">📋</span>
          <span className="cc-nav-btn-label">Settlement</span>
        </button>
        {onTimeline && (
          <button className="cc-nav-btn" onClick={onTimeline}>
            <span className="cc-nav-btn-icon">📅</span>
            <span className="cc-nav-btn-label">Timeline</span>
          </button>
        )}
      </div>

      {/* Emergency — always at bottom */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.4rem', marginTop: '.3rem' }}>
        <button
          className="cc-nav-btn cc-nav-btn-emergency"
          onClick={onEmergency}
          style={{ background: 'rgba(232,64,0,.07)', borderColor: 'rgba(232,64,0,.2)' }}
        >
          <span className="cc-nav-btn-icon">🚨</span>
          <span className="cc-nav-btn-label">Emergency</span>
        </button>
      </div>
    </nav>
  )
}
