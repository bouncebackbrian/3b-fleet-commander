'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import { loadSettings, persistSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'

const inp: React.CSSProperties = { width: '100%', padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', outline: 'none', fontSize: 'var(--text-sm)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }

export default function Settings() {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setS(loadSettings()) }, [])

  function set(k: keyof AppSettings, v: string) {
    setS(prev => ({ ...prev, [k]: typeof prev[k] === 'number' ? Number(v) || 0 : v }))
    setSaved(false)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    persistSettings(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    setS(DEFAULT_SETTINGS)
    persistSettings(DEFAULT_SETTINGS)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <>
      <TopBar title="Settings" module="sys" subtitle="Driver profile · pay defaults · CPM rates" />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem', maxWidth: 640 }}>
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '1.4rem' }}>

          {/* Driver profile */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Driver profile</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: -4 }}>Used in dashboard headers and dispute scripts.</p>
            <div>
              <label style={lbl}>Driver / company name</label>
              <input value={s.driverName} onChange={e => set('driverName', e.target.value)} placeholder="e.g. 3B Transport" style={inp} />
            </div>
            <div>
              <label style={lbl}>Dispatcher name</label>
              <input value={s.dispatcher} onChange={e => set('dispatcher', e.target.value)} placeholder="e.g. Trev" style={inp} />
            </div>
          </div>

          {/* CPM defaults */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>CPM &amp; pay defaults</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: -4 }}>These drive the pay analysis on the dashboard and default rate when logging new loads.</p>
            <div>
              <label style={lbl}>Default CPM rate</label>
              <input value={s.defaultCpm} onChange={e => set('defaultCpm', e.target.value)} type="number" step="0.001" style={inp} />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 4 }}>Pre-filled on every new load entry</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={lbl}>Pay analysis — low CPM</label>
                <input value={s.cpmLow} onChange={e => set('cpmLow', e.target.value)} type="number" step="0.001" style={inp} />
              </div>
              <div>
                <label style={lbl}>Pay analysis — high CPM</label>
                <input value={s.cpmHigh} onChange={e => set('cpmHigh', e.target.value)} type="number" step="0.001" style={inp} />
              </div>
            </div>
            <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
              Dashboard pay analysis will show: <strong style={{ color: 'var(--text)' }}>@ ${s.cpmLow.toFixed(3)} CPM</strong> and <strong style={{ color: 'var(--text)' }}>@ ${s.cpmHigh.toFixed(3)} CPM</strong>
            </div>
            <div>
              <label style={lbl}>Detention rate ($/hr)</label>
              <input value={s.detentionRate} onChange={e => set('detentionRate', e.target.value)} type="number" step="0.01" style={inp} />
            </div>
          </div>

          {/* Supabase connection (read-only reference) */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Supabase connection</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>Set these in Vercel → Settings → Environment Variables (not editable here).</p>
            {(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const).map(k => (
              <div key={k}>
                <label style={lbl}>{k}</label>
                <div style={{ padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', fontFamily: 'ui-monospace,monospace', fontSize: 'var(--text-xs)', color: 'var(--faint)', wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' && process.env[k] ? process.env[k] : '(set in Vercel)'}
                </div>
              </div>
            ))}
            <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(85,145,199,.08)', border: '1px solid rgba(85,145,199,.15)', color: 'var(--blue)', fontSize: 'var(--text-sm)' }}>
              Get your keys at <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700 }}>supabase.com/dashboard</a> &rarr; Project Settings &rarr; API
            </div>
          </div>

          {/* Save bar */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button type="button" onClick={handleReset}
              style={{ padding: '.8rem 1.2rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
              Reset to defaults
            </button>
            <button type="submit"
              style={{ padding: '.8rem 2rem', borderRadius: 12, background: saved ? 'var(--success)' : 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', transition: '200ms' }}>
              {saved ? 'Saved!' : 'Save settings'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
