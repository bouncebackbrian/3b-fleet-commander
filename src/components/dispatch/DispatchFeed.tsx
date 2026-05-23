'use client'
/**
 * DispatchFeed — Control tower view.
 *
 * Three panels:
 *   1. Active Mission card with progress bar + last update
 *   2. Escalation Queue (critical/warning, requires human action)
 *   3. Full update feed (all driver updates chronologically)
 *
 * Reads from dispatchEngine localStorage layer.
 * Dispatchers can own/resolve escalations and log actions.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  readDriverUpdates,
  readDispatchAlerts,
  readEscalations,
  ownEscalation,
  resolveEscalation,
  logHumanAction,
  buildMissionProgress,
  UPDATE_META,
  timeAgo,
  severityColor,
  severityBg,
  type DriverUpdate,
  type DispatchAlert,
  type Escalation,
  type MissionProgress,
  type HumanAction,
  type ActionType,
} from '@/lib/dispatchEngine'

import {
  readFleetAlerts,
  acknowledgeAlert,
  TIER_META,
  CATEGORY_META,
  type FleetAlert,
} from '@/lib/alertEngine'

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  card:    { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' } as React.CSSProperties,
  sec:     { fontSize: '.62rem', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase' as const, letterSpacing: '.1em' },
  btn:     { padding: '.35rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.72rem', cursor: 'pointer' } as React.CSSProperties,
  btnPri:  { padding: '.35rem .75rem', borderRadius: 8, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.72rem', cursor: 'pointer' } as React.CSSProperties,
  inp:     { width: '100%', padding: '.5rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' as const },
}

// ── Mission progress bar ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending:            '📍 Not started',
  en_route_pickup:    '🚛 En route to pickup',
  at_pickup:          '📍 At pickup',
  loaded:             '📦 Loaded',
  en_route_delivery:  '🚛 En route to delivery',
  at_delivery:        '🏁 At delivery',
  delivered:          '✅ Delivered',
  issue:              '⚠️ Issue reported',
}

function MissionCard({ mission }: { mission: MissionProgress }) {
  const alertCount = mission.alerts.length + mission.escalations.length
  const pctFill = Math.max(2, mission.pct)

  return (
    <div style={{ ...S.card, border: '1px solid rgba(0,232,176,.2)' }}>
      <div style={{ padding: '.85rem 1rem', background: 'rgba(0,232,176,.03)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8, marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '.9rem' }}>Load #{mission.loadNumber}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 1 }}>
              {mission.driverName} · {mission.origin} → {mission.destination}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '.68rem', fontWeight: 800, color: mission.status === 'delivered' ? 'var(--success)' : mission.status === 'issue' ? 'var(--error)' : 'var(--primary)' }}>
              {STATUS_LABELS[mission.status] ?? mission.status}
            </div>
            {alertCount > 0 && (
              <div style={{ fontSize: '.62rem', color: 'var(--error)', fontWeight: 700, marginTop: 2 }}>
                {alertCount} open alert{alertCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Pickup complete</span>
            <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Delivered</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 5,
              width: `${pctFill}%`,
              background: mission.status === 'issue' ? 'var(--error)' : mission.status === 'delivered' ? 'var(--success)' : 'var(--primary)',
              transition: 'width .6s cubic-bezier(.16,1,.3,1)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: '.6rem', color: 'var(--primary)', fontWeight: 700 }}>{mission.pct}% complete</span>
            {mission.etaSlipMins > 0 && (
              <span style={{ fontSize: '.6rem', color: 'var(--error)', fontWeight: 700 }}>
                ⏱ ETA slipping +{Math.floor(mission.etaSlipMins / 60)}h {mission.etaSlipMins % 60}m
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Last update */}
      {mission.lastUpdate && (
        <div style={{ padding: '.6rem 1rem', display: 'flex', gap: 8, alignItems: 'start' }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1 }}>{UPDATE_META[mission.lastUpdate.type].emoji}</span>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--text)' }}>
              {UPDATE_META[mission.lastUpdate.type].label}
            </div>
            {mission.lastUpdate.location && (
              <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>📍 {mission.lastUpdate.location}</div>
            )}
            {mission.lastUpdate.notes && (
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>{mission.lastUpdate.notes}</div>
            )}
            <div style={{ fontSize: '.6rem', color: 'var(--faint)', marginTop: 2 }}>{timeAgo(mission.lastUpdate.timestamp)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Escalation card ───────────────────────────────────────────────────────────

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'acknowledged',       label: 'Acknowledged' },
  { value: 'contacted_driver',   label: 'Contacted driver' },
  { value: 'contacted_customer', label: 'Contacted customer/broker' },
  { value: 'rerouted',           label: 'Rerouted' },
  { value: 'scheduled_repair',   label: 'Scheduled repair' },
  { value: 'filed_claim',        label: 'Filed claim' },
  { value: 'notified_broker',    label: 'Notified broker' },
  { value: 'extended_delivery',  label: 'Extended delivery window' },
  { value: 'load_reassigned',    label: 'Load reassigned' },
  { value: 'note_added',         label: 'Note added' },
  { value: 'resolved',           label: 'Resolved — close escalation' },
]

