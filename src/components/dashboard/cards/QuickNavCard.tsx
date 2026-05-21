'use client'
import Link from 'next/link'

const QUICK_ACTIONS = [
  { href: '/trips',    icon: '🗺',  label: 'Plan Trip' },
  { href: '/dispatch', icon: '💬',  label: 'Dispatch'  },
  { href: '/expenses', icon: '💵',  label: 'Expenses'  },
  { href: '/loads',    icon: '📦',  label: 'Log Load'  },
  { href: '/fuel',     icon: '⛽',  label: 'Fuel'      },
  { href: '/delays',   icon: '⏱',  label: 'Delay'     },
]

interface Props {
  onMusic?:      () => void
  onGym?:        () => void
  onSettlement?: () => void
  onTimeline?:   () => void
}

export default function QuickNavCard({ onMusic, onGym, onSettlement, onTimeline }: Props) {
  const PANEL_ACTIONS = [
    onMusic      && { icon: '🎵', label: 'Music',      onClick: onMusic      },
    onGym        && { icon: '💪', label: 'Gym',        onClick: onGym        },
    onSettlement && { icon: '📋', label: 'Settlement', onClick: onSettlement },
    onTimeline   && { icon: '📅', label: 'Timeline',   onClick: onTimeline   },
  ].filter(Boolean) as { icon: string; label: string; onClick: () => void }[]

  return (
    <div className="cc-card" style={{ padding: '.75rem' }}>
      <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>Quick Access</div>
      <div className="cc-quick-nav-grid">
        {QUICK_ACTIONS.map(a => (
          <Link key={a.href} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '.65rem .85rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textDecoration: 'none', minHeight: 56 }}>
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{a.icon}</span>
            <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--muted)' }}>{a.label}</span>
          </Link>
        ))}
        {PANEL_ACTIONS.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '.65rem .85rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', minHeight: 56, textAlign: 'left' }}
          >
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{a.icon}</span>
            <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--muted)' }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
