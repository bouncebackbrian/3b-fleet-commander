'use client'
/**
 * BottomNav — Portal-aware bottom navigation.
 *
 * Reads the member's real portal grants (via getCurrentUser()) and the
 * focus mode from localStorage ('3b-user-mode'), then renders only the
 * tabs the member's actual grants allow — see userMode.ts for why this
 * replaced a decoupled, self-selectable localStorage-only mode.
 *
 * Portals with a lot of tabs (currently just Driver) split into primary
 * (shown directly) + overflow (behind a "More" sheet) — see
 * getPrimaryTabsForMode/getOverflowTabsForMode in userMode.ts.
 */
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  readUserMode, writeUserMode, getPrimaryTabsForMode, getOverflowTabsForMode,
  getDefaultMode, getAvailableModes, type UserMode, type NavTab,
} from '@/lib/userMode'
import { getCurrentUser, type Portal, type PortalGrants } from '@/lib/auth-adapter'

const TAB_ICONS: Record<string, string> = {
  '/dashboard':  '🚛',
  '/trips':      '🗺️',
  '/dispatch':   '📋',
  '/loads':      '📦',
  '/broker':     '📦',
  '/vault':      '🗄️',
  '/trailer':    '🚚',
  '/expenses':   '💰',
  '/compliance': '⚖️',
  '/settings':   '⚙️',
}

export default function BottomNav() {
  const path = usePathname()
  const [portals, setPortals] = useState<PortalGrants>({})
  const [mode, setMode] = useState<UserMode | null>(null)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const user = await getCurrentUser()
      if (cancelled) return
      const grants = user?.portals ?? {}
      setPortals(grants)

      const available = getAvailableModes(grants)
      const stored = readUserMode()
      // Fall back to a real default if the stored mode is stale (e.g. a
      // revoked portal, or leftover from the old unconstrained system).
      const resolved = stored && available.includes(stored) ? stored : getDefaultMode(grants)
      setMode(resolved)
      if (resolved && resolved !== stored) writeUserMode(resolved)
    }
    init()

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UserMode>).detail
      if (detail) setMode(detail)
    }
    window.addEventListener('3b-mode-changed', handler)
    return () => { cancelled = true; window.removeEventListener('3b-mode-changed', handler) }
  }, [])

  if (!mode) return null

  const grantedPortals = Object.keys(portals) as Portal[]
  const primaryTabs = getPrimaryTabsForMode(mode, grantedPortals)
  const overflowTabs = getOverflowTabsForMode(mode, grantedPortals)
  const overflowActive = overflowTabs.some(t => path === t.href || path.startsWith(t.href))

  return (
    <>
      <nav
        className="app-bottom-nav"
        style={{
          position:        'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background:      'linear-gradient(180deg,rgba(6,18,16,.97) 0%,#030c0a 100%)',
          borderTop:       '1px solid rgba(0,232,176,.13)',
          backdropFilter:  'blur(20px)',
          padding:         '0 0 env(safe-area-inset-bottom)',
          display:         'flex',
          alignItems:      'stretch',
          justifyContent:  'space-around',
        }}
      >
        {primaryTabs.map(tab => (
          <NavTabLink key={tab.href} tab={tab} active={path === tab.href || (tab.href !== '/dashboard' && path.startsWith(tab.href))} />
        ))}
        {overflowTabs.length > 0 && (
          <button
            onClick={() => setShowMore(true)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, padding: '.55rem .5rem .6rem', flex: 1, background: 'none', border: 'none',
              color: overflowActive ? 'var(--primary)' : 'var(--faint)', position: 'relative', minWidth: 0,
            }}
          >
            <span style={{ fontSize: overflowActive ? '1.25rem' : '1.1rem', lineHeight: 1 }}>⋯</span>
            <span style={{ fontSize: '.56rem', fontWeight: overflowActive ? 800 : 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>More</span>
            {overflowActive && (
              <span style={{ position: 'absolute', bottom: 'env(safe-area-inset-bottom, 0px)', width: 28, height: 2, borderRadius: 2, background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)' }} />
            )}
          </button>
        )}
      </nav>

      {showMore && (
        <MoreMenuSheet tabs={overflowTabs} activePath={path} onClose={() => setShowMore(false)} />
      )}
    </>
  )
}

function NavTabLink({ tab, active }: { tab: NavTab; active: boolean }) {
  const emoji = TAB_ICONS[tab.href] ?? tab.emoji
  return (
    <Link
      href={tab.href}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            3,
        padding:        '.55rem .5rem .6rem',
        flex:           1,
        textDecoration: 'none',
        color:          active ? 'var(--primary)' : 'var(--faint)',
        position:       'relative',
        transition:     'color 150ms',
        minWidth:       0,
      }}
    >
      <span style={{
        fontSize:  active ? '1.25rem' : '1.1rem',
        lineHeight: 1,
        filter:    active ? 'drop-shadow(0 0 6px rgba(0,232,176,.5))' : 'none',
        transition: 'all 150ms',
      }}>
        {emoji}
      </span>
      <span style={{
        fontSize:      '.56rem',
        fontWeight:    active ? 800 : 600,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        whiteSpace:    'nowrap',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        maxWidth:      '100%',
      }}>
        {tab.label}
      </span>
      {active && (
        <span style={{
          position:     'absolute',
          bottom:       'env(safe-area-inset-bottom, 0px)',
          width:        28,
          height:       2,
          borderRadius: 2,
          background:   'var(--primary)',
          boxShadow:    '0 0 8px var(--primary)',
        }} />
      )}
    </Link>
  )
}

function MoreMenuSheet({ tabs, activePath, onClose }: { tabs: NavTab[]; activePath: string; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        padding: '1rem 1.1rem calc(1.25rem + env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '.75rem' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '.75rem' }}>More</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {tabs.map(tab => {
            const active = activePath === tab.href || activePath.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={onClose}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '1rem .5rem', borderRadius: 14, textDecoration: 'none',
                  background: active ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
                  border: `1px solid ${active ? 'rgba(0,232,176,.3)' : 'var(--border)'}`,
                  color: active ? 'var(--primary)' : 'var(--text)',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{TAB_ICONS[tab.href] ?? tab.emoji}</span>
                <span style={{ fontSize: '.7rem', fontWeight: 700, textAlign: 'center' }}>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
