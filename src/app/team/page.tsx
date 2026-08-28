'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCurrentUser, type PortalGrants } from '@/lib/auth-adapter'

type Member = {
  id: string
  user_id: string
  role: string
  email: string | null
  isSelf: boolean
  portalGrants: { portal: string; permissionLevel: string }[]
}

type Invite = { id: string; email: string; role: string; status: string; expires_at: string }

type Identity = { businessId?: string | null; portals: PortalGrants }

const card: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '1rem' }

export default function TeamPage() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canView = !!identity?.portals.dispatch || !!identity?.portals.admin
  const canManage = identity?.portals.admin === 'manage'
  const title = canManage ? 'Team Management' : 'Operations Team'

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const user = await getCurrentUser()
        if (!user?.businessId) throw new Error('No active Fleet business')
        if (!user.portals.dispatch && !user.portals.admin) throw new Error('Team access is not granted')
        if (!active) return
        setIdentity({ businessId: user.businessId, portals: user.portals })

        const response = await fetch(`/api/team/members?businessId=${encodeURIComponent(user.businessId)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Could not load team')
        if (!active) return
        setMembers(payload.members ?? [])
        setInvites(payload.invites ?? [])
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load team')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const operationalMembers = useMemo(() => members.filter(member => member.portalGrants.some(g => g.portal === 'driver' || g.portal === 'dispatch' || g.portal === 'admin')), [members])

  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: '1.4rem', display: 'grid', gap: 16 }}>
    <header>
      <div style={{ color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Company Team</div>
      <h1 style={{ margin: '.35rem 0 .4rem' }}>{title}</h1>
      <p style={{ color: 'var(--muted)', margin: 0, maxWidth: 760, lineHeight: 1.55 }}>
        {canManage
          ? 'Admin can manage Fleet access and permissions for this business. Operational assignments remain separate from legal ownership.'
          : 'Dispatch sees the operational roster needed to run today’s work. Permission changes stay with Admin.'}
      </p>
    </header>

    {loading && <div style={{ color: 'var(--muted)' }}>Loading team…</div>}
    {error && <div style={{ color: 'var(--error)' }}>{error}</div>}

    {!loading && !error && canView && <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
        {operationalMembers.map(member => <div key={member.id} style={card}>
          <div style={{ fontWeight: 900 }}>{member.email || 'Fleet member'}{member.isSelf ? ' · You' : ''}</div>
          <div style={{ color: 'var(--muted)', fontSize: '.68rem', marginTop: 4, textTransform: 'capitalize' }}>{member.role.replaceAll('_', ' ')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
            {member.portalGrants.map(grant => <span key={`${grant.portal}-${grant.permissionLevel}`} style={{ border: '1px solid rgba(0,232,176,.18)', background: 'rgba(0,232,176,.05)', color: 'var(--primary)', borderRadius: 999, padding: '.25rem .45rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'capitalize' }}>
              {grant.portal} · {grant.permissionLevel}
            </span>)}
          </div>
          {canManage && <div style={{ color: 'var(--faint)', fontSize: '.62rem', marginTop: 10 }}>Permission editing uses the existing Fleet team grant system.</div>}
        </div>)}
      </section>

      {canManage && invites.length > 0 && <section style={card}>
        <div style={{ fontWeight: 900 }}>Pending Invites</div>
        <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
          {invites.map(invite => <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--muted)', fontSize: '.7rem' }}><span>{invite.email}</span><span>Expires {new Date(invite.expires_at).toLocaleDateString()}</span></div>)}
        </div>
      </section>}
    </>}
  </main>
}
