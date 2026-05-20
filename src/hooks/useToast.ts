'use client'
// ── Centralized Toast System ──────────────────────────────────────────────────
// Module-level singleton so toast.success() can be called from any hook,
// utility, or component without prop-drilling or React context.
//
// Usage:
//   import { toast } from '@/hooks/useToast'
//   toast.success('Event logged')
//   toast.syncFailed('Supabase write failed')
//
// To render toasts, mount <ToastContainer /> once in the app (dashboard page).
// To subscribe in a component: const toasts = useToasts()

import { useState, useEffect } from 'react'

export type ToastType = 'success' | 'warn' | 'error' | 'sync_failed' | 'offline'

export interface ToastItem {
  id:       string
  type:     ToastType
  message:  string
  duration: number
}

// ── Module-level singleton ────────────────────────────────────────────────────
let _toasts: ToastItem[] = []
const _listeners: Set<(t: ToastItem[]) => void> = new Set()

function _uid(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

function _notify(): void {
  const snapshot = [..._toasts]
  _listeners.forEach(fn => fn(snapshot))
}

export const toast = {
  show(type: ToastType, message: string, duration = 3500): void {
    const item: ToastItem = { id: _uid(), type, message, duration }
    _toasts = [item, ..._toasts].slice(0, 5) // cap at 5 simultaneous toasts
    _notify()
    setTimeout(() => {
      _toasts = _toasts.filter(t => t.id !== item.id)
      _notify()
    }, duration)
  },
  success:    (msg: string, dur?: number) => toast.show('success',     msg, dur),
  warn:       (msg: string, dur?: number) => toast.show('warn',        msg, dur),
  error:      (msg: string, dur?: number) => toast.show('error',       msg, dur),
  syncFailed: (msg: string, dur?: number) => toast.show('sync_failed', msg, dur ?? 5000),
  offline:    (msg: string, dur?: number) => toast.show('offline',     msg, dur ?? 4000),
}

// ── React hook — subscribes to the module-level singleton ─────────────────────
export function useToasts(): ToastItem[] {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    // Sync current state on mount
    setToasts([..._toasts])
    _listeners.add(setToasts)
    return () => { _listeners.delete(setToasts) }
  }, [])

  return toasts
}
