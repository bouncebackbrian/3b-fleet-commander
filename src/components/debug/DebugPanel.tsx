'use client'
import { useState, useEffect } from 'react'
import { getLogEntries, readPersistedLog, subscribeToLog } from '@/lib/logger'
import { isSupabaseReady } from '@/lib/supabase'
import type { LogEntry } from '@/lib/logger'
import type { LoadMission, OperationalEvent, SyncState } from '@/lib/dashboard/types'
import type { FuelIntelResult } from '@/lib/scoreLoad'

interface Props {
  mission:     LoadMission | null
  syncState:   SyncState
  isOnline:    boolean
  breakActive: boolean
  breakSecs:   number
  opEvents:    OperationalEvent[]
  missionFuel: FuelIntelResult | null
}

// ── Small sub-components ──────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '.8rem' }}>
      <div style={{ color: '#4a6', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ k, v, col }: { k: string; v: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
      <span style={{ color: '#567', fontSize: '.7rem' }}>{k}</span>
      <span style={{ color: col ?? '#aad', fontWeight: 700, fontSize: '.7rem', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div style={{ color: '#456', fontSize: '.7rem', fontStyle: 'italic' }}>{label}</div>
}

// ── Sync state colors ─────────────────────────────────────────────────────────
const syncColor = (s: SyncState) => ({
  saved:      '#00e8b0',
  saving:     '#f5c200',
  failed:     '#e84000',
  local_only: '#888',
  idle:       '#556',
}[s])

// ── Level indicator ───────────────────────────────────────────────────────────
const levelGlyph = (l: string) => l === 'error' ? '✕' : l === 'warn' ? '!' : l === 'debug' ? '·' : '›'
const levelColor = (l: string) => l === 'error' ? '#e84000' : l === 'warn' ? '#f5c200' : l === 'debug' ? '#445' : '#4a6'

export default function DebugPanel({ mission, syncState, isOnline, breakActive, breakSecs, opEvents, missionFuel }: Props) {
  const [visible, setVisible] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [logs,    setLogs]    = useState<LogEntry[]>([])

  useEffect(() => {
    // Show in dev builds OR when debugMode flag is set manually
    const isDev       = process.env.NODE_ENV !== 'production'
    const debugMode   = localStorage.getItem('debugMode') === 'true'
    setVisible(isDev || debugMode)

    // Seed from persisted log first, then live in-memory
    setLogs(getLogEntries().length > 0 ? getLogEntries() : readPersistedLog())

    // Subscribe to live log writes
    return subscribeToLog(() => setLogs(getLogEntries()))
  }, [])

  if (!visible) return null

  const recentLogs = logs.slice(0, 20)
  const sbReady    = isSupabaseReady()

  return (
    <>
      {/* Floating toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Debug panel (dev only)"
        style={{
          position: 'fixed', bottom: 100, right: 12, zIndex: 500,
          padding: '.3rem .6rem', borderRadius: 8,
          background: open ? 'rgba(0,232,176,.12)' : 'rgba(12,24,22,.94)',
          color: open ? 'var(--primary)' : '#4a6',
          border: `1px solid ${open ? 'rgba(0,232,176,.3)' : 'rgba(0,232,176,.15)'}`,
          fontSize: '.65rem', fontWeight: 900, cursor: 'pointer',
          fontFamily: 'monospace', letterSpacing: '.05em',
          boxShadow: '0 2px 12px rgba(0,0,0,.5)',
        }}
      >
        {open ? '✕ DBG' : '🛠 DBG'}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 140, right: 12, zIndex: 499,
          width: 'min(360px, calc(100vw - 24px))',
          maxHeight: '72dvh', overflowY: 'auto',
          background: 'rgba(8,20,18,.97)',
          border: '1px solid rgba(0,232,176,.18)',
          borderRadius: 14, padding: '1rem',
          boxShadow: '0 8px 40px rgba(0,0,0,.7)',
          fontFamily: 'monospace',
        }}>
          <div style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '.75rem', marginBottom: '.9rem', letterSpacing: '.04em' }}>
            🛠 Fleet Commander Debug
          </div>

          {/* ── Mission ── */}
          <Section label="Mission">
            {mission ? (
              <>
                <Row k="id"      v={mission.id.slice(0, 8) + '…'} />
                <Row k="load#"   v={mission.loadNumber || '—'} />
                <Row k="route"   v={`${mission.origin.split(',')[0]} → ${mission.destination.split(',')[0]}`} col="#aad" />
                <Row k="miles"   v={`${mission.dispatchMiles} loaded / ${mission.deadheadMiles} DH`} />
                <Row k="gross"   v={`$${mission.grossRate.toLocaleString()}`} col="#00e8b0" />
              </>
            ) : <Empty label="no active mission" />}
          </Section>

          {/* ── Sync ── */}
          <Section label="Sync / Network">
            <Row k="sync"     v={syncState}           col={syncColor(syncState)} />
            <Row k="online"   v={isOnline ? 'yes' : 'OFFLINE'} col={isOnline ? '#00e8b0' : '#e84000'} />
            <Row k="supabase" v={sbReady ? 'configured' : 'NOT CONFIGURED'} col={sbReady ? '#00e8b0' : '#e84000'} />
          </Section>

          {/* ── Break timer ── */}
          <Section label="Break Timer">
            <Row k="active" v={breakActive ? 'RUNNING' : 'idle'} col={breakActive ? '#f5c200' : '#556'} />
            {breakActive && <Row k="elapsed" v={`${Math.floor(breakSecs / 60)}m ${breakSecs % 60}s`} col="#f5c200" />}
          </Section>

          {/* ── Fuel ── */}
          <Section label="Fuel Calc">
            {missionFuel && missionFuel.totalMiles > 0 ? (
              <>
                <Row k="total mi"  v={`${missionFuel.totalMiles}`} />
                <Row k="gallons"   v={`${missionFuel.gallonsNeeded}`} />
                <Row k="est. cost" v={`$${missionFuel.fuelCostTotal.toFixed(0)}`} col="#f5c200" />
                <Row k="$/gal"     v={`$${missionFuel.priceUsed.toFixed(3)}${missionFuel.priceIsDefault ? ' (est)' : ''}`} />
              </>
            ) : <Empty label="no fuel data" />}
          </Section>

          {/* ── Op Events (this mission) ── */}
          <Section label={`Op Events (${opEvents.length} this run)`}>
            {opEvents.length > 0 ? opEvents.slice(0, 5).map(e => (
              <Row
                key={e.id}
                k={e.eventType}
                v={e.severity}
                col={e.severity === 'critical' ? '#e84000' : e.severity === 'warn' ? '#f5c200' : '#00e8b0'}
              />
            )) : <Empty label="none logged yet" />}
          </Section>

          {/* ── Log tail ── */}
          <Section label={`Op Log (${logs.length} entries)`}>
            {recentLogs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {recentLogs.map(e => (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '0 6px', lineHeight: 1.5 }}>
                    <span style={{ color: levelColor(e.level), fontSize: '.65rem' }}>{levelGlyph(e.level)}</span>
                    <span style={{ color: '#4a6', fontSize: '.65rem', whiteSpace: 'nowrap' }}>{e.category}</span>
                    <span style={{ color: '#9ab', fontSize: '.68rem', wordBreak: 'break-word' }}>{e.message}</span>
                  </div>
                ))}
              </div>
            ) : <Empty label="no entries yet" />}
          </Section>

          <div style={{ fontSize: '.6rem', color: '#334', textAlign: 'center', marginTop: '.5rem' }}>
            Set localStorage.debugMode=&apos;true&apos; to enable in prod
          </div>
        </div>
      )}
    </>
  )
}
