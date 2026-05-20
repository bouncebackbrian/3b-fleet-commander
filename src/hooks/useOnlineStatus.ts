'use client'
// ── Online / Offline Detection ────────────────────────────────────────────────
// Wraps navigator.onLine + window online/offline events.
// Starts as true to avoid SSR flash; syncs to real value on first mount.

import { useState, useEffect } from 'react'

export function useOnlineStatus(): boolean {
  // Default true — avoids an offline flash during SSR/hydration
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Sync with real value immediately after mount
    setIsOnline(navigator.onLine)

    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
