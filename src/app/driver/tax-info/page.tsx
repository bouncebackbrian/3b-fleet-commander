'use client'
/**
 * /driver/tax-info — driver self-service W-9 + their own generated 1099-NEC forms.
 *
 * Classification (W-2 vs 1099) and withholding % are admin-set (shown
 * read-only here) — a driver can't self-classify since that's a business
 * decision with real tax consequences. The W-9 itself (legal name,
 * address, TIN) is the driver's own info, submitted/updated here and
 * digitally signed via the same SignaturePad used for dispatch tickets.
 */
import { useEffect, useState } from 'react'
import SignaturePad from '@/components/dumpTruck/SignaturePad'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

interface TaxProfile {
  classification: 'w2' | '1099'
  withholdingPercent: number | null
  legalName: string | null
  businessName: string | null
  federalTaxClassification: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  tin: string | null
  tinType: 'ssn' | 'ein' | null
  w9SignedAt: string | null
}

interface Filing {
  id: string
  taxYear: number
  totalCompensation: number
  generatedAt: string
}

const FED_CLASSIFICATIONS = [
  { key: 'individual', label: 'Individual / Sole Proprietor' },
  { key: 'llc', label: 'LLC' },
  { key: 'c_corp', label: 'C Corporation' },
  { key: 's_corp', label: 'S Corporation' },
  { key: 'partnership', label: 'Partnership' },
  { key: 'trust_estate', label: 'Trust / Estate' },
  { key: 'other', label: 'Other' },
]

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', maxWidth: 560, margin: '0 auto 1.25rem' }
const lbl: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }
const inp: React.CSSProperties = { width: '100%', padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', boxSizing: 'border-box' }

function maskTin(tin: string | null): string {
  if (!tin) return '—'
  const digits = tin.replace(/\D/g, '')
  return digits.length >= 4 ? `•••-••-${digits.slice(-4)}` : '—'
}

export default function DriverTaxInfoPage() {
  const [profile, setProfile] = useState<TaxProfile | null>(null)
  const [filings, setFilings] = useState<Filing[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [signing, setSigning] = useState(false)
  const [busy, setBusy] = useState(false)

  const [legalName, setLegalName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [fedClass, setFedClass] = useState('individual')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [tin, setTin] = useState('')
  const [tinType, setTinType] = useState<'ssn' | 'ein'>('ssn')

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/fleet/dump-truck/driver-tax/me').then(r => r.json()),
      fetch('/api/fleet/dump-truck/driver-tax/me/1099').then(r => r.json()),
    ]).then(([p, f]) => {
      setProfile(p.profile ?? null)
      setFilings(f.filings ?? [])
      if (p.profile) {
        setLegalName(p.profile.legalName ?? '')
        setBusinessName(p.profile.businessName ?? '')
        setFedClass(p.profile.federalTaxClassification ?? 'individual')
        setAddressLine1(p.profile.addressLine1 ?? '')
        setCity(p.profile.city ?? '')
        setState(p.profile.state ?? '')
        setPostalCode(p.profile.postalCode ?? '')
        setTinType(p.profile.tinType ?? 'ssn')
      }
    }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const canSubmitForm = legalName.trim() && addressLine1.trim() && city.trim() && state.trim() && postalCode.trim() && tin.trim()

  const submit = async (signatureBlob: Blob) => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('signature', signatureBlob, 'signature.png')
      form.append('legalName', legalName.trim())
      if (businessName.trim()) form.append('businessName', businessName.trim())
      form.append('federalTaxClassification', fedClass)
      form.append('addressLine1', addressLine1)
      form.append('city', city)
      form.append('state', state)
      form.append('postalCode', postalCode)
      form.append('tin', tin.trim())
      form.append('tinType', tinType)

      const res = await fetch('/api/fleet/dump-truck/driver-tax/me/w9', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save W-9')
      toast.success('W-9 submitted')
      setEditing(false)
      setSigning(false)
      setTin('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save W-9')
    } finally {
      setBusy(false)
    }
  }

  const viewFiling = async (filingId: string) => {
    try {
      const res = await fetch(`/api/fleet/dump-truck/driver-tax/1099-filings/${filingId}/pdf`)
      if (!res.ok) throw new Error('Could not open 1099')
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open 1099')
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 900, textAlign: 'center', marginBottom: '1.25rem' }}>🧾 Tax Info (W-9)</h1>

      <div style={card}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Pay Classification</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 4 }}>
          {profile?.classification === '1099' ? '1099 Contractor' : 'W-2 Employee'}
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Set by your company — contact dispatch/admin if this looks wrong.</div>
        {profile?.classification === '1099' && profile.withholdingPercent != null && (
          <div style={{ fontSize: '.85rem', marginTop: 8 }}>
            Suggested savings on each paycheck: <strong>{profile.withholdingPercent}%</strong>
          </div>
        )}
      </div>

      {profile?.classification === '1099' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>W-9 On File</h2>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '.82rem' }}>
                {profile?.w9SignedAt ? 'Update' : 'Fill Out'}
              </button>
            )}
          </div>

          {!editing && profile?.w9SignedAt && (
            <div style={{ fontSize: '.85rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div><strong>{profile.legalName}</strong>{profile.businessName ? ` (${profile.businessName})` : ''}</div>
              <div style={{ color: 'var(--muted)' }}>{profile.addressLine1}, {profile.city}, {profile.state} {profile.postalCode}</div>
              <div style={{ color: 'var(--muted)' }}>TIN: {maskTin(profile.tin)} ({profile.tinType?.toUpperCase()})</div>
              <div style={{ color: 'var(--success)', fontWeight: 700, marginTop: 4 }}>✓ Signed {new Date(profile.w9SignedAt).toLocaleDateString()}</div>
            </div>
          )}
          {!editing && !profile?.w9SignedAt && (
            <div style={{ fontSize: '.85rem', color: 'var(--warn)', fontWeight: 700 }}>
              ⚠️ No W-9 on file yet — fill this out so your 1099-NEC can be generated at year end.
            </div>
          )}

          {editing && !signing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <div>
                <div style={lbl}>Legal Name</div>
                <input style={inp} value={legalName} onChange={e => setLegalName(e.target.value)} />
              </div>
              <div>
                <div style={lbl}>Business Name (if any)</div>
                <input style={inp} value={businessName} onChange={e => setBusinessName(e.target.value)} />
              </div>
              <div>
                <div style={lbl}>Federal Tax Classification</div>
                <select style={inp} value={fedClass} onChange={e => setFedClass(e.target.value)}>
                  {FED_CLASSIFICATIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <div style={lbl}>Address</div>
                <input style={inp} value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="Street address" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.6rem' }}>
                <input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
                <input style={inp} value={state} onChange={e => setState(e.target.value)} placeholder="State" />
                <input style={inp} value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="ZIP" />
              </div>
              <div style={{ display: 'flex', gap: '.6rem' }}>
                <select style={{ ...inp, flex: '0 0 90px' }} value={tinType} onChange={e => setTinType(e.target.value as 'ssn' | 'ein')}>
                  <option value="ssn">SSN</option>
                  <option value="ein">EIN</option>
                </select>
                <input style={{ ...inp, flex: 1 }} value={tin} onChange={e => setTin(e.target.value)} placeholder={tinType === 'ssn' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'} />
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                Your TIN is stored securely and only used to generate your 1099-NEC — never shown to other drivers.
              </div>
              <div style={{ display: 'flex', gap: '.6rem' }}>
                <button
                  onClick={() => setSigning(true)}
                  disabled={!canSubmitForm}
                  style={{ flex: 1, padding: '.8rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800, opacity: canSubmitForm ? 1 : .5 }}
                >
                  Continue to Sign
                </button>
                <button onClick={() => setEditing(false)} style={{ padding: '.8rem 1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editing && signing && (
            <SignaturePad
              label="certifies the information above is true, correct, and complete (Form W-9)"
              busy={busy}
              onCancel={() => setSigning(false)}
              onSave={submit}
            />
          )}
        </div>
      )}

      {filings.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.75rem' }}>My 1099-NEC Forms</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filings.map(f => (
              <button
                key={f.id} onClick={() => viewFiling(f.id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', padding: '.6rem .75rem', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.85rem',
                }}
              >
                <span>Tax Year {f.taxYear}</span>
                <span style={{ color: 'var(--primary)', fontWeight: 700 }}>${f.totalCompensation.toFixed(2)} — Download</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
