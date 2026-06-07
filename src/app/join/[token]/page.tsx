'use client'
/**
 * /join/[token] — Team invite acceptance page
 *
 * Flow:
 *   1. Load invite details from token (public read)
 *   2. If user is not logged in → show login/signup prompt
 *   3. If user is logged in → show "Accept invite" button
 *   4. On accept → add to fleet_business_members, mark invite accepted
 *   5. Redirect to /dashboard
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

const ROLE_LABELS: Record<string, string> = {
  owner:         'Owner',
  driver:        'Driver',
  dispatcher:    'Dispatcher',
  admin:         'Admin',
  broker:        'Broker',
  fleet_manager: 'Fleet Manager',
}

const ROLE_DESC: Record<string, string> = {
  driver:        'View your loads, HOS clock, and driver ops cockpit',
  dispatcher:    'Manage loads, escalations, and dispatch feed',
  admin:         'Manage team members and account settings',
  broker:        'Access load board, rate confirmation, and assignments',
  fleet_manager: 'Manage multiple carrier accounts',
}

type InviteState = 'loading' | 'valid' | 'accepted' | 'expired' | 'invalid' | 'error'

interface InviteDetails {
  id:          string
  email:       string
  role:        string
  status:      string
  businessName?: string
  expiresAt:   string
}

export default function JoinPage() {
  const { token }  = useParams<{ token: string }>()
  const router     = useRouter()
  const [state,    setState]    = useState<InviteState>('loading')
  const [invite,   setInvite]   = useState<InviteDetails | null>(null)
  const [user,     setUser]     = useState<{ id: string; email: string | null } | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [err,       setErr]       = useState<string | null>(null)

  // ── Load invite + current user ──────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Get current user (may be null) — auth check uses Core_Eco
      const { data: { user: u } } = await createAuthClient().auth.getUser()
      if (u) setUser({ id: u.id, email: u.email ?? null })

      // Load invite by token (public read policy)
      const { data, error } = await supabase
        .from('fleet_team_invites')
        .select('id, email, role, status, expires_at, business_id')
        .eq('token', token)
        .maybeSingle()

      if (error || !data) { setState('invalid'); return }

      if (data.status === 'accepted') { setState('accepted'); return }
      if (data.status === 'revoked')  { setState('invalid');  return }
      if (new Date(data.expires_at) < new Date()) { setState('expired'); return }

      // Get business name
      const { data: biz } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', data.business_id)
        .maybeSingle()

      setInvite({
        id:           data.id,
        email:        data.email,
        role:         data.role,
        status:       data.status,
        businessName: biz?.name ?? 'your fleet',
        expiresAt:    data.expires_at,
      })
      setState('valid')
    }
    load()
  }, [token])

  // ── Accept invite ───────────────────────────────────────────────────────────

  async function handleAccept() {
    if (!user || !invite) return
    setAccepting(true); setErr(null)

    try {
      const res  = await fetch('/api/team/accept', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Failed to accept invite'); return }
      router.push('/dashboard?joined=true')
    } catch {
      setErr('Network error — try again')
    } finally {
      setAccepting(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    maxWidth: 420, margin: '0 auto', marginTop: '15vh',
    padding: '2rem', borderRadius: 18,
    background: 'var(--surface)', border: '1px solid var(--border)',
    display: 'grid', gap: '1rem', textAlign: 'center',
  }

  // ── States ──────────────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--muted)', fontSize: '.75rem' }}>
        Loading invite…
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div style={card}>
        <div style={{ fontSize: '2rem' }}>❌</div>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--fg)' }}>Invite not found</div>
        <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>This invite link is invalid or has been revoked. Ask your team admin to send a new one.</div>
        <a href="/dashboard" style={{ fontSize: '.68rem', fontWeight: 800, padding: '.5rem', borderRadius: 9, background: 'var(--surface-2)', color: 'var(--muted)', textDecoration: 'none' }}>Go to Dashboard</a>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div style={card}>
        <div style={{ fontSize: '2rem' }}>⏰</div>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--fg)' }}>Invite expired</div>
        <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>This invite link expired. Ask your team admin to send a fresh invite.</div>
        <a href="/dashboard" style={{ fontSize: '.68rem', fontWeight: 800, padding: '.5rem', borderRadius: 9, background: 'var(--surface-2)', color: 'var(--muted)', textDecoration: 'none' }}>Go to Dashboard</a>
      </div>
    )
  }

  if (state === 'accepted') {
    return (
      <div style={card}>
        <div style={{ fontSize: '2rem' }}>✅</div>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--primary)' }}>Already accepted</div>
        <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>This invite has already been accepted.</div>
        <a href="/dashboard" style={{ fontSize: '.68rem', fontWeight: 800, padding: '.5rem', borderRadius: 9, background: 'var(--primary)', color: 'var(--surface)', textDecoration: 'none' }}>Go to Dashboard</a>
      </div>
    )
  }

  // ── Valid invite ─────────────────────────────────────────────────────────────

  return (
    <div style={{ ...card, gap: '.85rem' }}>
      <div style={{ fontSize: '2.5rem' }}>🚛</div>

      <div>
        <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: 4 }}>You&apos;ve been invited to join</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--fg)' }}>{invite?.businessName}</div>
      </div>

      {/* Role badge */}
      <div style={{
        padding: '.6rem .9rem', borderRadius: 12,
        background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.2)',
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        margin: '0 auto',
      }}>
        <div style={{ fontSize: '.82rem', fontWeight: 900, color: 'var(--primary)' }}>
          {ROLE_LABELS[invite?.role ?? ''] ?? invite?.role}
        </div>
        <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>
          {ROLE_DESC[invite?.role ?? ''] ?? 'Team member access'}
        </div>
      </div>

      {/* Email match notice */}
      {invite?.email && (
        <div style={{ fontSize: '.6rem', color: 'var(--muted)', padding: '.4rem .65rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          Invite sent to <strong>{invite.email}</strong>
        </div>
      )}

      {err && (
        <div style={{ fontSize: '.63rem', color: 'var(--error)', padding: '.4rem .65rem', borderRadius: 8, background: 'rgba(232,64,0,.07)', border: '1px solid rgba(232,64,0,.2)' }}>
          {err}
        </div>
      )}

      {/* Not logged in */}
      {!user && (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
            Sign in or create an account to accept this invite.
          </div>
          <a
            href={`/login?redirect=/join/${token}`}
            style={{ padding: '.55rem', borderRadius: 10, fontSize: '.72rem', fontWeight: 800, background: 'var(--primary)', color: 'var(--surface)', textDecoration: 'none', display: 'block' }}
          >
            Sign in to accept →
          </a>
        </div>
      )}

      {/* Logged in — wrong email warning */}
      {user && invite?.email && user.email && user.email.toLowerCase() !== invite.email.toLowerCase() && (
        <div style={{ fontSize: '.62rem', color: 'var(--warn)', padding: '.4rem .65rem', borderRadius: 8, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.2)' }}>
          ⚠️ You&apos;re signed in as <strong>{user.email}</strong> but this invite was sent to <strong>{invite.email}</strong>. You can still accept, but check with your admin if this seems wrong.
        </div>
      )}

      {/* Accept button */}
      {user && (
        <button
          onClick={handleAccept}
          disabled={accepting}
          style={{ padding: '.6rem', borderRadius: 10, fontSize: '.75rem', fontWeight: 900, background: 'var(--primary)', color: 'var(--surface)', border: 'none', cursor: accepting ? 'wait' : 'pointer' }}
        >
          {accepting ? 'Joining…' : `Accept & Join ${invite?.businessName ?? 'Fleet'}`}
        </button>
      )}

      <div style={{ fontSize: '.55rem', color: 'var(--muted)' }}>
        Expires {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
      </div>
    </div>
  )
}
