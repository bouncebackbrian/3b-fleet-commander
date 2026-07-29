/**
 * Dump Truck Mode — offline durable location-ping queue
 *
 * Same write-locally-first pattern as offlineQueue.ts (localStorage,
 * idempotency-key dedupe, exponential backoff) — cloned rather than shared
 * because location pings are a distinct, smaller payload (no event
 * timeline semantics, no server-side unique(idempotency_key) row to land
 * in — the location endpoint is a plain upsert of "latest known
 * position"). A truck in the field pinging its GPS every few minutes will
 * frequently be offline; this queue makes sure pings aren't silently lost,
 * just delayed until connectivity returns.
 */

export type LocationQueueItemStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface QueuedLocationPing {
  idempotencyKey: string
  equipmentId: string
  lat: number
  lng: number
  capturedAt: string
  status: LocationQueueItemStatus
  attempts: number
  nextRetryAt: string | null
  lastError: string | null
}

const LS_KEY = '3b-dt-location-queue'
const MAX_BACKOFF_SECONDS = 300

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function readLocationQueue(): QueuedLocationPing[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as QueuedLocationPing[]) : []
  } catch {
    return []
  }
}

function writeLocationQueue(items: QueuedLocationPing[]): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items))
  } catch { /* quota exceeded — next ping just overwrites, position cache tolerates gaps */ }
}

/** Only the latest pending ping for a truck matters — older unsent pings are stale positions, drop them. */
export function enqueueLocationPing(equipmentId: string, lat: number, lng: number): void {
  const items = readLocationQueue().filter(i => i.equipmentId !== equipmentId || i.status === 'syncing')
  items.push({
    idempotencyKey: crypto.randomUUID(), equipmentId, lat, lng,
    capturedAt: new Date().toISOString(), status: 'pending', attempts: 0, nextRetryAt: null, lastError: null,
  })
  writeLocationQueue(items)
}

export function markLocationSyncing(idempotencyKey: string): void {
  updateItem(idempotencyKey, item => ({ ...item, status: 'syncing' }))
}

export function markLocationSynced(idempotencyKey: string): void {
  writeLocationQueue(readLocationQueue().filter(i => i.idempotencyKey !== idempotencyKey))
}

export function markLocationFailed(idempotencyKey: string, error: string): void {
  const now = new Date()
  updateItem(idempotencyKey, item => {
    const attempts = item.attempts + 1
    const backoffSeconds = Math.min(Math.pow(2, attempts), MAX_BACKOFF_SECONDS)
    return { ...item, status: 'failed', attempts, nextRetryAt: new Date(now.getTime() + backoffSeconds * 1000).toISOString(), lastError: error }
  })
}

function updateItem(idempotencyKey: string, fn: (item: QueuedLocationPing) => QueuedLocationPing): void {
  const items = readLocationQueue()
  const idx = items.findIndex(i => i.idempotencyKey === idempotencyKey)
  if (idx === -1) return
  items[idx] = fn(items[idx])
  writeLocationQueue(items)
}

export function getRetryableLocationPings(nowIso: string = new Date().toISOString()): QueuedLocationPing[] {
  return readLocationQueue().filter(item => {
    if (item.status === 'pending') return true
    if (item.status === 'failed') return !item.nextRetryAt || item.nextRetryAt <= nowIso
    return false
  })
}
