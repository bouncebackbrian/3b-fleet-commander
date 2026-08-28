'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProvisionalBusiness } from '@/lib/fleet/provisionalBusiness'

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '.8rem .85rem', borderRadius: 10,
  border: '1px solid rgba(255,255,255,.12)', background: '#07120f', color: '#eefcf8', fontSize: '.9rem',
}

export default function ProvisionalEmployerPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [truckType, setTruckType] = useState('tractor')
  const [vin, setVin] = useState('')
  const [plate, setPlate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!companyName.trim()) return
    setSaving(true); setError('')
    const result = await createProvisionalBusiness({
      companyName, ownerName, ownerEmail, ownerPhone,
      truckUnitNumber: unitNumber, truckType, vin, licensePlate: plate,
    })
    if (!result) {
      setError('Could not create the provisional company record. Please try again.')
      setSaving(false)
      return
    }
    router.push('/start')
  }

  return (
    <main style={{ minHeight: '100dvh', background: '#030c0a', color: '#eefcf8', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.2rem 4rem' }}>
        <Link href="/start" style={{ color: '#7ca99d', textDecoration: 'none', fontSize: '.8rem' }}>← Fleet Commander Setup</Link>

        <div style={{ marginTop: '1.8rem' }}>
          <div style={{ color: '#f5c200', fontSize: '.66rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Driver-created employer</div>
          <h1 style={{ margin: '.5rem 0 .7rem', fontSize: 'clamp(1.8rem,6vw,2.8rem)' }}>The owner has not joined 3B yet.</h1>
          <p style={{ color: '#789f95', lineHeight: 1.65 }}>
            Create a provisional company record so your truck, work time, mileage and evidence have the correct 3B Business ID. This does not make you the owner of the company. Your account is recorded only as the driver who supplied the information.
          </p>
        </div>

        <section style={{ marginTop: '1.5rem', padding: '1.2rem', borderRadius: 16, border: '1px solid rgba(245,194,0,.18)', background: 'rgba(245,194,0,.04)' }}>
          <div style={{ color: '#f5c200', fontWeight: 900, fontSize: '.78rem' }}>OWNER ACCOUNT NOT CLAIMED</div>
          <div style={{ color: '#91ada6', fontSize: '.73rem', lineHeight: 1.5, marginTop: 5 }}>The business can later be claimed by the verified owner without moving the truck or work history to another record.</div>
        </section>

        <section style={{ marginTop: '1rem', display: 'grid', gap: 10, padding: '1.2rem', borderRadius: 16, border: '1px solid rgba(0,232,176,.12)', background: 'rgba(11,27,24,.72)' }}>
          <strong>Company</strong>
          <input style={input} placeholder="Company name *" value={companyName} onChange={e => setCompanyName(e.target.value)} />
          <input style={input} placeholder="Owner name (if known)" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
          <input style={input} placeholder="Owner email (if known)" type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
          <input style={input} placeholder="Owner phone (if known)" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} />
        </section>

        <section style={{ marginTop: '1rem', display: 'grid', gap: 10, padding: '1.2rem', borderRadius: 16, border: '1px solid rgba(0,232,176,.12)', background: 'rgba(11,27,24,.72)' }}>
          <div><strong>Truck you operate</strong><div style={{ color: '#70998f', fontSize: '.7rem', marginTop: 3 }}>Optional now. You can add it later.</div></div>
          <input style={input} placeholder="Unit number / truck number" value={unitNumber} onChange={e => setUnitNumber(e.target.value)} />
          <select style={input} value={truckType} onChange={e => setTruckType(e.target.value)}>
            <option value="tractor">Truck / Tractor</option>
            <option value="dump_truck">Dump Truck</option>
            <option value="water_truck">Water Truck</option>
            <option value="pickup">Pickup / Hotshot</option>
            <option value="other">Other</option>
          </select>
          <input style={input} placeholder="VIN (optional)" value={vin} onChange={e => setVin(e.target.value)} />
          <input style={input} placeholder="License plate (optional)" value={plate} onChange={e => setPlate(e.target.value)} />
        </section>

        {error && <div style={{ marginTop: 10, color: '#ff806f', fontSize: '.78rem' }}>{error}</div>}
        <button onClick={save} disabled={saving || !companyName.trim()} style={{ width: '100%', marginTop: '1rem', padding: '.9rem', border: 0, borderRadius: 11, background: '#00e8b0', color: '#04110d', fontWeight: 950, fontSize: '.9rem', opacity: saving || !companyName.trim() ? .6 : 1 }}>
          {saving ? 'Creating…' : 'Create Provisional Company & Continue →'}
        </button>
      </div>
    </main>
  )
}
