'use client'
/**
 * TopBar — Sticky header with universal navigation, mode badge, theme toggle,
 * and optional export.
 *
 * Every screen that uses TopBar gets an explicit Back action and a stable
 * Fleet Commander Home link so users never land in a dead-end workflow.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sun, Moon, Download, ArrowLeft, House } from 'lucide-react'
import { readUserMode, MODE_CONFIG, type UserMode } from '@/lib/userMode'
import UserModeSelectorSheet from '@/components/layout/UserModeSelectorSheet'

interface Props {
  title:     string
  subtitle?: string
  onExport?: () => void
  module?:   'mis' | 'ops' | 'sys'
}

export default function TopBar({ title, subtitle, onExport }: Props) {
  const router = useRouter()
  const [theme,      setTheme]      = useState<'dark' | 'light'>('dark')
  const [mode,       setMode]       = useState<UserMode | null>(null)
  const [showMode,   setShowMode]   = useState(false)
  const [firstRun,   setFirstRun]   = useState(false)

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') as 'dark' | 'light'
    if (t) setTheme(t)

    const stored = readUserMode()
    if (!stored) {
      setFirstRun(true)
      setShowMode(true)
    } else {
      setMode(stored)
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UserMode>).detail
      if (detail) { setMode(detail); setFirstRun(false) }
    }
    window.addEventListener('3b-mode-changed', handler)
    return () => window.removeEventListener('3b-mode-changed', handler)
  }, [])

  const toggle = () => {
    const n = theme === 'dark' ? 'light' : 'dark'
    setTheme(n)
    document.documentElement.setAttribute('data-theme', n)
  }

  const cfg = mode ? MODE_CONFIG[mode] : null
  const navButton: React.CSSProperties = {
    padding: '.5rem .62rem', borderRadius: 9, background: 'var(--surface)',
    border: '1px solid var(--border)', color: 'var(--muted)',
    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
    fontSize: '.68rem', fontWeight: 750, textDecoration: 'none', whiteSpace: 'nowrap',
  }

  return (
    <>
      <header style={{
        position:       'sticky', top: 0, zIndex: 10,
        display:        'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem',
        padding:        '.65rem 1rem',
        backdropFilter: 'blur(16px)',
        background:     'color-mix(in srgb,var(--bg) 80%,transparent)',
        borderBottom:   '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => router.back()} aria-label="Go back" style={navButton}>
            <ArrowLeft size={14} />
            <span className="hide-xs">Back</span>
          </button>
          <Link href="/" aria-label="Fleet Commander home" style={navButton}>
            <House size={14} />
            <span className="hide-xs">Home</span>
          </Link>
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          {cfg && (
            <button
              onClick={() => setShowMode(true)}
              style={{
                display:       'inline-flex', alignItems: 'center', gap: 4,
                marginBottom: 3, padding: '.12rem .5rem', borderRadius: 5,
                background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
                cursor: 'pointer', fontSize: '.6rem', fontWeight: 700,
                color: cfg.color, textTransform: 'uppercase', letterSpacing: '.07em',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{cfg.emoji}</span><span>{cfg.label}</span><span style={{ opacity: .6, fontSize: '.55rem' }}>▼</span>
            </button>
          )}
          <h1 style={{
            fontSize: 'clamp(1rem, 4vw, 1.4rem)', fontWeight: 900,
            letterSpacing: '-.03em', lineHeight: 1, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</h1>
          {subtitle && (
            <p style={{
              fontSize: '.65rem', color: 'var(--muted)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subtitle}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {onExport && (
            <button onClick={onExport} style={{
              padding: '.55rem .8rem', borderRadius: 9, background: 'var(--surface)',
              border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.75rem',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            }}>
              <Download size={13} /><span className="hide-xs">Export</span>
            </button>
          )}
          <button onClick={toggle} aria-label="Toggle theme" style={{
            padding: '.55rem', borderRadius: 9, background: 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', cursor: 'pointer',
          }}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <UserModeSelectorSheet open={showMode} onClose={() => setShowMode(false)} isFirstRun={firstRun} />
    </>
  )
}
