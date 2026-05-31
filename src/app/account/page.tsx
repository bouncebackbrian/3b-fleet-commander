'use client'
/**
 * /account — Fleet Commander Account Settings
 *
 * Sections:
 *   1. Load Board Connections — connect DAT, Truckstop, 123LB, Loadsmart, Uber Freight
 *   2. Notification Settings — Teams webhook, SMS, email endpoints
 *   3. Billing Overview — active modules, pending fees
 *   4. Team Members — business membership management
 */

import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import { BOARD_META, type LoadBoardId } from '@/lib/loadBoards/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoardConnection {
  board:        LoadBoardId
  displayName?: string
  authType:     string
  enabled:      boolean
  lastSyncedAt?: string | null
  lastError?:   string | null
  connected:    boolean
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: '1rem 1.1rem',
}
const sectionLabel: React.CSSProperties = {
  fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.1em',
  marginBottom: '.65rem',
}
const inp: React.CSSProperties = {
  width: '100%', fontSize: '.68rem', padding: '.38rem .55rem',
  borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--fg)',
  boxSizing: 'border-box',
}
const saveBtn: React.CSSProperties = {
  fontSize: '.65rem', fontWeight: 800,
  padding: '.38rem .75rem', borderRadius: 7,
  background: 'var(--primary)', color: 'var(--surface)',
  border: 'none', cursor: 'pointer',
}
const cancelBtn: React.CSSProperties = {
  fontSize: '.65rem', fontWeight: 700,
  padding: '.38rem .75rem', borderRadius: 7,
  background: 'var(--surface-2)', color: 'var(--muted)',
  border: '1px solid var(--border)', cursor: 'pointer',
}

// ── Board connection card ─────────────────────────────────────────────────────

const BOARD_ORDER: LoadBoardId[] = ['dat', 'truckstop', '123loadboard', 'loadsmart', 'uber_freight']

const BOARD_AUTH_TYPE: Record<LoadBoardId, 'api_key' | 'oauth2_password'> = {
  dat:            'oauth2_password',
  truckstop:      'oauth2_password',
  '123loadboard': 'api_key',
  loadsmart:      'api_key',
  uber_freight:   'oauth2_password',
  amazon_relay:   'oauth2_password',
  generic:        'api_key',
}

