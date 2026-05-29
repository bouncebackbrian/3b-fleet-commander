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

import { useState, useEffect } from 'react'
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
          <div style={card}>
            <div style={sectionLabel}>👥 Team Members</div>
            <div style={{
              padding: '.75rem', borderRadius: 10, textAlign: 'center',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              fontSize: '.65rem', color: 'var(--muted)',
            }}>
              Team management coming soon. Invite drivers, dispatchers, and admins to your business account here.
            </div>
          </div>
        )}
      </div>
    </>
  )
}
