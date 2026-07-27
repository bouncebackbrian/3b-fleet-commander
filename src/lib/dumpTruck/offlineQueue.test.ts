// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueueEvent, readQueue, markSyncing, markSynced, markFailed,
  computeBackoffSeconds, getRetryableNow, summarizeQueue, getOrCreateDeviceId,
} from './offlineQueue'
import { buildEvent } from './events'

function makeEvent(idempotencyKey?: string) {
  const event = buildEvent({
    businessId: 'biz-1', threebId: '3B-U-00000001', driverId: 'drv-1', shiftId: 'shift-1',
    eventType: 'clock_in', geo: { lat: null, lng: null, accuracyM: null, capturedAt: null, permission: 'unavailable' },
  })
  return idempotencyKey ? { ...event, id: idempotencyKey, idempotencyKey } : event
}

beforeEach(() => {
  localStorage.clear()
})

describe('enqueueEvent / readQueue', () => {
  it('enqueues a new event as pending', () => {
    const event = makeEvent()
    enqueueEvent(event)
    const queue = readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].status).toBe('pending')
    expect(queue[0].event.idempotencyKey).toBe(event.idempotencyKey)
  })

  it('does not duplicate an event retried with the same idempotency key', () => {
    const event = makeEvent('same-key')
    enqueueEvent(event)
    enqueueEvent(event)
    enqueueEvent({ ...event, notes: 'a retry attempt with the same key' })
    expect(readQueue()).toHaveLength(1)
  })

  it('keeps two distinct actions as two separate queue items', () => {
    enqueueEvent(makeEvent('key-a'))
    enqueueEvent(makeEvent('key-b'))
    expect(readQueue()).toHaveLength(2)
  })
})

describe('sync lifecycle', () => {
  it('moves pending -> syncing -> removed-on-synced', () => {
    const event = makeEvent('lifecycle-key')
    enqueueEvent(event)
    markSyncing(event.idempotencyKey)
    expect(readQueue()[0].status).toBe('syncing')

    markSynced(event.idempotencyKey)
    expect(readQueue()).toHaveLength(0)
  })

  it('records attempts and a future retry time on failure', () => {
    const event = makeEvent('fail-key')
    enqueueEvent(event)
    markFailed(event.idempotencyKey, 'network error')
    const [item] = readQueue()
    expect(item.status).toBe('failed')
    expect(item.attempts).toBe(1)
    expect(item.lastError).toBe('network error')
    expect(new Date(item.nextRetryAt!).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('computeBackoffSeconds', () => {
  it('doubles with each attempt and caps at 300s', () => {
    expect(computeBackoffSeconds(0)).toBe(1)
    expect(computeBackoffSeconds(1)).toBe(2)
    expect(computeBackoffSeconds(4)).toBe(16)
    expect(computeBackoffSeconds(20)).toBe(300)
  })
})

describe('getRetryableNow', () => {
  it('includes pending items and excludes failed items still inside their backoff window', () => {
    const pending = makeEvent('pending-key')
    const failedRecent = makeEvent('failed-recent-key')
    const failedReady = makeEvent('failed-ready-key')

    enqueueEvent(pending)
    enqueueEvent(failedRecent)
    markFailed(failedRecent.idempotencyKey, 'err')
    enqueueEvent(failedReady)
    markFailed(failedReady.idempotencyKey, 'err')

    // Force the "ready" one's retry time into the past.
    const queue = readQueue()
    const idx = queue.findIndex(i => i.event.idempotencyKey === failedReady.idempotencyKey)
    queue[idx].nextRetryAt = new Date(Date.now() - 1000).toISOString()
    localStorage.setItem('3b-dt-offline-queue', JSON.stringify(queue))

    const retryable = getRetryableNow().map(i => i.event.idempotencyKey)
    expect(retryable).toContain('pending-key')
    expect(retryable).toContain('failed-ready-key')
    expect(retryable).not.toContain('failed-recent-key')
  })
})

describe('summarizeQueue', () => {
  it('counts items by status', () => {
    enqueueEvent(makeEvent('a'))
    const b = makeEvent('b')
    enqueueEvent(b)
    markSyncing(b.idempotencyKey)
    const summary = summarizeQueue()
    expect(summary.pending).toBe(1)
    expect(summary.syncing).toBe(1)
    expect(summary.total).toBe(2)
  })
})

describe('getOrCreateDeviceId', () => {
  it('is stable across calls', () => {
    const first = getOrCreateDeviceId()
    const second = getOrCreateDeviceId()
    expect(first).toBe(second)
  })
})
