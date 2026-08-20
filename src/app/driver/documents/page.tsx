'use client'
/**
 * /driver/documents — multi-credential driver identity (spec).
 *
 * One 3B ID, many credentials — a driver can carry a Class A CDL AND a
 * Class B permit AND separate endorsements AND a medical card
 * simultaneously, each with its own number/state/dates/photos/
 * verification status, tracked independently (never one field forced to
 * hold "the" license). Scans go through the existing /api/scan-license
 * (CDL/permit) and /api/scan-medical (medical card) OCR endpoints to
 * auto-fill fields — best effort, a failed/unclear scan still lets the
 * photo upload proceed.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.55rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', fontSize: '.85rem' }
const btnStyle: React.CSSProperties = { padding: '.55rem .9rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.82rem' }
const labelStyle: React.CSSProperties = { fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, marginBottom: 3 }

type CredentialType =
  | 'cdl_class_a' | 'cdl_class_b' | 'cdl_class_c'
  | 'permit_class_a' | 'permit_class_b' | 'permit_class_c'
  | 'endorsement_passenger' | 'endorsement_tanker' | 'endorsement_hazmat'
  | 'endorsement_doubles_triples' | 'endorsement_school_bus'
  | 'medical_card' | 'twic' | 'other'

const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  cdl_class_a: 'CDL Class A', cdl_class_b: 'CDL Class B', cdl_class_c: 'CDL Class C',
  permit_class_a: 'Permit Class A', permit_class_b: 'Permit Class B', permit_class_c: 'Permit Class C',
  endorsement_passenger: 'Passenger Endorsement', endorsement_tanker: 'Tanker Endorsement',
  endorsement_hazmat: 'Hazmat Endorsement', endorsement_doubles_triples: 'Doubles/Triples Endorsement',
  endorsement_school_bus: 'School Bus Endorsement',
  medical_card: 'Medical Card', twic: 'TWIC', other: 'Other',
}
const CREDENTIAL_TYPE_OPTIONS = Object.keys(CREDENTIAL_TYPE_LABELS) as CredentialType[]

interface Credential {
  id: string
  credentialType: CredentialType
  label: string | null
  number: string | null
  issuingState: string | null
  class: string | null
  expiryDate: string | null
  frontDocId: string | null
  backDocId: string | null
  frontSignedUrl: string | null
  backSignedUrl: string | null
  verificationStatus: 'unverified' | 'pending' | 'verified'
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
}
function expiryColor(days: number | null): string {
  if (days === null) return 'var(--muted)'
  if (days < 30) return 'var(--error)'
  if (days < 90) return 'var(--warn)'
  return 'var(--success)'
}
function expiryLabel(days: number | null, iso: string | null): string {
  if (!iso) return 'No expiry on file'
  if (days === null) return iso
  if (days < 0) return `Expired ${Math.abs(days)}d ago (${iso})`
  return `Expires in ${days}d (${iso})`
}

export default function DriverDocumentsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [addingType, setAddingType] = useState<CredentialType>('cdl_class_a')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/fleet/dump-truck/driver/credentials').then(r => r.json()).then(b => setCredentials(b.credentials ?? [])).finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const addCredential = async () => {
    setBusy('add')
    try {
      const res = await fetch('/api/fleet/dump-truck/driver/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentialType: addingType }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not add credential')
      toast.success(`${CREDENTIAL_TYPE_LABELS[addingType]} added — fill in the details below`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add credential')
    } finally {
      setBusy(null)
    }
  }

  const saveField = async (id: string, field: string, value: string) => {
    await fetch(`/api/fleet/dump-truck/driver/credentials/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value || null }),
    })
    load()
  }

  const removeCredential = async (id: string) => {
    if (!confirm('Remove this credential? It will no longer show as active — history is preserved.')) return
    await fetch(`/api/fleet/dump-truck/driver/credentials/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
    })
    toast.success('Removed')
    load()
  }

  const scanAndUploadPhoto = async (credential: Credential, side: 'front' | 'back', file: File) => {
    setBusy(`${credential.id}-${side}`)
    try {
      // OCR is best-effort auto-fill only — a failed/unclear scan still lets the photo upload proceed.
      if (side === 'front') {
        const scanForm = new FormData()
        scanForm.append('file', file)
        const isMedical = credential.credentialType === 'medical_card'
        const scanRes = await fetch(isMedical ? '/api/scan-medical' : '/api/scan-license', { method: 'POST', body: scanForm })
        if (scanRes.ok) {
          const scanned = await scanRes.json()
          if (isMedical && scanned.expiry) {
            await fetch(`/api/fleet/dump-truck/driver/credentials/${credential.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiryDate: scanned.expiry }),
            })
          } else if (!isMedical && (scanned.cdl_number || scanned.expiry)) {
            await fetch(`/api/fleet/dump-truck/driver/credentials/${credential.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                number: scanned.cdl_number ?? undefined, issuingState: scanned.issued_state ?? undefined,
                class: scanned.cdl_class ?? undefined, expiryDate: scanned.expiry ?? undefined,
              }),
            })
          }
        }
      }

      const uploadForm = new FormData()
      uploadForm.append('file', file)
      uploadForm.append('side', side)
      const uploadRes = await fetch(`/api/fleet/dump-truck/driver/credentials/${credential.id}/photo`, { method: 'POST', body: uploadForm })
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? 'Upload failed')

      toast.success('Saved')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save — try again when you have signal')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 720, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>My Documents</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          One 3B ID, many credentials — your Class A CDL, a Class B permit, endorsements, and medical card are all
          tracked independently here, each with its own number, dates, and photo. Private to you and your
          dispatch/admin team.
        </p>
      </div>

      <div style={{ ...cardStyle, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={labelStyle}>Add a Credential</div>
          <select style={inputStyle} value={addingType} onChange={e => setAddingType(e.target.value as CredentialType)}>
            {CREDENTIAL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{CREDENTIAL_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <button style={{ ...btnStyle, opacity: busy === 'add' ? .5 : 1 }} disabled={busy === 'add'} onClick={addCredential}>
          {busy === 'add' ? 'Adding…' : '+ Add'}
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}

      {!loading && credentials.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No credentials on file yet — add your CDL above to get started.</div>
      )}

      {!loading && credentials.map(c => {
        const days = daysUntil(c.expiryDate)
        return (
          <div key={c.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>{c.label || CREDENTIAL_TYPE_LABELS[c.credentialType]}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <VerificationBadge status={c.verificationStatus} />
                <button onClick={() => removeCredential(c.id)} style={{ fontSize: '.7rem', color: 'var(--error)', fontWeight: 700 }}>Remove</button>
              </div>
            </div>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: expiryColor(days), marginBottom: '.75rem' }}>
              {expiryLabel(days, c.expiryDate)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
              <PhotoSlot label="Front" doc={c.frontSignedUrl} busy={busy === `${c.id}-front`} onFile={f => scanAndUploadPhoto(c, 'front', f)} />
              {c.credentialType !== 'medical_card' && (
                <PhotoSlot label="Back" doc={c.backSignedUrl} busy={busy === `${c.id}-back`} onFile={f => scanAndUploadPhoto(c, 'back', f)} />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '.6rem' }}>
              {c.credentialType !== 'medical_card' && (
                <>
                  <div><div style={labelStyle}>Number</div><input style={inputStyle} defaultValue={c.number ?? ''} onBlur={e => saveField(c.id, 'number', e.target.value)} /></div>
                  <div><div style={labelStyle}>State</div><input style={inputStyle} defaultValue={c.issuingState ?? ''} onBlur={e => saveField(c.id, 'issuingState', e.target.value)} /></div>
                  <div><div style={labelStyle}>Class</div><input style={inputStyle} defaultValue={c.class ?? ''} onBlur={e => saveField(c.id, 'class', e.target.value)} /></div>
                </>
              )}
              <div><div style={labelStyle}>Expiry</div><input style={inputStyle} type="date" defaultValue={c.expiryDate ?? ''} onBlur={e => saveField(c.id, 'expiryDate', e.target.value)} /></div>
            </div>
          </div>
        )
      })}

      <ToastContainer />
    </div>
  )
}

function VerificationBadge({ status }: { status: 'unverified' | 'pending' | 'verified' }) {
  const color = status === 'verified' ? 'var(--success)' : status === 'pending' ? 'var(--warn, #d99a2b)' : 'var(--muted)'
  const label = status === 'verified' ? '✓ Verified' : status === 'pending' ? 'Pending Review' : 'Unverified'
  return <span style={{ fontSize: '.68rem', fontWeight: 800, color, border: `1px solid ${color}`, borderRadius: 999, padding: '.1rem .5rem' }}>{label}</span>
}

function PhotoSlot({ label, doc, busy, onFile }: { label: string; doc: string | null; busy: boolean; onFile: (f: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input
        ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
      <button
        style={{ ...btnStyle, width: '100%', background: doc ? 'var(--surface-2)' : 'var(--primary)', color: doc ? 'var(--text)' : '#04140f', border: doc ? '1px solid var(--border)' : 'none', opacity: busy ? .5 : 1 }}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? 'Scanning…' : doc ? `✅ ${label} — Retake` : `📷 Scan ${label}`}
      </button>
      {doc && (
        <a href={doc} target="_blank" rel="noreferrer" style={{ fontSize: '.72rem', color: 'var(--primary)', display: 'block', marginTop: 4, textAlign: 'center' }}>
          View current photo
        </a>
      )}
    </div>
  )
}
