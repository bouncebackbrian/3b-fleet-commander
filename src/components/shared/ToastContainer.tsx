'use client'
import { useToasts } from '@/hooks/useToast'
import type { ToastType } from '@/hooks/useToast'

function toastColors(type: ToastType): { bg: string; color: string; border: string } {
  switch (type) {
    case 'success':     return { bg: 'rgba(40,192,72,.96)',    color: '#fff',    border: 'rgba(40,192,72,.35)'    }
    case 'warn':        return { bg: 'rgba(245,194,0,.96)',    color: '#1a1400', border: 'rgba(245,194,0,.4)'     }
    case 'error':       return { bg: 'rgba(232,64,0,.96)',     color: '#fff',    border: 'rgba(232,64,0,.4)'      }
    case 'sync_failed': return { bg: 'rgba(180,40,0,.97)',     color: '#fff',    border: 'rgba(232,64,0,.45)'     }
    case 'offline':     return { bg: 'rgba(60,60,60,.97)',     color: '#fff',    border: 'rgba(140,140,140,.3)'   }
  }
}

function toastIcon(type: ToastType): string {
  switch (type) {
    case 'success':     return '✅'
    case 'warn':        return '⚠️'
    case 'error':       return '❌'
    case 'sync_failed': return '☁️'
    case 'offline':     return '📴'
  }
}

export default function ToastContainer() {
  const toasts = useToasts()
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
      zIndex: 300, display: 'flex', flexDirection: 'column-reverse', gap: 8,
      alignItems: 'center', pointerEvents: 'none',
      width: 'calc(100vw - 2rem)', maxWidth: 400,
    }}>
      {toasts.map(t => {
        const s = toastColors(t.type)
        return (
          <div key={t.id} style={{
            background: s.bg, color: s.color,
            border: `1px solid ${s.border}`,
            padding: '.6rem 1rem', borderRadius: 12,
            fontSize: '.85rem', fontWeight: 700,
            boxShadow: '0 4px 24px rgba(0,0,0,.4)',
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', lineHeight: 1.4,
            animation: 'fc-toast-in .16s ease',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{toastIcon(t.type)}</span>
            <span>{t.message}</span>
          </div>
        )
      })}
      <style>{`
        @keyframes fc-toast-in {
          from { opacity: 0; transform: translateY(10px) }
          to   { opacity: 1; transform: none }
        }
      `}</style>
    </div>
  )
}
