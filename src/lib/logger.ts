// ── Global Operational Logger ─────────────────────────────────────────────────
// Module-level singleton — callable from any hook, component, or API route.
// Server-side: console only (no localStorage). Client: console + localStorage ring buffer.
//
// Categories map directly to operational workflows:
//   mission  — load saves, mission state changes
//   event    — operational event logs (receiver delay, breakdown, etc.)
//   break    — break timer start/stop/complete
//   fuel     — fuel calculations, price lookups
//   hos      — HOS scan, parse, validation
//   ai       — AI insight requests and responses
//   sync     — Supabase write results (success or failure)
//   render   — slow render warnings (dev only)
//   guard    — runtime validation failures (NaN, missing fields, duplicate calls)

export type LogLevel    = 'info' | 'warn' | 'error' | 'debug'
export type LogCategory = 'mission' | 'event' | 'break' | 'fuel' | 'hos' | 'ai' | 'sync' | 'render' | 'guard'

export interface LogEntry {
  id:       string
  ts:       string       // ISO timestamp
  level:    LogLevel
  category: LogCategory
  message:  string
  data?:    unknown
}

const MAX_MEM = 100   // entries kept in-memory ring buffer
const MAX_LS  = 25    // entries persisted to localStorage
const LS_KEY  = '3b-op-log'

let _entries:   LogEntry[]       = []
let _listeners: Array<() => void> = []

function _uid(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

function _write(level: LogLevel, category: LogCategory, message: string, data?: unknown): void {
  const entry: LogEntry = { id: _uid(), ts: new Date().toISOString(), level, category, message, data }

  _entries = [entry, ..._entries].slice(0, MAX_MEM)

  // Dev console — only outside production builds
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const tag = `[3B:${category}]`
    if      (level === 'error') console.error(tag, message, ...(data !== undefined ? [data] : []))
    else if (level === 'warn')  console.warn( tag, message, ...(data !== undefined ? [data] : []))
    else if (level === 'debug') console.debug(tag, message, ...(data !== undefined ? [data] : []))
    else                        console.info( tag, message, ...(data !== undefined ? [data] : []))
  }

  // Persist to localStorage (client only, non-blocking)
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_entries.slice(0, MAX_LS))) } catch { /* quota */ }
  }

  // Notify React subscribers (DebugPanel, etc.)
  _listeners.forEach(fn => { try { fn() } catch { /* ignore bad listener */ } })
}

// ── Public API ────────────────────────────────────────────────────────────────
export const opLog = {
  // Generic levelled methods
  info:  (cat: LogCategory, msg: string, data?: unknown) => _write('info',  cat, msg, data),
  warn:  (cat: LogCategory, msg: string, data?: unknown) => _write('warn',  cat, msg, data),
  error: (cat: LogCategory, msg: string, data?: unknown) => _write('error', cat, msg, data),
  debug: (cat: LogCategory, msg: string, data?: unknown) => _write('debug', cat, msg, data),

  // Category shortcuts — the ones hooks actually call
  mission: (msg: string, data?: unknown) => _write('info',  'mission', msg, data),
  event:   (msg: string, data?: unknown) => _write('info',  'event',   msg, data),
  break:   (msg: string, data?: unknown) => _write('info',  'break',   msg, data),
  fuel:    (msg: string, data?: unknown) => _write('info',  'fuel',    msg, data),
  hos:     (msg: string, data?: unknown) => _write('info',  'hos',     msg, data),
  ai:      (msg: string, data?: unknown) => _write('info',  'ai',      msg, data),
  sync:    (msg: string, data?: unknown) => _write('info',  'sync',    msg, data),
  syncErr: (msg: string, data?: unknown) => _write('error', 'sync',    msg, data),
  guard:   (msg: string, data?: unknown) => _write('warn',  'guard',   msg, data),
  render:  (msg: string, data?: unknown) => _write('debug', 'render',  msg, data),
}

/** Snapshot of current in-memory log entries (newest first). */
export function getLogEntries(): LogEntry[] {
  return [..._entries]
}

/** Subscribe to log writes. Returns unsubscribe function. */
export function subscribeToLog(fn: () => void): () => void {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(l => l !== fn) }
}

/** Read persisted entries from localStorage (for cold debug panel load). */
export function readPersistedLog(): LogEntry[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    return raw ? (JSON.parse(raw) as LogEntry[]) : []
  } catch { return [] }
}
