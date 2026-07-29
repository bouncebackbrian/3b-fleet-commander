/**
 * Dump Truck Mode — offline durable queue for fuel entries (with receipt photo)
 *
 * Fuel entries now require a receipt photo for tax-audit purposes (spec
 * follow-up, 2026-07-29), and dump/fuel sites are frequently out of signal
 * range. localStorage (used by the plain-event offline queue in
 * offlineQueue.ts) can't hold binary blobs at any real size, so this queue
 * uses IndexedDB instead — same "write locally first, sync in the
 * background, never lose a durable local write" contract as the event
 * queue, just with room for a multi-MB photo per item.
 */

const DB_NAME = '3b-dt-fuel-queue'
const DB_VERSION = 1
const STORE = 'entries'
const MAX_BACKOFF_SECONDS = 300

export type FuelQueueStatus = 'pending' | 'syncing' | 'failed'

export interface QueuedFuelEntry {
  id: string
  fields: Record<string, string>
  fileBlob: Blob | null
  fileName: string | null
  fileType: string | null
  status: FuelQueueStatus
  attempts: number
  lastAttemptAt: string | null
  nextRetryAt: string | null
  lastError: string | null
  enqueuedAt: string
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueFuelEntry(fields: Record<string, string>, file: File | null): Promise<QueuedFuelEntry> {
  const item: QueuedFuelEntry = {
    id: crypto.randomUUID(),
    fields,
    fileBlob: file,
    fileName: file?.name ?? null,
    fileType: file?.type ?? null,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lastError: null,
    enqueuedAt: new Date().toISOString(),
  }
  if (!isBrowser()) return item
  await withStore('readwrite', store => store.add(item))
  return item
}

export async function listQueuedFuelEntries(): Promise<QueuedFuelEntry[]> {
  if (!isBrowser()) return []
  try {
    return await withStore<QueuedFuelEntry[]>('readonly', store => store.getAll())
  } catch {
    return []
  }
}

async function updateItem(id: string, fn: (item: QueuedFuelEntry) => QueuedFuelEntry): Promise<void> {
  if (!isBrowser()) return
  const items = await listQueuedFuelEntries()
  const item = items.find(i => i.id === id)
  if (!item) return
  await withStore('readwrite', store => store.put(fn(item)))
}

export async function markFuelSyncing(id: string): Promise<void> {
  await updateItem(id, item => ({ ...item, status: 'syncing' }))
}

/** Remove from the local queue only after the server confirms the durable write. */
export async function markFuelSynced(id: string): Promise<void> {
  if (!isBrowser()) return
  await withStore('readwrite', store => store.delete(id))
}

export async function markFuelFailed(id: string, error: string): Promise<void> {
  const now = new Date()
  await updateItem(id, item => {
    const attempts = item.attempts + 1
    const backoffSeconds = Math.min(Math.pow(2, Math.max(0, attempts)), MAX_BACKOFF_SECONDS)
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

export async function getRetryableFuelEntriesNow(nowIso: string = new Date().toISOString()): Promise<QueuedFuelEntry[]> {
  const items = await listQueuedFuelEntries()
  return items.filter(item => {
    if (item.status === 'pending') return true
    if (item.status === 'failed') return !item.nextRetryAt || item.nextRetryAt <= nowIso
    return false
  })
}

export interface FuelQueueSummary {
  pending: number
  syncing: number
  failed: number
  total: number
}

export async function summarizeFuelQueue(): Promise<FuelQueueSummary> {
  const items = await listQueuedFuelEntries()
  return {
    pending: items.filter(i => i.status === 'pending').length,
    syncing: items.filter(i => i.status === 'syncing').length,
    failed: items.filter(i => i.status === 'failed').length,
    total: items.length,
  }
}
