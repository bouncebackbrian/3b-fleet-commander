'use client'
/**
 * useAutosave — Autosave + version recovery for any serializable data.
 *
 * - Saves a snapshot every AUTOSAVE_INTERVAL ms when data changes.
 * - Exposes saveVersion(label, data?) for explicit "before import" etc. snaps.
 * - Exposes versions[] and restoreVersion(id) for recovery UI.
 * - Max MAX_VERSIONS entries; oldest autosaves evicted first.
 * - All storage is localStorage — Supabase sync optional via onPersist callback.
 */
import { useEffect, useRef, useCallback } from 'react'
import type { VersionLabel, VersionSnapshot } from '@/lib/dashboard/types'

const MAX_VERSIONS     = 12
const AUTOSAVE_INTERVAL = 8_000   // 8 seconds

interface Options<T> {
  /** Called after every successful autosave (use to push to Supabase) */
  onPersist?: (snapshot: VersionSnapshot) => void
  /** Called when restoreVersion returns data */
  onRestore?: (data: T) => void
}

export function useAutosave<T>(
  storageKey: string,
  currentData: T | null | undefined,
  options?: Options<T>,
) {
  const versionsKey      = `${storageKey}-versions`
  const lastSavedJsonRef = useRef<string>('')
  const dataRef          = useRef(currentData)
  dataRef.current = currentData

  // ── Read all stored versions ───────────────────────────────────────────────
  const getVersions = useCallback((): VersionSnapshot[] => {
    try {
      const raw = localStorage.getItem(versionsKey)
      return raw ? (JSON.parse(raw) as VersionSnapshot[]) : []
    } catch { return [] }
  }, [versionsKey])

  // ── Write a version snapshot ───────────────────────────────────────────────
  const saveVersion = useCallback(
    (label: VersionLabel, data?: T): VersionSnapshot | null => {
      const payload = data ?? dataRef.current
      if (payload == null) return null

      const snapshot: VersionSnapshot = {
        id:        crypto.randomUUID(),
        label,
        timestamp: new Date().toISOString(),
        data:      payload,
      }

      // Evict: keep MAX_VERSIONS, drop oldest autosaves first
      let versions = [snapshot, ...getVersions()]
      while (versions.length > MAX_VERSIONS) {
        const oldIdx = versions.map((v, i) => ({ i, isAuto: v.label === 'autosave' }))
          .reverse().find(x => x.isAuto)?.i ?? versions.length - 1
        versions.splice(oldIdx, 1)
      }

      try {
        localStorage.setItem(versionsKey, JSON.stringify(versions))
        if (label === 'autosave') lastSavedJsonRef.current = JSON.stringify(payload)
        options?.onPersist?.(snapshot)
      } catch { /* storage full — silent */ }

      return snapshot
    },
    [getVersions, versionsKey, options],
  )

  // ── Restore a specific version by id ──────────────────────────────────────
  const restoreVersion = useCallback(
    (id: string): T | null => {
      const snap = getVersions().find(v => v.id === id)
      if (!snap) return null
      const data = snap.data as T
      options?.onRestore?.(data)
      return data
    },
    [getVersions, options],
  )

  // ── Periodic autosave ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const d = dataRef.current
      if (d == null) return
      const json = JSON.stringify(d)
      if (json !== lastSavedJsonRef.current) {
        saveVersion('autosave')
      }
    }, AUTOSAVE_INTERVAL)
    return () => clearInterval(id)
  }, [saveVersion])

  // ── Autosave on page hide (tab switch / close) ────────────────────────────
  useEffect(() => {
    const onHide = () => {
      if (dataRef.current == null) return
      const json = JSON.stringify(dataRef.current)
      if (json !== lastSavedJsonRef.current) saveVersion('autosave')
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [saveVersion])

  return { saveVersion, restoreVersion, getVersions }
}
