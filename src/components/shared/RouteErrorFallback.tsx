'use client'
/**
 * RouteErrorFallback — shared UI for route-segment error.tsx boundaries.
 *
 * Without a boundary, an uncaught render error blanks the whole screen with
 * Next.js's generic "Application error" page and no way to recover short of
 * a manual reload. This gives the driver/dispatcher a retry button and, for
 * Dump Truck Mode specifically, a reminder that already-recorded events are
 * durable (queued locally, not lost) even if the screen crashed.
 */
import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  reassurance?: string
}

export default function RouteErrorFallback({ error, reset, title, reassurance }: Props) {
  useEffect(() => {
    console.error('[route error]', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '1rem', padding: '2rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{title ?? 'Something went wrong'}</h1>
      {reassurance && (
        <p style={{ fontSize: '.85rem', color: 'var(--muted)', maxWidth: 420 }}>{reassurance}</p>
      )}
      <div style={{ display: 'flex', gap: '.75rem' }}>
        <button
          onClick={reset}
          style={{
            padding: '.75rem 1.5rem', borderRadius: 10, background: 'var(--primary)',
            color: '#04140f', fontWeight: 800, border: 'none',
          }}
        >
          Try Again
        </button>
        <button
          onClick={() => { window.location.reload() }}
          style={{
            padding: '.75rem 1.5rem', borderRadius: 10, background: 'var(--surface-2)',
            color: 'var(--text)', fontWeight: 700, border: '1px solid var(--border)',
          }}
        >
          Reload Page
        </button>
      </div>
      {error.digest && (
        <p style={{ fontSize: '.68rem', color: 'var(--faint)' }}>Error ref: {error.digest}</p>
      )}
    </div>
  )
}
