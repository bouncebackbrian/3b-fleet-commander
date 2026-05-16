'use client'
import { useState, useEffect } from 'react'

// Captures the beforeinstallprompt event and shows a custom install banner.
// Shows once per session; user can dismiss permanently via localStorage.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow]                     = useState(false)
  const [isIOS, setIsIOS]                   = useState(false)
  const [installing, setInstalling]         = useState(false)

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem('pwa-install-dismissed') === '1') return
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // iOS detection — they don't support beforeinstallprompt
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.navigator as { standalone?: boolean }).standalone
    if (ios) { setIsIOS(true); setShow(true); return }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    localStorage.setItem('pwa-install-dismissed', '1')
    setShow(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') localStorage.setItem('pwa-install-dismissed', '1')
    setDeferredPrompt(null)
    setShow(false)
    setInstalling(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(60px + env(safe-area-inset-bottom))', left: 12, right: 12,
      zIndex: 200, borderRadius: 16,
      background: 'linear-gradient(135deg,#081a16,#0a2218)',
      border: '1px solid rgba(0,232,176,.3)',
      boxShadow: '0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(0,232,176,.08)',
      padding: '1rem 1.1rem',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'slideUp .3s cubic-bezier(0.16,1,0.3,1)',
    }}>
      <img src="/icons/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, objectFit: 'cover' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '.82rem', color: '#f0faf8', lineHeight: 1.2 }}>
          Add 3B Fleet to Home Screen
        </div>
        {isIOS ? (
          <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.5)', marginTop: 3, lineHeight: 1.4 }}>
            Tap <strong style={{ color: 'rgba(0,232,176,.8)' }}>Share</strong> then <strong style={{ color: 'rgba(0,232,176,.8)' }}>Add to Home Screen</strong>
          </div>
        ) : (
          <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.5)', marginTop: 3 }}>
            Works offline · No App Store needed
          </div>
        )}
      </div>

      {!isIOS && (
        <button onClick={install} disabled={installing}
          style={{ flexShrink: 0, padding: '.45rem .9rem', borderRadius: 9, border: 'none', background: 'rgba(0,232,176,.15)', color: '#00e8b0', fontWeight: 800, fontSize: '.75rem', cursor: installing ? 'wait' : 'pointer', whiteSpace: 'nowrap', boxShadow: '0 0 12px rgba(0,232,176,.15)' }}>
          {installing ? 'Installing…' : '⬇ Install'}
        </button>
      )}

      <button onClick={dismiss}
        style={{ flexShrink: 0, padding: '.3rem .45rem', borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'none', color: 'rgba(255,255,255,.3)', fontSize: '.75rem', cursor: 'pointer', lineHeight: 1 }}>
        ✕
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
