'use client'
import { useState, useEffect } from 'react'
import { Sun, Moon, Download } from 'lucide-react'

interface Props { title: string; subtitle?: string; onExport?: () => void; module?: 'mis' | 'ops' | 'sys' }

export default function TopBar({ title, subtitle, onExport, module = 'mis' }: Props) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') as 'dark' | 'light'
    if (t) setTheme(t)
  }, [])

  const toggle = () => {
    const n = theme === 'dark' ? 'light' : 'dark'
    setTheme(n)
    document.documentElement.setAttribute('data-theme', n)
  }

  const moduleLabel = module === 'mis' ? 'MIS' : module === 'ops' ? 'Ops' : 'System'

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
      padding: '.7rem 1rem',
      backdropFilter: 'blur(16px)',
      background: 'color-mix(in srgb,var(--bg) 80%,transparent)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: '.6rem', color: 'var(--primary)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.08em',
            background: 'rgba(0,232,176,.1)', padding: '.15rem .5rem', borderRadius: 5,
            flexShrink: 0,
          }}>{moduleLabel}</span>
        </div>
        <h1 style={{
          fontSize: 'clamp(1rem, 4vw, 1.5rem)',
          fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {onExport && (
          <button onClick={onExport} style={{
            padding: '.55rem .8rem', borderRadius: 9, background: 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.75rem',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Download size={13} />
            <span className="hide-xs">Export</span>
          </button>
        )}
        <button onClick={toggle} aria-label="Toggle theme" style={{
          padding: '.55rem', borderRadius: 9, background: 'var(--surface)',
          border: '1px solid var(--border)', color: 'var(--muted)',
          display: 'flex', alignItems: 'center',
        }}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  )
}
