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

export default function TeamPage() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canView = !!identity?.portals.dispatch || !!identity?.portals.admin
  const canManage = identity?.portals.admin === 'manage'
  const title = canManage ? 'Team' : 'Operations Team'

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

  const operationalMembers = useMemo(
    () => members.filter(member => member.portalGrants.some(g => g.portal === 'driver' || g.portal === 'dispatch' || g.portal === 'admin')),
    [members],
  )

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '1.7rem clamp(1rem,3vw,2rem)', display: 'grid', gap: 24 }}>
      <header>
        <div style={eyebrow}>People</div>
        <h1 style={{ margin: '.25rem 0 .3rem', fontSize: 'clamp(1.9rem,4vw,2.7rem)', letterSpacing: '-.035em' }}>{title}</h1>
        <p style={subtitle}>{canManage ? 'Company access, roles and portal permissions.' : 'The people currently available to operate today’s work.'}</p>
      </header>

      {loading && <div style={muted}>Loading team…</div>}
      {error && <div style={{ color: 'var(--error)' }}>{error}</div>}

      {!loading && !error && canView && (
        <>
          <section style={{ borderTop: '1px solid var(--border)' }}>
            {operationalMembers.map(member => (
              <article key={member.id} style={row}>
                <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                  <div style={{ fontWeight: 900 }}>{member.email || 'Fleet member'}{member.isSelf ? ' · You' : ''}</div>
                  <div style={{ ...muted, marginTop: 4, textTransform: 'capitalize' }}>{member.role.replaceAll('_', ' ')}</div>
                </div>

                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {member.portalGrants.map(grant => (
                    <span key={`${grant.portal}-${grant.permissionLevel}`} style={grantPill}>
                      {grant.portal} · {grant.permissionLevel}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {operationalMembers.length === 0 && <div style={{ padding: '2.5rem 0', color: 'var(--muted)' }}>No operational team members found.</div>}
          </section>

          {canManage && invites.length > 0 && (
            <section>
              <div style={{ ...eyebrow, color: 'var(--muted)' }}>Pending invites</div>
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
                {invites.map(invite => (
                  <div key={invite.id} style={inviteRow}>
                    <span style={{ fontWeight: 800 }}>{invite.email}</span>
                    <span style={{ ...muted, textTransform: 'capitalize' }}>{invite.role.replaceAll('_', ' ')}</span>
                    <span style={muted}>Expires {new Date(invite.expires_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

const eyebrow: React.CSSProperties = { color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }
const subtitle: React.CSSProperties = { color: 'var(--muted)', margin: 0, fontSize: '.8rem' }
const muted: React.CSSProperties = { color: 'var(--muted)', fontSize: '.72rem' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '1rem 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }
const grantPill: React.CSSProperties = { color: 'var(--primary)', background: 'rgba(0,232,176,.07)', borderRadius: 999, padding: '.28rem .5rem', fontSize: '.58rem', fontWeight: 850, textTransform: 'capitalize' }
const inviteRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(110px,.5fr) auto', gap: 14, alignItems: 'center', padding: '.85rem 0', borderBottom: '1px solid var(--border)' }