function EscalationCard({ esc, onUpdate }: { esc: Escalation; onUpdate: () => void }) {
  const [expanded,    setExpanded]    = useState(esc.severity === 'critical')
  const [actor,       setActor]       = useState('')
  const [actionType,  setActionType]  = useState<ActionType>('acknowledged')
  const [note,        setNote]        = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  const color  = esc.severity === 'critical' ? 'var(--error)' : 'var(--warn)'
  const bg     = esc.severity === 'critical' ? 'rgba(232,64,0,.07)' : 'rgba(245,194,0,.06)'
  const border = esc.severity === 'critical' ? 'rgba(232,64,0,.25)' : 'rgba(245,194,0,.22)'

  function submitAction() {
    if (!actor.trim()) return
    setSubmitting(true)
    if (actionType === 'resolved') {
      resolveEscalation(esc.id, actor, note)
    } else {
      logHumanAction({ escalationId: esc.id, loadNumber: esc.loadNumber, actor, action: actionType, note })
      ownEscalation(esc.id, actor)
    }
    setNote(''); setSubmitting(false)
    onUpdate()
  }

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 14, background: bg, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '.75rem .9rem', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'start' }}
      >
        <div style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>
          {esc.severity === 'critical' ? '🚨' : '⚠️'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: '.85rem', color, lineHeight: 1.3 }}>{esc.title}</div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: '.58rem', fontWeight: 800, padding: '.2rem .45rem', borderRadius: 4, background: bg, color, border: `1px solid ${border}` }}>
                {esc.status.toUpperCase()}
              </span>
              <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
            </div>
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
            Load #{esc.loadNumber} · {timeAgo(esc.createdAt)}
            {esc.ownedBy && ` · Owned by ${esc.ownedBy}`}
          </div>
          {esc.body && <div style={{ fontSize: '.72rem', color: 'var(--text)', marginTop: 3, lineHeight: 1.5 }}>{esc.body}</div>}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '.6rem .9rem', borderTop: `1px solid ${border}`, background: 'var(--surface)' }}>
          {/* Action log */}
          {esc.actionLog.length > 0 && (
            <div style={{ marginBottom: '.65rem' }}>
              <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '.35rem' }}>Actions logged</div>
              {esc.actionLog.map(a => (
                <div key={a.id} style={{ fontSize: '.68rem', color: 'var(--muted)', marginBottom: '.25rem', paddingLeft: '.5rem', borderLeft: '2px solid var(--border)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{a.actor}</span> — {a.action.replace(/_/g, ' ')}
                  {a.note && `: ${a.note}`}
                  <span style={{ marginLeft: 6, color: 'var(--faint)' }}>{timeAgo(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Human action form */}
          {esc.status !== 'resolved' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Log Action</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                <input value={actor} onChange={e => setActor(e.target.value)} placeholder="Dispatcher name" style={S.inp} />
                <select value={actionType} onChange={e => setActionType(e.target.value as ActionType)} style={S.inp}>
                  {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" style={S.inp} />
              <button
                onClick={submitAction}
                disabled={!actor.trim() || submitting}
                style={{ ...S.btnPri, opacity: !actor.trim() ? .5 : 1 }}
              >
                {actionType === 'resolved' ? '✅ Resolve & Close' : '💾 Log Action'}
              </button>
            </div>
          )}

          {esc.status === 'resolved' && (
            <div style={{ fontSize: '.72rem', color: 'var(--success)', fontWeight: 700, textAlign: 'center', padding: '.35rem' }}>
              ✅ Resolved {esc.resolvedAt ? timeAgo(esc.resolvedAt) : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Update row ────────────────────────────────────────────────────────────────

function UpdateRow({ u }: { u: DriverUpdate }) {
  const meta  = UPDATE_META[u.type]
  const color = severityColor(u.severity)
  const bg    = u.severity !== 'info' ? severityBg(u.severity) : 'transparent'

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'start', padding: '.55rem .9rem', borderBottom: '1px solid var(--border)', background: bg }}>
      <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{meta.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: '.8rem', color: u.severity !== 'info' ? color : 'var(--text)' }}>{meta.label}</span>
          <span style={{ fontSize: '.62rem', color: 'var(--faint)', flexShrink: 0 }}>{timeAgo(u.timestamp)}</span>
        </div>
        {u.location && <div style={{ fontSize: '.7rem', color: 'var(--primary)', marginTop: 1 }}>📍 {u.location}</div>}
        {u.notes    && <div style={{ fontSize: '.7rem', color: 'var(--muted)',   marginTop: 1, lineHeight: 1.45 }}>{u.notes}</div>}
        <div style={{ fontSize: '.62rem', color: 'var(--faint)', marginTop: 2 }}>
          {u.driverName} · Load #{u.loadNumber}
          {u.hosDrive != null && ` · Drive: ${u.hosDrive.toFixed(1)}h`}
        </div>
      </div>
      {u.severity !== 'info' && (
        <span style={{ fontSize: '.58rem', fontWeight: 800, padding: '.2rem .45rem', borderRadius: 4, flexShrink: 0, marginTop: 2, color, border: `1px solid ${color}`, background: bg }}>
          {u.severity.toUpperCase()}
        </span>
      )}
    </div>
  )
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ a, onAck }: { a: FleetAlert; onAck: () => void }) {
  const meta = TIER_META[a.tier]
  const cat  = CATEGORY_META[a.category]

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'start', padding: '.6rem .9rem', borderBottom: '1px solid var(--border)', background: meta.bg }}>
      <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{meta.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
          <span style={{ fontWeight: 800, fontSize: '.8rem', color: meta.color }}>{a.title}</span>
          <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '.15rem .4rem', borderRadius: 4, color: meta.color, border: `1px solid ${meta.border}`, background: 'var(--surface)', flexShrink: 0 }}>
            {meta.label.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: '.7rem', color: 'var(--muted)', lineHeight: 1.45 }}>{a.body}</div>
        {a.confidence && (
          <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>
            {cat.emoji} {cat.label} · {a.confidence}% confidence
            {a.daysUntil ? ` · ~${a.daysUntil} days` : ''}
          </div>
        )}
        {a.detail && (
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5, fontStyle: 'italic' }}>{a.detail}</div>
        )}
      </div>
      {a.ackRequired && !a.acked && (
        <button onClick={onAck} style={{ ...S.btn, flexShrink: 0, fontSize: '.65rem', padding: '.3rem .6rem', color: meta.color, borderColor: meta.border }}>
          ACK
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  loadNumber?:  string    // filter to a specific load, or show all
  driverName?:  string
  origin?:      string
  destination?: string
  totalMiles?:  number
  estArrival?:  string
}

type FeedTab = 'escalations' | 'updates' | 'alerts'

export default function DispatchFeed({ loadNumber, driverName = 'Driver', origin = '', destination = '', totalMiles = 0, estArrival = '' }: Props) {
  const [tab,          setTab]          = useState<FeedTab>('escalations')
  const [updates,      setUpdates]      = useState<DriverUpdate[]>([])
  const [escalations,  setEscalations]  = useState<Escalation[]>([])
  const [fleetAlerts,  setFleetAlerts]  = useState<FleetAlert[]>([])
  const [mission,      setMission]      = useState<MissionProgress | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [tick,         setTick]         = useState(0)

  const refresh = useCallback(() => {
    const u  = readDriverUpdates(loadNumber)
    const e  = readEscalations(loadNumber)
    const fa = readFleetAlerts({ active: true })
    setUpdates(u)
    setEscalations(e)
    setFleetAlerts(fa)

    if (loadNumber) {
      const m = buildMissionProgress(loadNumber, { driverName, origin, destination, totalMiles, estArrival })
      setMission(m)
    }
  }, [loadNumber, driverName, origin, destination, totalMiles, estArrival])

  useEffect(() => { refresh() }, [refresh, tick])

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const openEsc     = escalations.filter(e => e.status === 'open' || e.status === 'owned')
  const resolvedEsc = escalations.filter(e => e.status === 'resolved')
  const criticalEsc = openEsc.filter(e => e.severity === 'critical')

  const tabCount: Record<FeedTab, number> = {
    escalations: openEsc.length,
    updates:     updates.length,
    alerts:      fleetAlerts.length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>

      {/* Mission card */}
      {mission && <MissionCard mission={mission} />}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3 }}>
        {([['escalations', '🚨 Escalations'], ['updates', '📡 Updates'], ['alerts', '⚡ Alerts']] as [FeedTab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '.45rem .2rem', borderRadius: 9, fontSize: '.65rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.04em', cursor: 'pointer',
            border: tab === t ? (t === 'escalations' && criticalEsc.length > 0 ? '1px solid rgba(232,64,0,.35)' : '1px solid var(--border)') : '1px solid transparent',
            background: tab === t ? (t === 'escalations' && criticalEsc.length > 0 ? 'rgba(232,64,0,.08)' : 'var(--surface-2)') : 'transparent',
            color: tab === t && t === 'escalations' && criticalEsc.length > 0 ? 'var(--error)' : tab === t ? 'var(--text)' : 'var(--muted)',
          }}>
            {label}
            {tabCount[t] > 0 && (
              <span style={{ marginLeft: 4, background: t === 'escalations' && criticalEsc.length > 0 ? 'var(--error)' : 'var(--primary)', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: '.58rem', fontWeight: 900 }}>
                {tabCount[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Escalation queue */}
      {tab === 'escalations' && (
        <div style={S.card}>
          {openEsc.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>✅</div>
              <div style={{ fontWeight: 700 }}>No open escalations</div>
              <div style={{ fontSize: '.72rem', marginTop: 3 }}>All clear — no critical or warning issues require action</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', padding: '.75rem' }}>
              {openEsc.map(e => <EscalationCard key={e.id} esc={e} onUpdate={refresh} />)}
            </div>
          )}

          {resolvedEsc.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '.5rem .75rem' }}>
              <button onClick={() => setShowResolved(r => !r)} style={{ ...S.btn, fontSize: '.65rem' }}>
                {showResolved ? '▲ Hide' : `▼ Show ${resolvedEsc.length} resolved`}
              </button>
              {showResolved && (
                <div style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '.4rem', opacity: .65 }}>
                  {resolvedEsc.map(e => <EscalationCard key={e.id} esc={e} onUpdate={refresh} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Driver update feed */}
      {tab === 'updates' && (
        <div style={S.card}>
          {updates.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📡</div>
              <div style={{ fontWeight: 700 }}>No updates yet</div>
              <div style={{ fontSize: '.72rem', marginTop: 3 }}>Driver updates will appear here in real time</div>
            </div>
          ) : (
            updates.map(u => <UpdateRow key={u.id} u={u} />)
          )}
        </div>
      )}

      {/* Fleet alerts */}
      {tab === 'alerts' && (
        <div style={S.card}>
          {fleetAlerts.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>⚡</div>
              <div style={{ fontWeight: 700 }}>No active alerts</div>
              <div style={{ fontSize: '.72rem', marginTop: 3 }}>System will flag tire trends, HOS risks, detention, and more</div>
            </div>
          ) : (
            fleetAlerts.map(a => (
              <AlertRow
                key={a.id}
                a={a}
                onAck={() => { acknowledgeAlert(a.id, 'Dispatcher'); refresh() }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
