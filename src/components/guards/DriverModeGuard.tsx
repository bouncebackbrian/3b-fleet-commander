'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isDriverModeEnabled } from '@/lib/driverMode'

type Status = 'checking' | 'allowed' | 'blocked'

/**
 * DriverModeGuard — wraps any page that should be hidden in Driver Mode.
 *
 * Behavior:
 *   checking  → renders nothing (avoids a flash of guarded-then-redirected content)
 *   allowed   → renders children normally
 *   blocked   → shows a brief message, redirects to /dashboard after 1.2s
 *
 * Place inside a layout so page content is never mounted while checking.
 */
export default function DriverModeGuard({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    if (isDriverModeEnabled()) {
      setStatus('blocked')
      const timer = setTimeout(() => router.replace('/dashboard'), 1200)
      return () => clearTimeout(timer)
    }
    setStatus('allowed')
  }, [router])

  if (status === 'checking') return null

  if (status === 'blocked') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: '1.2rem',
        padding: '2rem', textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{ fontSize: '3rem', lineHeight: 1 }}>🚛</div>

        {/* Primary message */}
        <div style={{
          fontWeight: 800, fontSize: '1rem', lineHeight: 1.5,
          padding: '.65rem 1.4rem', borderRadius: 14,
          background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.2)',
          color: 'var(--primary)', maxWidth: 340,
        }}>
          Driver Mode is active — financial tools are hidden.
        </div>

        {/* Redirect status */}
        <div style={{
          fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: 'var(--primary)', animation: 'pulse 1.2s infinite',
          }} />
          Returning to Command Center…
        </div>

        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
        `}</style>
      </div>
    )
  }

  // status === 'allowed'
  return <>{children}</>
}
