'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { updateCompanyProfile } from '@/lib/company-profile'

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.7rem .75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#07120f', color: '#eefcf8' }

export default function CompanyProfileStep({ businessId }: { businessId: string }) {
  const [form, setForm] = useState({ addressLine1: '', city: '', state: '', postalCode: '', mcNumber: '', dotNumber: '', businessPhone: '', domainEmail: '', website: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('businesses')
        .select('address_line1,city,state,postal_code,mc_number,dot_number,business_phone,domain_email,website')
        .eq('id', businessId).single()
      if (!active || !data) return
      setForm({
        addressLine1: data.address_line1 ?? '', city: data.city ?? '', state: data.state ?? '', postalCode: data.postal_code ?? '',
        mcNumber: data.mc_number ?? '', dotNumber: data.dot_number ?? '', businessPhone: data.business_phone ?? '',
        domainEmail: data.domain_email ?? '', website: data.website ?? '',
      })
    }
    void load()
    return () => { active = false }
  }, [businessId])

  function field(key: keyof typeof form, placeholder: string) {
    return <input style={input} value={form[key]} onChange={e => { setSaved(false); setForm(v => ({ ...v, [key]: e.target.value })) }} placeholder={placeholder} />
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try { await updateCompanyProfile(businessId, form); setSaved(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save company profile.') }
    finally { setSaving(false) }
  }

  return <div style={{ display: 'grid', gap: 10 }}>
    <div style={{ color: '#789f95', fontSize: '.72rem', lineHeight: 1.5 }}>This information belongs only to the selected 3B Business ID and is used on company reports, compliance records, and operational documents.</div>
    {field('addressLine1', 'Company street address')}
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
      {field('city', 'City')}{field('state', 'State')}{field('postalCode', 'ZIP')}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {field('mcNumber', 'MC number')}{field('dotNumber', 'USDOT number')}
    </div>
    {field('businessPhone', 'Company phone')}
    {field('domainEmail', 'Company email')}
    {field('website', 'Website')}
    {error && <div style={{ color: '#ff806f', fontSize: '.72rem' }}>{error}</div>}
    {saved && <div style={{ color: '#00e8b0', fontSize: '.72rem', fontWeight: 850 }}>Company profile saved ✓</div>}
    <button onClick={save} disabled={saving} style={{ padding: '.75rem', borderRadius: 10, border: 0, background: '#00e8b0', color: '#04110d', fontWeight: 950, opacity: saving ? .6 : 1 }}>
      {saving ? 'Saving company profile…' : 'Save Company Profile'}
    </button>
  </div>
}