function BoardCard({
  boardId,
  connection,
  onSave,
}: {
  boardId:    LoadBoardId
  connection: BoardConnection | null
  onSave:     (boardId: LoadBoardId, creds: Record<string, string>) => Promise<void>
}) {
  const meta     = BOARD_META[boardId]
  const authType = BOARD_AUTH_TYPE[boardId]
  const [open,   setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [creds,  setCreds]  = useState({
    username: '', password: '', clientId: '', clientSecret: '',
    apiKey: '', displayName: meta.label,
  })

  const connected = connection?.connected && !connection?.lastError
  const hasError  = !!connection?.lastError

  async function handleSave() {
    setSaving(true)
    await onSave(boardId, creds)
    setSaving(false)
    setOpen(false)
  }

  return (
    <div style={{
      padding: '.65rem .8rem', borderRadius: 10,
      background: connected ? 'rgba(0,232,176,.04)' : hasError ? 'rgba(232,64,0,.04)' : 'var(--surface-2)',
      border: `1px solid ${connected ? 'rgba(0,232,176,.2)' : hasError ? 'rgba(232,64,0,.2)' : 'var(--border)'}`,
      display: 'grid', gap: '.45rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>{meta.logoEmoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--fg)' }}>{meta.label}</div>
          <div style={{ fontSize: '.57rem', color: 'var(--muted)' }}>
            {connected
              ? `✅ Connected${connection?.lastSyncedAt ? ` · last synced ${new Date(connection.lastSyncedAt).toLocaleDateString()}` : ''}`
              : hasError
              ? `❌ Error: ${connection?.lastError}`
              : '⚪ Not connected'}
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            fontSize: '.6rem', fontWeight: 800, padding: '.3rem .65rem', borderRadius: 7,
            border: `1px solid ${connected ? 'rgba(0,232,176,.3)' : 'var(--border)'}`,
            background: connected ? 'rgba(0,232,176,.08)' : 'var(--surface)',
            color: connected ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
          }}
        >
          {connected ? '⚙️ Update' : '+ Connect'}
        </button>
      </div>

      {/* Credentials form */}
      {open && (
        <div style={{ display: 'grid', gap: '.45rem', padding: '.55rem .65rem', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            {authType === 'api_key' ? '🔑 API Key' : '🔐 OAuth Credentials'}
          </div>

          <div>
            <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginBottom: 3 }}>Display Name</div>
            <input style={inp} value={creds.displayName} onChange={e => setCreds(p => ({ ...p, displayName: e.target.value }))} />
          </div>

          {authType === 'api_key' ? (
            <div>
              <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginBottom: 3 }}>API Key</div>
              <input style={inp} type="password" value={creds.apiKey} onChange={e => setCreds(p => ({ ...p, apiKey: e.target.value }))} placeholder="Your API key" autoComplete="off" />
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginBottom: 3 }}>Client ID</div>
                  <input style={inp} value={creds.clientId} onChange={e => setCreds(p => ({ ...p, clientId: e.target.value }))} placeholder="Client ID" autoComplete="off" />
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginBottom: 3 }}>Client Secret</div>
                  <input style={inp} type="password" value={creds.clientSecret} onChange={e => setCreds(p => ({ ...p, clientSecret: e.target.value }))} placeholder="Client Secret" autoComplete="off" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginBottom: 3 }}>Username</div>
                  <input style={inp} value={creds.username} onChange={e => setCreds(p => ({ ...p, username: e.target.value }))} placeholder="Username" autoComplete="off" />
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginBottom: 3 }}>Password</div>
                  <input style={inp} type="password" value={creds.password} onChange={e => setCreds(p => ({ ...p, password: e.target.value }))} placeholder="Password" autoComplete="off" />
                </div>
              </div>
            </>
          )}

          <div style={{ fontSize: '.55rem', color: 'var(--muted)', padding: '.3rem .5rem', borderRadius: 6, background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)' }}>
            🔒 Credentials are stored encrypted and only used server-side. They are never sent to your browser after saving.
          </div>

          <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
            <button style={cancelBtn} onClick={() => setOpen(false)}>Cancel</button>
            <button style={saveBtn} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Connection'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Notification settings ─────────────────────────────────────────────────────

function NotificationSettings() {
  const [teams, setTeams]   = useState('')
  const [sms,   setSms]     = useState('')
  const [email, setEmail]   = useState('')
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    const cfg = localStorage.getItem('3b-notification-config')
    if (cfg) {
      try {
        const parsed = JSON.parse(cfg)
        setTeams(parsed.teams?.endpoint ?? '')
        setSms(parsed.sms?.endpoint ?? '')
        setEmail(parsed.email?.endpoint ?? '')
      } catch { /* ignore */ }
    }
  }, [])

  function handleSave() {
    const existing = (() => { try { return JSON.parse(localStorage.getItem('3b-notification-config') ?? '{}') } catch { return {} } })()
    localStorage.setItem('3b-notification-config', JSON.stringify({
      ...existing,
      teams:  { enabled: !!teams,  endpoint: teams  || undefined },
      sms:    { enabled: !!sms,    endpoint: sms    || undefined },
      email:  { enabled: !!email,  endpoint: email  || undefined },
      in_app: { enabled: true },
    }))
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      {[
        { label: 'Microsoft Teams Webhook', value: teams, set: setTeams, ph: 'https://outlook.office.com/webhook/…', env: 'NEXT_PUBLIC_TEAMS_WEBHOOK' },
        { label: 'SMS Endpoint (Twilio or custom)', value: sms, set: setSms, ph: 'https://your-sms-endpoint.com/send', env: 'NEXT_PUBLIC_SMS_ENDPOINT' },
        { label: 'Email Endpoint', value: email, set: setEmail, ph: 'https://your-email-endpoint.com/send', env: 'NEXT_PUBLIC_EMAIL_ENDPOINT' },
      ].map(({ label, value, set, ph, env }) => (
        <div key={env}>
          <div style={{ fontSize: '.57rem', color: 'var(--muted)', marginBottom: 3 }}>
            {label} <span style={{ opacity: .5 }}>({env})</span>
          </div>
          <input style={inp} value={value} onChange={e => set(e.target.value)} placeholder={ph} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
        {saved && <span style={{ fontSize: '.6rem', color: 'var(--primary)' }}>✅ Saved</span>}
        <button style={saveBtn} onClick={handleSave}>Save Notification Settings</button>
      </div>
    </div>
  )
}

// ── Team tab ──────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = ['driver', 'dispatcher', 'admin', 'broker', 'fleet_manager'] as const
type InviteRole    = typeof ROLE_OPTIONS[number]

const ROLE_LABEL: Record<InviteRole, string> = {
  driver:        '🚛 Driver',
  dispatcher:    '📡 Dispatcher',
  admin:         '⚙️ Admin',
  broker:        '📦 Broker',
  fleet_manager: '🗂 Fleet Manager',
}

interface TeamMember {
  id:      string
  user_id: string
  email:   string | null
  role:    string
  isSelf:  boolean
}

interface PendingInvite {
  id:         string
  email:      string
  role:       string
  expires_at: string
}

function TeamTab({ businessId }: { businessId: string | null }) {
  const [members,    setMembers]    = useState<TeamMember[]>([])
  const [invites,    setInvites]    = useState<PendingInvite[]>([])
  const [callerRole, setCallerRole] = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<InviteRole>('driver')
  const [inviting,    setInviting]    = useState(false)
  const [inviteResult, setInviteResult] = useState<{ url?: string; error?: string } | null>(null)
  const [msg,         setMsg]          = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/team/members?businessId=${businessId}`)
      const data = await res.json()
      if (res.ok) {
        setMembers(data.members ?? [])
        setInvites(data.invites  ?? [])
        setCallerRole(data.callerRole ?? null)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function handleInvite() {
    if (!businessId || !inviteEmail) return
    setInviting(true); setInviteResult(null)
    try {
      const res  = await fetch('/api/team/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (res.ok) {
        setInviteResult({ url: data.inviteUrl })
        setInviteEmail('')
        load()
      } else {
        setInviteResult({ error: data.error ?? 'Failed to send invite' })
      }
    } catch {
      setInviteResult({ error: 'Network error' })
    } finally { setInviting(false) }
  }

  async function handleRoleChange(memberId: string, role: string) {
    if (!businessId) return
    await fetch('/api/team/members', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, memberId, role }),
    })
    setMsg('Role updated'); setTimeout(() => setMsg(null), 3000)
    load()
  }

  async function handleRemove(memberId: string) {
    if (!businessId || !confirm('Remove this member?')) return
    await fetch('/api/team/members', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, memberId }),
    })
    load()
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!businessId) return
    await fetch('/api/team/members', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, inviteId }),
    })
    load()
  }

  const isAdmin = callerRole === 'owner' || callerRole === 'admin'
  const inp: React.CSSProperties = { fontSize: '.67rem', padding: '.37rem .5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }

  if (!businessId) {
    return (
      <div style={{ padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center' }}>
        No business account found. Set up your business profile to manage team members.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '.65rem' }}>
      <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>👥 Team Members</div>

      {msg && <div style={{ fontSize: '.63rem', color: 'var(--primary)', fontWeight: 700 }}>{msg}</div>}

      {/* Member list */}
      {loading ? (
        <div style={{ fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center', padding: '.75rem' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: '.35rem' }}>
          {members.map(m => (
            <div key={m.id} style={{ padding: '.5rem .7rem', borderRadius: 9, background: m.isSelf ? 'rgba(0,232,176,.04)' : 'var(--surface-2)', border: `1px solid ${m.isSelf ? 'rgba(0,232,176,.2)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--fg)' }}>
                  {m.email ?? m.user_id.slice(0, 12) + '…'}
                  {m.isSelf && <span style={{ marginLeft: 6, fontSize: '.55rem', color: 'var(--primary)' }}>you</span>}
                </div>
              </div>
              {isAdmin && !m.isSelf ? (
                <select
                  value={m.role}
                  onChange={e => handleRoleChange(m.id, e.target.value)}
                  style={{ ...inp, fontSize: '.62rem', padding: '.25rem .4rem' }}
                >
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)', padding: '.2rem .45rem', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {ROLE_LABEL[m.role as InviteRole] ?? m.role}
                </span>
              )}
              {isAdmin && !m.isSelf && (
                <button onClick={() => handleRemove(m.id)} style={{ fontSize: '.6rem', color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: '.2rem .35rem', borderRadius: 5 }}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && <div style={{ fontSize: '.63rem', color: 'var(--muted)', textAlign: 'center', padding: '.5rem' }}>No members yet.</div>}
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div style={{ display: 'grid', gap: '.3rem' }}>
          <div style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Pending Invites</div>
          {invites.map(inv => (
            <div key={inv.id} style={{ padding: '.45rem .7rem', borderRadius: 8, background: 'rgba(245,194,0,.05)', border: '1px solid rgba(245,194,0,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '.63rem', color: 'var(--fg)' }}>{inv.email}</span>
                <span style={{ marginLeft: 8, fontSize: '.57rem', color: 'var(--muted)' }}>
                  {ROLE_LABEL[inv.role as InviteRole] ?? inv.role} · expires {new Date(inv.expires_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <button onClick={() => handleRevokeInvite(inv.id)} style={{ fontSize: '.58rem', color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      {isAdmin && (
        <div style={{ padding: '.75rem', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', gap: '.5rem' }}>
          <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Invite a team member</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '.4rem' }}>
            <input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
            />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as InviteRole)} style={{ ...inp }}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail}
            style={{ padding: '.4rem', borderRadius: 8, fontSize: '.66rem', fontWeight: 800, background: 'var(--primary)', color: 'var(--surface)', border: 'none', cursor: inviting ? 'wait' : 'pointer', opacity: !inviteEmail ? 0.5 : 1 }}
          >
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>

          {/* Invite result */}
          {inviteResult?.error && (
            <div style={{ fontSize: '.62rem', color: 'var(--error)' }}>{inviteResult.error}</div>
          )}
          {inviteResult?.url && (
            <div style={{ padding: '.5rem .65rem', borderRadius: 8, background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.2)', display: 'grid', gap: '.3rem' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)' }}>✅ Invite created</div>
              {process.env.NEXT_PUBLIC_EMAIL_ENDPOINT ? (
                <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Email sent to {inviteEmail}</div>
              ) : (
                <>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>No email endpoint configured — share this link manually:</div>
                  <div style={{ fontSize: '.6rem', fontFamily: 'monospace', padding: '.3rem .45rem', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', wordBreak: 'break-all', color: 'var(--fg)', userSelect: 'all' }}>
                    {inviteResult.url}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(inviteResult.url!); setMsg('Link copied!') }}
                    style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    📋 Copy link
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [connections, setConnections] = useState<Record<string, BoardConnection>>({})
  const [loading,     setLoading]     = useState(true)
  const [businessId,  setBusinessId]  = useState<string | null>(null)
  const [saveMsg,     setSaveMsg]     = useState<string | null>(null)
  const [activeTab,   setActiveTab]   = useState<'boards' | 'notifications' | 'billing' | 'team'>('boards')

  // Load business context + existing connections
  useEffect(() => {
    async function init() {
      try {
        const { getCurrentUser } = await import('@/lib/auth-adapter')
        const user = await getCurrentUser()
        if (user?.businessId) {
          setBusinessId(user.businessId)
          // Fetch connections via a lightweight API check
          const res = await fetch(`/api/load-boards/connections?businessId=${user.businessId}`)
          if (res.ok) {
            const data = await res.json()
            const map: Record<string, BoardConnection> = {}
            for (const c of data.connections ?? []) {
              map[c.board] = { ...c, connected: c.enabled && !c.last_error }
            }
            setConnections(map)
          }
        }
      } catch { /* standalone mode — no business yet */ }
      finally { setLoading(false) }
    }
    init()
  }, [])

  async function handleSaveBoard(boardId: LoadBoardId, creds: Record<string, string>) {
    if (!businessId) {
      setSaveMsg('⚠️ No business account connected. Complete your profile first.')
      return
    }
    try {
      const res = await fetch('/api/load-boards/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, board: boardId, ...creds, authType: BOARD_AUTH_TYPE[boardId] }),
      })
      const data = await res.json()
      if (res.ok) {
        setConnections(prev => ({ ...prev, [boardId]: { board: boardId, authType: BOARD_AUTH_TYPE[boardId], enabled: true, connected: true } }))
        setSaveMsg(`✅ ${BOARD_META[boardId].label} connected successfully`)
      } else {
        setSaveMsg(`❌ ${data.error ?? 'Save failed'}`)
      }
    } catch {
      setSaveMsg('❌ Network error — try again')
    }
    setTimeout(() => setSaveMsg(null), 5000)
  }

  const tabs: Array<{ id: typeof activeTab; label: string; emoji: string }> = [
    { id: 'boards',        label: 'Load Boards',   emoji: '📡' },
    { id: 'notifications', label: 'Notifications', emoji: '🔔' },
    { id: 'billing',       label: 'Billing',       emoji: '💰' },
    { id: 'team',          label: 'Team',          emoji: '👥' },
  ]

  return (
    <>
      <TopBar title="Account Settings" module="ops" subtitle="Load boards · notifications · billing · team" />

      <div style={{ padding: '1rem 1.2rem', display: 'grid', gap: '.75rem', maxWidth: 640 }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              fontSize: '.63rem', fontWeight: 800, padding: '.35rem .7rem', borderRadius: 8,
              cursor: 'pointer',
              border: `1px solid ${activeTab === t.id ? 'rgba(0,232,176,.35)' : 'var(--border)'}`,
              background: activeTab === t.id ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
              color: activeTab === t.id ? 'var(--primary)' : 'var(--muted)',
            }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Save message */}
        {saveMsg && (
          <div style={{
            fontSize: '.65rem', fontWeight: 800, padding: '.45rem .8rem', borderRadius: 8,
            background: saveMsg.startsWith('✅') ? 'rgba(0,232,176,.08)' : 'rgba(232,64,0,.08)',
            border: `1px solid ${saveMsg.startsWith('✅') ? 'rgba(0,232,176,.25)' : 'rgba(232,64,0,.25)'}`,
            color: saveMsg.startsWith('✅') ? 'var(--primary)' : 'var(--error)',
          }}>
            {saveMsg}
          </div>
        )}

        {/* ── Load Boards ──────────────────────────────────────────────────── */}
        {activeTab === 'boards' && (
          <div style={card}>
            <div style={sectionLabel}>📡 Load Board Connections</div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
              Connect your load board accounts to search and book loads from inside Fleet Commander.
              Credentials are stored encrypted and only used server-side.
            </div>

            {loading ? (
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center', padding: '.75rem' }}>Loading…</div>
            ) : (
              <div style={{ display: 'grid', gap: '.5rem' }}>
                {BOARD_ORDER.map(boardId => (
                  <BoardCard
                    key={boardId}
                    boardId={boardId}
                    connection={connections[boardId] ?? null}
                    onSave={handleSaveBoard}
                  />
                ))}
              </div>
            )}

            {!businessId && !loading && (
              <div style={{
                marginTop: '.75rem', fontSize: '.62rem', color: 'var(--warn)',
                padding: '.45rem .7rem', borderRadius: 8,
                background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.2)',
              }}>
                ⚠️ No business account found. Set up your business profile to connect load boards.
              </div>
            )}

            <div style={{ marginTop: '1rem', padding: '.55rem .7rem', borderRadius: 8, background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 3 }}>🔒 Security Note</div>
              <div style={{ fontSize: '.58rem', color: 'var(--muted)' }}>
                All load board API calls are made server-side. Your credentials are stored encrypted in the Fleet Commander database and are never transmitted to your browser after saving. Only business owners and admins can view or update connections.
              </div>
            </div>
          </div>
        )}

        {/* ── Notifications ─────────────────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div style={card}>
            <div style={sectionLabel}>🔔 Notification Delivery</div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
              Configure where escalation alerts and dispatch notifications are sent.
              Leave blank to use in-app notifications only.
            </div>
            <NotificationSettings />
          </div>
        )}

        {/* ── Billing ──────────────────────────────────────────────────────── */}
        {activeTab === 'billing' && (
          <div style={card}>
            <div style={sectionLabel}>💰 Billing & Subscriptions</div>
            <div style={{
              padding: '.75rem', borderRadius: 10, textAlign: 'center',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              fontSize: '.65rem', color: 'var(--muted)',
            }}>
              Billing management coming soon. Module subscriptions and transaction fee history will appear here.
            </div>
          </div>
        )}

        {/* ── Team ─────────────────────────────────────────────────────────── */}
        {activeTab === 'team' && (
          <TeamTab businessId={businessId} />
        )}
      </div>
    </>
  )
}
