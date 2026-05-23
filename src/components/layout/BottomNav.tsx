'use client'
/**
 * BottomNav — Role-aware bottom navigation.
 *
 * Reads userMode from localStorage ('3b-user-mode') and renders
 * only the tabs configured for that mode. Listens for '3b-mode-changed'
 * custom event so switching modes in Settings updates the nav instantly.
 *
 * Falls back to owner_operator tabs if no mode is stored.
 */
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { readUserMode, getTabsForMode, type UserMode } from '@/lib/userMode'

const TAB_ICONS: Record<string, string> = {
  '/dashboard':  '🚛',
  '/trips':      '🗺️',
  '/dispatch':   '📋',
  '/loads':      '📦',
  '/expenses':   '💰',
  '/compliance': '⚖️',
  '/settings':   '⚙️',
}

export default function BottomNav() {
  const path = usePathname()
  const [mode, setMode] = useState<UserMode>('owner_operator')

  useEffect(() => {
    // Read initial mode
    const stored = readUserMode()
    if (stored) setMode(stored)

    // Listen for mode changes from UserModeSelectorSheet
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UserMode>).detail
      if (detail) setMode(detail)
    }
    window.addEventListener('3b-mode-changed', handler)
    return () => window.removeEventListener('3b-mode-changed', handler)
  }, [])

  const tabs = getTabsForMode(mode)

  return (
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
      {tabs.map(tab => {
        const active = path === tab.href || (tab.href !== '/dashboard' && path.startsWith(tab.href))
        const emoji  = TAB_ICONS[tab.href] ?? tab.emoji
        return (
          <Link
            key={tab.href}
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
      })}
    </nav>
  )
}
