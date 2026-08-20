'use client'
/**
 * notificationRouter.ts — Pluggable Notification Delivery Layer
 *
 * Routes alerts from any engine to any channel with configurable
 * per-role and per-channel settings. Wraps the lower-level
 * escalationEngine notification records with structured delivery adapters.
 *
 * Channels:
 *   teams    → NEXT_PUBLIC_TEAMS_WEBHOOK (MS Teams incoming webhook)
 *   sms      → NEXT_PUBLIC_SMS_ENDPOINT  (Twilio or equivalent)
 *   email    → NEXT_PUBLIC_EMAIL_ENDPOINT
 *   in_app   → writes NotificationRecord to localStorage (always available)
 *
 * Architecture:
 *   1. Build a NotificationPayload from the triggering event
 *   2. Look up channel config (LS key: 3b-notification-config)
 *   3. Deliver to each enabled channel
 *   4. Log each attempt to opsEventLog as 'notification_sent' or 'notification_failed'
 *
 * LS key: 3b-notification-config
 */

import { logNotificationEvent } from '@/lib/opsEventLog'
import type { EscalationTier, EscalationRole } from '@/lib/escalationEngine'

// ── Channel config ────────────────────────────────────────────────────────────

export type NotifyChannel = 'teams' | 'sms' | 'email' | 'in_app'

export interface ChannelConfig {
  enabled:    boolean
  endpoint?:  string    // override env var (optional — falls back to env)
}

export interface NotificationConfig {
  teams:  ChannelConfig
  sms:    ChannelConfig
  email:  ChannelConfig
  in_app: ChannelConfig
  // Minimum tier to actually send (below this tier → in_app only)
  minTierForExternal: EscalationTier
  // Custom sender name shown in messages
  senderName: string
}

const LS_CONFIG = '3b-notification-config'

const DEFAULT_CONFIG: NotificationConfig = {
  teams:  { enabled: false },
  sms:    { enabled: false },
  email:  { enabled: false },
  in_app: { enabled: true },
  minTierForExternal: 'L1',
  senderName: 'Fleet Commander',
}

export function readNotificationConfig(): NotificationConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(LS_CONFIG)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
  } catch { return DEFAULT_CONFIG }
}

export function saveNotificationConfig(config: NotificationConfig): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_CONFIG, JSON.stringify(config)) }
  catch { /* ignore */ }
}

// ── In-app notification store ─────────────────────────────────────────────────

export interface InAppNotification {
  id:         string
  createdAt:  string
  title:      string
  body:       string
  severity:   'info' | 'warning' | 'critical'
  loadNumber?: string | null
  tier?:       EscalationTier
  role?:       EscalationRole
  read:       boolean
  actionUrl?: string
}

const LS_INAPP    = '3b-inapp-notifications'
const MAX_INAPP   = 200

export function readInAppNotifications(): InAppNotification[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_INAPP) ?? '[]') }
  catch { return [] }
}

export function saveInAppNotification(n: InAppNotification): void {
  if (typeof window === 'undefined') return
  try {
    const all = readInAppNotifications()
    all.unshift(n)
    localStorage.setItem(LS_INAPP, JSON.stringify(all.slice(0, MAX_INAPP)))
  } catch { /* ignore */ }
}

export function markInAppRead(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const all = readInAppNotifications()
    const idx = all.findIndex(n => n.id === id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], read: true }
      localStorage.setItem(LS_INAPP, JSON.stringify(all))
    }
  } catch { /* ignore */ }
}

export function markAllInAppRead(): void {
  if (typeof window === 'undefined') return
  try {
    const all = readInAppNotifications().map(n => ({ ...n, read: true }))
    localStorage.setItem(LS_INAPP, JSON.stringify(all))
  } catch { /* ignore */ }
}

export function countUnread(): number {
  return readInAppNotifications().filter(n => !n.read).length
}

// ── Route notification ────────────────────────────────────────────────────────

export interface RouteNotificationOpts {
  title:       string
  body:        string
  severity:    'info' | 'warning' | 'critical'
  loadNumber?: string
  tier?:       EscalationTier
  role?:       EscalationRole
  channels?:   NotifyChannel[]   // override config — send to these channels
  actionUrl?:  string
}

/**
 * routeNotification — deliver a notification to one or more channels.
 *
 * Always writes to in-app store. External channels (teams/sms/email) only fire
 * when enabled in config and tier >= minTierForExternal.
 */
export async function routeNotification(opts: RouteNotificationOpts): Promise<void> {
  const config   = readNotificationConfig()
  const tierOrder: EscalationTier[] = ['L0', 'L1', 'L2', 'L3']
  const minIdx   = tierOrder.indexOf(config.minTierForExternal)
  const tierIdx  = opts.tier ? tierOrder.indexOf(opts.tier) : -1
  const external = tierIdx >= minIdx

  // Channels to route to
  const target: NotifyChannel[] = opts.channels ?? ['in_app', 'teams', 'sms', 'email']

  const promises: Promise<void>[] = []

  for (const ch of target) {
    if (ch === 'in_app') {
      promises.push(deliverInApp(opts))
    } else if (external && config[ch].enabled) {
      promises.push(deliverExternal(ch, opts, config))
    }
  }

  await Promise.allSettled(promises)
}

// ── In-app delivery ───────────────────────────────────────────────────────────

