'use client'

import { useState } from 'react'
import { addAuthorizedThreeBMember, previewThreeBMember, type FleetRole, type GovernanceRole, type ThreeBMemberPreview } from '@/lib/authorizedBusinessMembers'

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.7rem .75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#07120f', color: '#eefcf8' }

export default function AuthorizedBusinessMembersSetup({ businessId, canManage }: { businessId: string | null; canManage: boolean }) {
  const [threeBId, setThreeBId] = useState('')
  const [governanceRole, setGovernanceRole] = useState<GovernanceRole>('employee')
  const [fleetRole, setFleetRole] = useState<FleetRole | ''>('')
  const [preview, setPreview] = useState<ThreeBMemberPreview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function findPerson() {
    setMessage(''); setPreview(null)
    if (!threeBId.trim()) return
    setBusy(true)
    const person = await previewThreeBMember(threeBId)
    setBusy(false)
    if (!person) { setMessage('3B ID not found. Confirm the ID or have the person create their 3B ID first.'); return }
    setPreview(person)
  }

  async function addPerson() {
    if (!businessId || !preview) return
    setBusy(true); setMessage('')
    const ok = await addAuthorizedThreeBMember({ businessId, threeBId: preview.threeBId, governanceRole, fleetRole: fleetRole || null })
    setBusy(false)
    if (!ok) { setMessage('Could not authorize this 3B ID. Only the primary business owner can add members during setup.'); return }
    setMessage(`${preview.threeBId} authorized successfully.`)
    setThreeBId(''); setPreview(null); setGovernanceRole('employee'); setFleetRole('')
  }

  if (!businessId) return <div style={{ color: '#759f94', fontSize: '.76rem' }}>Choose or create a business first.</div>
  if (!canManage) return <div style={{ color: '#759f94', fontSize: '.76rem', lineHeight: 1.5 }}>You are attached to this business, but only its primary owner can authorize additional 3B IDs during setup.</div>

  return <div style={{ display: 'grid', gap: 9 }}>
    <div style={{ fontWeight: 950 }}>Authorized 3B IDs</div>
    <div style={{ color: '#759f94', fontSize: '.74rem', lineHeight: 1.5 }}>Attach people to the 3B Business ID, then separately decide whether they need Fleet Commander access. Authorization does not make someone an owner unless you explicitly assign a governance ownership role.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
      <input style={input} value={threeBId} onChange={e => { setThreeBId(e.target.value.toUpperCase()); setPreview(null) }} placeholder="3B-U-00000000" />
      <button onClick={findPerson} disabled={busy || !threeBId.trim()} style={{ border: 0, borderRadius: 10, padding: '0 .9rem', background: '#163b33', color: '#00e8b0', fontWeight: 900 }}>{busy ? 'Checking…' : 'Find'}</button>
    </div>

    {preview && <div style={{ border: '1px solid rgba(0,232,176,.22)', borderRadius: 12, padding: '.85rem', display: 'grid', gap: 9 }}>
      <div><strong>{preview.displayName || '3B User'}</strong><div style={{ color: '#00e8b0', fontSize: '.72rem', marginTop: 3 }}>{preview.threeBId}</div></div>
      <label style={{ display: 'grid', gap: 4, color: '#8fb0a7', fontSize: '.7rem' }}>Business relationship
        <select style={input} value={governanceRole} onChange={e => setGovernanceRole(e.target.value as GovernanceRole)}>
          <option value="partner">Partner</option><option value="manager">Manager</option><option value="employee">Employee</option><option value="advisor">Advisor</option>
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4, color: '#8fb0a7', fontSize: '.7rem' }}>Fleet Commander permission (optional)
        <select style={input} value={fleetRole} onChange={e => setFleetRole(e.target.value as FleetRole | '')}>
          <option value="">No Fleet Commander access</option><option value="driver">Driver</option><option value="dispatcher">Dispatcher</option><option value="admin">Admin</option><option value="broker">Broker</option><option value="fleet_manager">Fleet Manager</option>
        </select>
      </label>
      <button onClick={addPerson} disabled={busy} style={{ border: 0, borderRadius: 10, padding: '.72rem', background: '#00e8b0', color: '#04110d', fontWeight: 950 }}>{busy ? 'Adding…' : 'Authorize 3B ID'}</button>
    </div>}
    {message && <div style={{ color: message.includes('successfully') ? '#00e8b0' : '#f5c200', fontSize: '.72rem' }}>{message}</div>}
  </div>
}
