'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gauge, BarChart2, MapPin, Truck, MoreHorizontal } from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Command',  icon: Gauge     },
  { href: '/mis',       label: 'MIS',      icon: BarChart2 },
  { href: '/trips',     label: 'Trips',    icon: MapPin    },
  { href: '/loads',     label: 'Loads',    icon: Truck     },
  { href: '/settings',  label: 'More',     icon: MoreHorizontal },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="app-bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'linear-gradient(180deg,rgba(6,18,16,.95) 0%,#030c0a 100%)',
      borderTop: '1px solid rgba(0,232,176,.13)',
      backdropFilter: 'blur(20px)',
      padding: '0 0 env(safe-area-inset-bottom)',
      alignItems: 'stretch',
      justifyContent: 'space-around',
    }}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== '/dashboard' && path.startsWith(href))
        return (
          <Link key={href} href={href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: '.65rem .5rem', flex: 1, textDecoration: 'none',
            color: active ? 'var(--primary)' : 'var(--faint)',
            transition: 'color 150ms',
          }}>
            <Icon size={active ? 21 : 19} strokeWidth={active ? 2.5 : 1.8}
              style={{ filter: active ? 'drop-shadow(0 0 6px rgba(0,232,176,.5))' : 'none', transition: 'all 150ms' }}
            />
            <span style={{
              fontSize: '.58rem', fontWeight: active ? 800 : 600,
              letterSpacing: '.05em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>{label}</span>
            {active && (
              <span style={{
                position: 'absolute', bottom: 0, width: 28, height: 2,
                borderRadius: 2, background: 'var(--primary)',
                boxShadow: '0 0 8px var(--primary)',
              }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