async function deliverInApp(opts: RouteNotificationOpts): Promise<void> {
  const n: InAppNotification = {
    id:         `ian-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt:  new Date().toISOString(),
    title:      opts.title,
    body:       opts.body,
    severity:   opts.severity,
    loadNumber: opts.loadNumber ?? null,
    tier:       opts.tier,
    role:       opts.role,
    read:       false,
    actionUrl:  opts.actionUrl,
  }
  saveInAppNotification(n)
  logNotificationEvent({
    loadNumber: opts.loadNumber,
    title:      `In-app notification: ${opts.title}`,
    payload: { channel: 'in_app', status: 'sent', escalationTier: opts.tier },
  })
}

// ── External channel delivery ─────────────────────────────────────────────────

async function deliverExternal(
  channel:  NotifyChannel,
  opts:     RouteNotificationOpts,
  config:   NotificationConfig,
): Promise<void> {
  // Teams no longer delivers from the browser — a client-exposed webhook
  // URL (NEXT_PUBLIC_TEAMS_WEBHOOK, or one typed into a public settings
  // field) is a leaked secret by definition. Dump Truck Mode's Teams
  // integration (fleet/dumpTruck/teamsNotify.ts) sends server-side only,
  // per-business, from real operational events. Route Teams notifications
  // there instead of through this client-side dispatcher.
  if (channel === 'teams') {
    logNotificationEvent({
      loadNumber: opts.loadNumber,
      title:      `Teams notification skipped — this channel now sends server-side only (Dump Truck Setup → Microsoft Teams)`,
      payload: { channel, status: 'sent', escalationTier: opts.tier },
    })
    return
  }

  // Resolve endpoint: channel config override > env var
  const envMap: Record<NotifyChannel, string> = {
    teams:  '',
    sms:    process.env.NEXT_PUBLIC_SMS_ENDPOINT    ?? '',
    email:  process.env.NEXT_PUBLIC_EMAIL_ENDPOINT  ?? '',
    in_app: '',
  }
  const endpoint = config[channel as 'teams' | 'sms' | 'email'].endpoint ?? envMap[channel]

  if (!endpoint) {
    // No endpoint configured — log as skipped (info, not failure)
    logNotificationEvent({
      loadNumber: opts.loadNumber,
      title:      `${channel.toUpperCase()} notification skipped — no endpoint configured`,
      payload: { channel, status: 'sent', escalationTier: opts.tier },
    })
    return
  }

  const body = buildPayload(channel, opts, config.senderName)

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    logNotificationEvent({
      loadNumber: opts.loadNumber,
      title:      `${channel.toUpperCase()} notification ${res.ok ? 'sent' : 'failed'} — ${opts.title}`,
      payload: {
        channel,
        status:        res.ok ? 'sent' : 'failed',
        escalationTier: opts.tier,
        error:         res.ok ? undefined : `HTTP ${res.status}`,
      },
    })
  } catch (err) {
    logNotificationEvent({
      loadNumber: opts.loadNumber,
      title:      `${channel.toUpperCase()} notification failed — ${opts.title}`,
      payload: {
        channel,
        status: 'failed',
        escalationTier: opts.tier,
        error:  err instanceof Error ? err.message : 'Network error',
      },
    })
  }
}

// ── Payload builders per channel ──────────────────────────────────────────────

function buildPayload(
  channel:    NotifyChannel,
  opts:       RouteNotificationOpts,
  senderName: string,
): unknown {
  const loadTag = opts.loadNumber ? ` — Load #${opts.loadNumber}` : ''
  const tierTag = opts.tier ? ` [${opts.tier}]` : ''

  if (channel === 'teams') {
    // MS Teams Adaptive Card (simple message card format)
    return {
      '@type':      'MessageCard',
      '@context':   'http://schema.org/extensions',
      summary:      opts.title,
      themeColor:   opts.severity === 'critical' ? 'E84000' : opts.severity === 'warning' ? 'F5C200' : '00E8B0',
      title:        `${tierTag}${loadTag} — ${opts.title}`,
      text:         opts.body,
      potentialAction: opts.actionUrl ? [{
        '@type': 'OpenUri',
        name:    'Open Fleet Commander',
        targets: [{ os: 'default', uri: opts.actionUrl }],
      }] : [],
    }
  }

  if (channel === 'sms') {
    return {
      to:   opts.role ?? 'dispatcher',
      from: senderName,
      body: `${senderName}${tierTag}${loadTag}: ${opts.title}. ${opts.body}`,
    }
  }

  if (channel === 'email') {
    return {
      to:      opts.role ?? 'dispatcher',
      from:    senderName,
      subject: `${tierTag} Fleet Alert${loadTag}: ${opts.title}`,
      text:    `${opts.title}\n\n${opts.body}\n\n— ${senderName}`,
      html:    `<h2>${opts.title}</h2><p>${opts.body}</p><hr/><small>${senderName}</small>`,
    }
  }

  return { title: opts.title, body: opts.body }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface NotificationSummary {
  total:    number
  unread:   number
  critical: number
  warning:  number
}

export function buildNotificationSummary(): NotificationSummary {
  const all = readInAppNotifications()
  return {
    total:    all.length,
    unread:   all.filter(n => !n.read).length,
    critical: all.filter(n => n.severity === 'critical').length,
    warning:  all.filter(n => n.severity === 'warning').length,
  }
}
