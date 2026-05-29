'use client'
/**
 * RoleOpsView — Role-gated operational dashboard panels
 *
 * Surfaces the right intelligence for each user role:
 *
 *   driver          → Fatigue advisory, current mode, break countdown,
 *                     next recovery window, HOS clock summary
 *
 *   dispatcher      → Load health tiles, stall detection queue,
 *                     escalation queue, recent exceptions
 *
 *   owner_operator  → Fleet health overview, performance KPIs,
 *                     escalation summary, ops event summary
 *
 * Props:
 *   role   — current user role (from userMode / auth context)
 *   loadNumber? — pre-filter dispatcher/driver views to a load
 *
 * Data:
 *   All data read from localStorage engines — no server calls here.
 *   Mounts a 60s refresh interval for live updates.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  readOpsEvents,
  buildOpsEventSummary,
  type OpsEventSummary,
} from '@/lib/opsEventLog'
import {
  buildEscalationSummary,
  readTierRecords,
  readStallEscalations,
  type EscalationSummary,
  type EscalationTierRecord,
  type StallEscalation,
} from '@/lib/escalationEngine'
import {
  readActiveMode,
  readDetentionClock,
  deriveOpsStatus,
  type OpsStatus,
} from '@/lib/driverOpsEngine'
import {
  buildFleetHealthSummary,
  readHealthSnapshots,
  type FleetHealthSummary,
} from '@/lib/loadHealthEngine'

// ── Role types ────────────────────────────────────────────────────────────────

export type OpsRole = 'driver' | 'dispatcher' | 'owner_operator'

// ── Shared mini-components ────────────────────────────────────────────────────

function StatTile({
  label, value, color, bg, border,
}: { label: string; value: string | number; color: string; bg: string; border: string }) {
  return (
    <div style={{
      padding: '.5rem .65rem', borderRadius: 9, textAlign: 'center',
      background: bg, border: `1px solid ${border}`,
    }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '.52rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '.1em',
    }}>
      {label}
    </div>
  )
}

// ── Driver view ───────────────────────────────────────────────────────────────

function DriverView({ loadNumber }: { loadNumber?: string }) {
  const [ops, setOps] = useState<OpsStatus | null>(null)

  useEffect(() => {
    const refresh = () => {
      const mode = readActiveMode()
      if (!mode) { setOps(null); return }
      setOps(deriveOpsStatus(mode))
    }
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [])

  const hosRaw  = typeof window !== 'undefined' ? localStorage.getItem('3b-hos-data') : null
  const hosData = hosRaw ? (() => { try { return JSON.parse(hosRaw) } catch { return null } })() : null

  return (
    <div style={{ display: 'grid', gap: '.65rem' }}>

      {/* HOS snapshot */}
      {hosData && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="⏱ HOS Clock" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem' }}>
            <StatTile
              label="Drive Rem"
              value={`${hosData.driveRemainingHrs?.toFixed(1) ?? '--'}h`}
              color={hosData.driveRemainingHrs > 2 ? 'var(--primary)' : 'var(--error)'}
              bg={hosData.driveRemainingHrs > 2 ? 'rgba(0,232,176,.07)' : 'rgba(232,64,0,.07)'}
              border={hosData.driveRemainingHrs > 2 ? 'rgba(0,232,176,.2)' : 'rgba(232,64,0,.2)'}
            />
            <StatTile
              label="Shift Rem"
              value={`${hosData.shiftRemainingHrs?.toFixed(1) ?? '--'}h`}
              color={hosData.shiftRemainingHrs > 2 ? 'var(--warn)' : 'var(--error)'}
              bg="rgba(245,194,0,.07)" border="rgba(245,194,0,.2)"
            />
            <StatTile
              label="Cycle Rem"
              value={`${hosData.cycleRemainingHrs?.toFixed(0) ?? '--'}h`}
              color="var(--muted)" bg="var(--surface-2)" border="var(--border)"
            />
          </div>
        </div>
      )}

      {/* Current mode */}
      {ops && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="🎯 Current Mode" />
          <div style={{
            padding: '.6rem .75rem', borderRadius: 10,
            background: ops.meta.bg, border: `1px solid ${ops.meta.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '.75rem', fontWeight: 900, color: ops.meta.color }}>
                {ops.meta.emoji} {ops.meta.label}
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>
                {ops.timerLabel}
                {ops.isOverdue && <span style={{ color: 'var(--error)', marginLeft: 6 }}>⚠️ Overdue</span>}
              </div>
            </div>
            {ops.progressPct !== null && (
              <div style={{ fontSize: '.7rem', fontWeight: 900, color: ops.meta.color }}>
                {Math.round(ops.progressPct)}%
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detention status */}
      {ops?.detention?.active && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="🕐 Detention" />
          <div style={{
            padding: '.6rem .75rem', borderRadius: 10,
            background: ops.detention.freeTimeUsed ? 'rgba(232,64,0,.07)' : 'rgba(245,194,0,.07)',
            border: `1px solid ${ops.detention.freeTimeUsed ? 'rgba(232,64,0,.25)' : 'rgba(245,194,0,.25)'}`,
          }}>
            <div style={{ fontSize: '.65rem', fontWeight: 800, color: ops.detention.freeTimeUsed ? 'var(--error)' : 'var(--warn)' }}>
              {ops.detention.freeTimeUsed
                ? `🔴 Billable detention — ${ops.detention.detentionMins}m billed`
                : `🟡 Free time — ${ops.detention.elapsedMins}m elapsed`}
            </div>
          </div>
        </div>
      )}

      {/* No mode */}
      {!ops && (
        <div style={{
          padding: '.75rem', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center',
        }}>
          No active load — mode tracking inactive
        </div>
      )}
    </div>
  )
}

// ── Dispatcher view ───────────────────────────────────────────────────────────

function DispatcherView({ loadNumber }: { loadNumber?: string }) {
  const [escSummary,  setEscSummary]  = useState<EscalationSummary | null>(null)
  const [opsSummary,  setOpsSummary]  = useState<OpsEventSummary | null>(null)
  const [fleetHealth, setFleetHealth] = useState<FleetHealthSummary | null>(null)
  const [activeEsc,   setActiveEsc]   = useState<EscalationTierRecord[]>([])
  const [activeStalls,setActiveStalls]= useState<StallEscalation[]>([])

  const refresh = useCallback(() => {
    setEscSummary(buildEscalationSummary())
    setOpsSummary(buildOpsEventSummary(loadNumber ? { loadNumber } : undefined))
    setFleetHealth(buildFleetHealthSummary(readHealthSnapshots()))
    setActiveEsc(readTierRecords(loadNumber).filter(r => r.status === 'active').slice(0, 5))
    setActiveStalls(readStallEscalations().filter(s => !s.resolved && (!loadNumber || s.loadNumber === loadNumber)).slice(0, 5))
  }, [loadNumber])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div style={{ display: 'grid', gap: '.65rem' }}>

      {/* Fleet health tiles */}
      {fleetHealth && fleetHealth.totalLoads > 0 && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="🛰 Fleet Health" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
            <StatTile label="On Track"  value={fleetHealth.healthy}  color="var(--primary)"  bg="rgba(0,232,176,.07)" border="rgba(0,232,176,.2)" />
            <StatTile label="Monitor"   value={fleetHealth.monitor}  color="var(--warn)"     bg="rgba(245,194,0,.07)" border="rgba(245,194,0,.2)" />
            <StatTile label="At Risk"   value={fleetHealth.atRisk}   color="#f97316"         bg="rgba(249,115,22,.07)" border="rgba(249,115,22,.2)" />
            <StatTile label="Critical"  value={fleetHealth.critical} color="var(--error)"    bg="rgba(232,64,0,.07)" border="rgba(232,64,0,.2)" />
          </div>
        </div>
      )}

      {/* Escalation overview */}
      {escSummary && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="⚡ Escalations" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem' }}>
            <StatTile label="L1 Active"   value={escSummary.l1Count}      color="var(--warn)"  bg="rgba(245,194,0,.07)" border="rgba(245,194,0,.2)" />
            <StatTile label="L2+ Active"  value={escSummary.l2Count + escSummary.l3Count} color="var(--error)" bg="rgba(232,64,0,.07)" border="rgba(232,64,0,.2)" />
            <StatTile label="Active Stalls" value={escSummary.activeStalls} color="#f97316" bg="rgba(249,115,22,.07)" border="rgba(249,115,22,.2)" />
          </div>
        </div>
      )}

      {/* Active escalation records */}
      {activeEsc.length > 0 && (
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <SectionHeader label="📋 Active Escalations" />
          {activeEsc.map(r => (
            <div key={r.id} style={{
              padding: '.5rem .65rem', borderRadius: 9,
              background: r.tier === 'L3' || r.tier === 'L2' ? 'rgba(232,64,0,.06)' : 'rgba(245,194,0,.06)',
              border: `1px solid ${r.tier === 'L3' || r.tier === 'L2' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: '.62rem', fontWeight: 900, color: r.tier === 'L3' ? 'var(--error)' : r.tier === 'L2' ? '#f97316' : 'var(--warn)', minWidth: 24 }}>
                {r.tier}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.63rem', fontWeight: 700, color: 'var(--fg)' }}>
                  Load #{r.loadNumber}
                </div>
                <div style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
                  {r.triggerDetail ?? r.triggerType}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active stalls */}
      {activeStalls.length > 0 && (
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <SectionHeader label="🔴 Active Stalls" />
          {activeStalls.map(s => (
            <div key={s.id} style={{
              padding: '.5rem .65rem', borderRadius: 9,
              background: 'rgba(232,64,0,.06)', border: '1px solid rgba(232,64,0,.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: '1rem' }}>🛑</span>
              <div>
                <div style={{ fontSize: '.63rem', fontWeight: 700, color: 'var(--error)' }}>
                  Load #{s.loadNumber} — {s.stallMinutes}m stall
                </div>
                <div style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
                  {s.driverName ?? 'Driver'} · {s.currentTier}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ops events summary */}
      {opsSummary && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="📋 Event Log Summary" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem' }}>
            <StatTile label="Total"    value={opsSummary.total}    color="var(--muted)"  bg="var(--surface-2)" border="var(--border)" />
            <StatTile label="Open"     value={opsSummary.open}     color="var(--warn)"   bg="rgba(245,194,0,.07)" border="rgba(245,194,0,.2)" />
            <StatTile label="Critical" value={opsSummary.critical} color="var(--error)"  bg="rgba(232,64,0,.07)" border="rgba(232,64,0,.2)" />
          </div>
        </div>
      )}

      {escSummary?.openCount === 0 && (!fleetHealth || fleetHealth.totalLoads === 0) && (
        <div style={{
          padding: '.75rem', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center',
        }}>
          All clear — no active escalations. Build a trip to enable load health monitoring.
        </div>
      )}
    </div>
  )
}

// ── Owner/operator view ───────────────────────────────────────────────────────

function OwnerView() {
  const [fleetHealth, setFleetHealth] = useState<FleetHealthSummary | null>(null)
  const [opsSummary,  setOpsSummary]  = useState<OpsEventSummary  | null>(null)
  const [escSummary,  setEscSummary]  = useState<EscalationSummary | null>(null)
  const [recentCrit,  setRecentCrit]  = useState<ReturnType<typeof readOpsEvents>>([])

  const refresh = useCallback(() => {
    setFleetHealth(buildFleetHealthSummary(readHealthSnapshots()))
    setOpsSummary(buildOpsEventSummary())
    setEscSummary(buildEscalationSummary())
    setRecentCrit(readOpsEvents({ severity: 'critical', limit: 5 }))
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div style={{ display: 'grid', gap: '.65rem' }}>

      {/* Fleet performance */}
      {fleetHealth && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="🛰 Fleet Performance" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
            <StatTile label="Total Loads"  value={fleetHealth.totalLoads}  color="var(--muted)"  bg="var(--surface-2)" border="var(--border)" />
            <StatTile label="Avg Score"    value={fleetHealth.avgScore}     color={fleetHealth.avgScore >= 80 ? 'var(--primary)' : fleetHealth.avgScore >= 60 ? 'var(--warn)' : 'var(--error)'} bg="rgba(0,232,176,.06)" border="rgba(0,232,176,.2)" />
            <StatTile label="Active Stalls" value={fleetHealth.activeStalls} color={fleetHealth.activeStalls > 0 ? 'var(--error)' : 'var(--primary)'} bg={fleetHealth.activeStalls > 0 ? 'rgba(232,64,0,.07)' : 'rgba(0,232,176,.06)'} border={fleetHealth.activeStalls > 0 ? 'rgba(232,64,0,.2)' : 'rgba(0,232,176,.2)'} />
            <StatTile label="Critical"     value={fleetHealth.critical}     color="var(--error)"  bg="rgba(232,64,0,.07)" border="rgba(232,64,0,.2)" />
          </div>
        </div>
      )}

      {/* Risk summary */}
      {escSummary && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="⚡ Risk Summary" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
            <StatTile label="Escalations" value={escSummary.openCount}    color="var(--warn)"   bg="rgba(245,194,0,.07)" border="rgba(245,194,0,.2)" />
            <StatTile label="L2/L3"       value={escSummary.l2Count + escSummary.l3Count} color="var(--error)" bg="rgba(232,64,0,.07)" border="rgba(232,64,0,.2)" />
            <StatTile label="Stalls"      value={escSummary.activeStalls} color="#f97316"       bg="rgba(249,115,22,.07)" border="rgba(249,115,22,.2)" />
            <StatTile label="Top Tier"    value={escSummary.topTier ?? '—'} color={escSummary.topTier === 'L3' ? 'var(--error)' : escSummary.topTier === 'L2' ? '#f97316' : 'var(--muted)'} bg="var(--surface-2)" border="var(--border)" />
          </div>
        </div>
      )}

      {/* Ops event KPIs */}
      {opsSummary && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <SectionHeader label="📊 Ops Intelligence" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem' }}>
            <StatTile label="Events (Total)" value={opsSummary.total}    color="var(--muted)" bg="var(--surface-2)"     border="var(--border)" />
            <StatTile label="Open Items"     value={opsSummary.open}     color="var(--warn)"  bg="rgba(245,194,0,.07)"  border="rgba(245,194,0,.2)" />
            <StatTile label="Unsynced"       value={opsSummary.unsynced} color={opsSummary.unsynced > 0 ? '#f97316' : 'var(--primary)'} bg={opsSummary.unsynced > 0 ? 'rgba(249,115,22,.07)' : 'rgba(0,232,176,.06)'} border={opsSummary.unsynced > 0 ? 'rgba(249,115,22,.2)' : 'rgba(0,232,176,.2)'} />
          </div>
        </div>
      )}

      {/* Recent critical events */}
      {recentCrit.length > 0 && (
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <SectionHeader label="🚨 Recent Critical Events" />
          {recentCrit.map(e => (
            <div key={e.id} style={{
              padding: '.45rem .65rem', borderRadius: 9,
              background: 'rgba(232,64,0,.06)', border: '1px solid rgba(232,64,0,.2)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: '.6rem' }}>🔴</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--error)' }}>{e.title}</div>
                <div style={{ fontSize: '.55rem', color: 'var(--muted)' }}>
                  {e.loadNumber ? `#${e.loadNumber} · ` : ''}{new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {fleetHealth?.totalLoads === 0 && (
        <div style={{
          padding: '.75rem', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center',
        }}>
          No active loads — build a trip to begin fleet performance tracking
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  role:         OpsRole
  loadNumber?:  string
}

export default function RoleOpsView({ role, loadNumber }: Props) {
  const roleLabel: Record<OpsRole, string> = {
    driver:         '🚛 Driver View',
    dispatcher:     '📡 Dispatcher View',
    owner_operator: '🏢 Owner/Operator View',
  }

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      {/* Role badge */}
      <div style={{
        fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '.1em',
        padding: '.4rem .75rem', borderRadius: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'inline-flex', alignSelf: 'start',
      }}>
        {roleLabel[role]}
      </div>

      {role === 'driver'         && <DriverView     loadNumber={loadNumber} />}
      {role === 'dispatcher'     && <DispatcherView  loadNumber={loadNumber} />}
      {role === 'owner_operator' && <OwnerView />}
    </div>
  )
}
