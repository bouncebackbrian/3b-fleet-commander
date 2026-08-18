'use client'
/**
 * /driver/documents — CDL front/back + medical card, tied to the driver's own profile.
 *
 * Scans with Claude via the existing /api/scan-license and /api/scan-medical OCR
 * endpoints (auto-fills CDL number/state/class/expiry and medical card expiry),
 * then uploads the photo itself through /api/fleet/dump-truck/driver/documents
 * (the same private fleet_dt_documents pipeline used for load tickets/fuel
 * receipts elsewhere in the app). Expiry status uses the same color convention
 * as the truck compliance dates on /admin/equipment.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.55rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', fontSize: '.85rem' }
const btnStyle: React.CSSProperties = { padding: '.55rem .9rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.82rem' }
const labelStyle: React.CSSProperties = { fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, marginBottom: 3 }

interface Compliance {
  cdlNumber: string | null; cdlState: string | null; cdlClass: string | null
  cdlExpiry: string | null; medicalExpiry: string | null
}
interface DriverDocument { id: string; docType: string; fileName: string; createdAt: string; signedUrl: string | null }

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
  if (!iso) return 'Not on file'
  if (days === null) return iso
  if (days < 0) return `Expired ${Math.abs(days)}d ago (${iso})`
  return `Expires in ${days}d (${iso})`
}

export default function DriverDocumentsPage() {
  const [compliance, setCompliance] = useState<Compliance | null>(null)
  const [documents, setDocuments] = useState<DriverDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/fleet/dump-truck/driver/compliance').then(r => r.json()),
      fetch('/api/fleet/dump-truck/driver/documents').then(r => r.json()),
    ]).then(([c, d]) => {
      setCompliance(c.compliance ?? null)
      setDocuments(d.documents ?? [])
    }).finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const docFor = (docType: string) => documents.find(d => d.docType === docType) ?? null

  const scanAndUpload = async (docType: 'cdl_front' | 'cdl_back' | 'medical_card', file: File) => {
    setScanning(docType)
    try {
      // 1. OCR extraction (CDL front/back both use the license scanner; medical
      // card uses its own) -- purely for auto-filling structured fields, best
      // effort. A failed/unclear scan still lets the photo upload proceed.
      if (docType !== 'cdl_back') {
        const scanForm = new FormData()
        scanForm.append('file', file)
        const scanRes = await fetch(docType === 'medical_card' ? '/api/scan-medical' : '/api/scan-license', { method: 'POST', body: scanForm })
        if (scanRes.ok) {
          const scanned = await scanRes.json()
          if (docType === 'medical_card') {
            if (scanned.expiry) {
              await fetch('/api/fleet/dump-truck/driver/compliance', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ medicalExpiry: scanned.expiry }),
              })
            }
          } else if (scanned.cdl_number || scanned.expiry) {
            await fetch('/api/fleet/dump-truck/driver/compliance', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cdlNumber: scanned.cdl_number ?? undefined, cdlState: scanned.issued_state ?? undefined,
                cdlClass: scanned.cdl_class ?? undefined, cdlExpiry: scanned.expiry ?? undefined,
              }),
            })
          }
        }
      }

      // 2. Upload the actual photo, regardless of whether OCR succeeded.
      const uploadForm = new FormData()
      uploadForm.append('file', file)
      uploadForm.append('docType', docType)
      const uploadRes = await fetch('/api/fleet/dump-truck/driver/documents', { method: 'POST', body: uploadForm })
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? 'Upload failed')

      toast.success('Saved')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save — try again when you have signal')
    } finally {
      setScanning(null)
    }
  }

  const saveManualField = async (field: keyof Compliance, value: string) => {
    await fetch('/api/fleet/dump-truck/driver/compliance', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    })
    load()
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 720, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>My Documents</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          CDL and medical card — kept on your driver profile, private to you and your dispatch/admin team.
        </p>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}

      {!loading && compliance && (
        <>
          <div style={cardStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.25rem' }}>Medical Card</h2>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: expiryColor(daysUntil(compliance.medicalExpiry)), marginBottom: '.75rem' }}>
              {expiryLabel(daysUntil(compliance.medicalExpiry), compliance.medicalExpiry)}
            </div>
            <DocSlot label="Medical Card" docType="medical_card" doc={docFor('medical_card')} scanning={scanning === 'medical_card'} onFile={f => scanAndUpload('medical_card', f)} />
            <div style={{ marginTop: '.75rem' }}>
              <div style={labelStyle}>Expiry (manual override)</div>
              <input style={inputStyle} type="date" defaultValue={compliance.medicalExpiry ?? ''} onBlur={e => saveManualField('medicalExpiry', e.target.value)} />
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.25rem' }}>CDL</h2>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: expiryColor(daysUntil(compliance.cdlExpiry)), marginBottom: '.75rem' }}>
              {expiryLabel(daysUntil(compliance.cdlExpiry), compliance.cdlExpiry)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
              <DocSlot label="CDL Front" docType="cdl_front" doc={docFor('cdl_front')} scanning={scanning === 'cdl_front'} onFile={f => scanAndUpload('cdl_front', f)} />
              <DocSlot label="CDL Back" docType="cdl_back" doc={docFor('cdl_back')} scanning={scanning === 'cdl_back'} onFile={f => scanAndUpload('cdl_back', f)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '.6rem' }}>
              <div><div style={labelStyle}>CDL Number</div><input style={inputStyle} defaultValue={compliance.cdlNumber ?? ''} onBlur={e => saveManualField('cdlNumber', e.target.value)} /></div>
              <div><div style={labelStyle}>State</div><input style={inputStyle} defaultValue={compliance.cdlState ?? ''} onBlur={e => saveManualField('cdlState', e.target.value)} /></div>
              <div><div style={labelStyle}>Class</div><input style={inputStyle} defaultValue={compliance.cdlClass ?? ''} onBlur={e => saveManualField('cdlClass', e.target.value)} /></div>
              <div><div style={labelStyle}>Expiry</div><input style={inputStyle} type="date" defaultValue={compliance.cdlExpiry ?? ''} onBlur={e => saveManualField('cdlExpiry', e.target.value)} /></div>
            </div>
          </div>
        </>
      )}

      <ToastContainer />
    </div>
  )
}

function DocSlot({ label, doc, scanning, onFile }: {
  label: string; docType: string; doc: DriverDocument | null; scanning: boolean; onFile: (f: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input
        ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
      <button
        style={{ ...btnStyle, width: '100%', background: doc ? 'var(--surface-2)' : 'var(--primary)', color: doc ? 'var(--text)' : '#04140f', border: doc ? '1px solid var(--border)' : 'none', opacity: scanning ? .5 : 1 }}
        disabled={scanning}
        onClick={() => fileRef.current?.click()}
      >
        {scanning ? 'Scanning…' : doc ? `✅ ${label} — Retake` : `📷 Scan ${label}`}
      </button>
      {doc?.signedUrl && (
        <a href={doc.signedUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.72rem', color: 'var(--primary)', display: 'block', marginTop: 4, textAlign: 'center' }}>
          View current photo
        </a>
      )}
    </div>
  )
}
