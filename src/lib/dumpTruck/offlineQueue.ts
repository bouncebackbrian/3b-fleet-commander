/**
 * Dump Truck Mode — offline durable event queue
 *
 * The iPad may lose connectivity at dump sites (spec §16). Events are
 * generated with a client-side UUID + idempotency key, written to this
 * durable local queue immediately (optimistic timeline update), and synced
 * to Supabase in the background. The server enforces
 * unique(business_id, idempotency_key) (see fleet_dt_events migration) so a
 * retried sync can never create a duplicate row — this module only needs to
 * make retries *resend the same key*, not guarantee dedupe by itself.
 *
 * Supabase remains the system of record; this queue is a sync buffer only —
 * never treat it as the durable store once a write is acknowledged.
 */

import type { DumpTruckEvent } from './types'

export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface QueuedEvent {
  event: DumpTruckEvent
  status: QueueItemStatus
  attempts: number
  lastAttemptAt: string | null
  nextRetryAt: string | null
  lastError: string | null
  enqueuedAt: string
}

const LS_KEY = '3b-dt-offline-queue'
const MAX_BACKOFF_SECONDS = 300 // 5 min cap

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function readQueue(): QueuedEvent[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedEvent[]): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items))
  } catch {
    /* quota exceeded — surfaced via getPendingCount() staying high; never silently drop */
  }
}

/**
 * Enqueue an event. If an item with the same idempotency key already exists
 * (e.g. the caller retried building the same action), it is left untouched
 * rather than duplicated in the local queue.
 */
export function enqueueEvent(event: DumpTruckEvent): QueuedEvent {
  const items = readQueue()
  const existing = items.find(i => i.event.idempotencyKey === event.idempotencyKey)
  if (existing) return existing

  const item: QueuedEvent = {
    event,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lastError: null,
    enqueuedAt: new Date().toISOString(),
  }
  writeQueue([...items, item])
  return item
}

export function markSyncing(idempotencyKey: string): void {
  updateItem(idempotencyKey, item => ({ ...item, status: 'syncing' }))
}

/** Remove from the local queue only after Supabase confirms the durable write. */
export function markSynced(idempotencyKey: string): void {
  const items = readQueue().filter(i => i.event.idempotencyKey !== idempotencyKey)
  writeQueue(items)
}

export function markFailed(idempotencyKey: string, error: string): void {
  const now = new Date()
  updateItem(idempotencyKey, item => {
    const attempts = item.attempts + 1
    const backoffSeconds = computeBackoffSeconds(attempts)
    return {
      ...item,
      status: 'failed',
      attempts,
      lastAttemptAt: now.toISOString(),
      nextRetryAt: new Date(now.getTime() + backoffSeconds * 1000).toISOString(),
      lastError: error,
    }
  })
}

function updateItem(idempotencyKey: string, fn: (item: QueuedEvent) => QueuedEvent): void {
  const items = readQueue()
  const idx = items.findIndex(i => i.event.idempotencyKey === idempotencyKey)
  if (idx === -1) return
  items[idx] = fn(items[idx])
  writeQueue(items)
}

/** Exponential backoff: 2^attempts seconds, capped at MAX_BACKOFF_SECONDS. */
export function computeBackoffSeconds(attempts: number): number {
  const raw = Math.pow(2, Math.max(0, attempts))
  return Math.min(raw, MAX_BACKOFF_SECONDS)
}

/** Items eligible for a retry attempt right now (pending, or failed past its backoff window). */
export function getRetryableNow(nowIso: string = new Date().toISOString()): QueuedEvent[] {
  return readQueue().filter(item => {
    if (item.status === 'pending') return true
    if (item.status === 'failed') return !item.nextRetryAt || item.nextRetryAt <= nowIso
    return false
  })
}

export interface QueueSummary {
  pending: number
  syncing: number
  failed: number
  total: number
}

export function summarizeQueue(): QueueSummary {
  const items = readQueue()
  return {
    pending: items.filter(i => i.status === 'pending').length,
    syncing: items.filter(i => i.status === 'syncing').length,
    failed: items.filter(i => i.status === 'failed').length,
    total: items.length,
  }
}

/** Generate a stable device identifier, persisted once per device/browser install. */
export function getOrCreateDeviceId(): string {
  if (!isBrowser()) return 'server'
  try {
    const key = '3b-dt-device-id'
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = `dev-${crypto.randomUUID()}`
    localStorage.setItem(key, id)
    return id
  } catch {
    return `dev-${Math.random().toString(36).slice(2)}`
  }
}
