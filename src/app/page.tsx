'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createAuthClient } from '@/lib/auth-client'
import { FLEET_MODES } from '@/lib/fleet/modes'

const card: React.CSSProperties = { border: '1px solid rgba(0,232,176,.11)', background: 'rgba(11,27,24,.62)', borderRadius: 16, padding: '1.1rem' }

export default function HomePage() {
  const [authed, setAuthed] = useState(false)
  useEffect(() => { createAuthClient().auth.getSession().then(({ data }) => setAuthed(!!data.session)) }, [])

  return (
    <main style={{ minHeight: '100dvh', background: '#030c0a', color: '#eefcf8', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, padding: '.8rem 1.25rem', background: 'rgba(3,12,10,.94)', borderBottom: '1px solid rgba(0,232,176,.08)', backdropFilter: 'blur(14px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <img src="/logo.png" alt="Fleet Commander" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 8 }} />
            <div><div style={{ color: '#f5c200', fontWeight: 950, fontSize: '.82rem' }}>3B FLEET COMMANDER</div><div style={{ color: '#00e8b0', fontSize: '.54rem', fontWeight: 850, letterSpacing: '.1em' }}>WORK · MILES · TIME · MARGIN</div></div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/product-tour" style={{ color: '#85b5a8', fontSize: '.76rem', fontWeight: 800, textDecoration: 'none' }}>Product Tour</Link>
            <Link href={authed ? '/start' : '/login'} style={{ padding: '.55rem .9rem', borderRadius: 9, background: '#00e8b0', color: '#04110d', fontWeight: 900, textDecoration: 'none', fontSize: '.76rem' }}>{authed ? 'Continue Setup →' : 'Sign In →'}</Link>
          </div>
        </div>
      </nav>

      <section style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(4rem,9vw,7rem) 1.25rem 3rem', textAlign: 'center' }}>
        <div style={{ color: '#00e8b0', fontSize: '.68rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase' }}>Built around the operation — not generic fleet software</div>
        <h1 style={{ margin: '.8rem 0 1rem', fontSize: 'clamp(2.3rem,7vw,4.6rem)', lineHeight: 1.03, fontWeight: 950, letterSpacing: '-.035em' }}>Track the work.<br /><span style={{ color: '#f5c200' }}>Prove what makes money.</span></h1>
        <p style={{ maxWidth: 730, margin: '0 auto', color: '#7eada0', fontSize: 'clamp(.94rem,2vw,1.1rem)', lineHeight: 1.7 }}>
          Fleet Commander gives drivers a clean workflow for the job they actually do, while companies see paid time, billable time, mileage, fuel, dead time, production and profit evidence in one system.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: '1.8rem' }}>
          <Link href={authed ? '/start' : '/login'} style={{ padding: '.82rem 1.35rem', borderRadius: 11, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none' }}>Set Up Fleet Commander →</Link>
          <Link href="/product-tour" style={{ padding: '.82rem 1.35rem', borderRadius: 11, border: '1px solid rgba(0,232,176,.22)', color: '#cceee6', fontWeight: 850, textDecoration: 'none' }}>See It in Action</Link>
        </div>
      </section>

      <section style={{ borderTop: '1px solid rgba(0,232,176,.07)', borderBottom: '1px solid rgba(0,232,176,.07)', background: 'rgba(0,232,176,.022)', padding: '1.4rem 1.25rem' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          {[['⏱️','Time Evidence','Paid, billable and dead time stay visible.'],['🧾','Proof','Tickets, receipts, photos and timestamps.'],['🛣️','Mileage','Business, loaded, deadhead and operational miles.'],['📈','Profitability','Turn driver activity into usable margin data.']].map(([i,t,d]) => <div key={t} style={{ textAlign: 'center' }}><div style={{ fontSize: '1.4rem' }}>{i}</div><div style={{ fontWeight: 900, marginTop: 4 }}>{t}</div><div style={{ color: '#658f83', fontSize: '.7rem', lineHeight: 1.45, marginTop: 3 }}>{d}</div></div>)}
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '3.5rem 1.25rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}><div style={{ color: '#00e8b0', fontSize: '.66rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }}>Operating modes</div><h2 style={{ margin: '.5rem 0', fontSize: 'clamp(1.7rem,4vw,2.6rem)' }}>One platform. Purpose-built driver flows.</h2><p style={{ color: '#709c90', maxWidth: 680, margin: '0 auto', lineHeight: 1.6 }}>Each paid mode is designed around the unique actions and evidence that matter to that operation. Unreleased modes are marked Coming Soon.</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
          {FLEET_MODES.map(mode => <div key={mode.id} style={{ ...card, opacity: mode.status === 'live' ? 1 : .78 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ fontSize: '1.6rem' }}>{mode.icon}</div><div style={{ color: mode.status === 'live' ? '#00e8b0' : '#f5c200', fontSize: '.55rem', fontWeight: 900, textTransform: 'uppercase' }}>{mode.status === 'live' ? 'Live' : 'Coming Soon'}</div></div><div style={{ marginTop: 8, fontWeight: 950, fontSize: '1rem' }}>{mode.name}</div><div style={{ marginTop: 6, color: '#729b90', fontSize: '.75rem', lineHeight: 1.55 }}>{mode.summary}</div>{mode.status === 'live' && mode.driverHref && <Link href={mode.driverHref} style={{ display: 'inline-block', marginTop: 10, color: '#00e8b0', fontSize: '.72rem', fontWeight: 850, textDecoration: 'none' }}>Open mode →</Link>}</div>)}
        </div>
      </section>

      <section style={{ borderTop: '1px solid rgba(0,232,176,.07)', padding: '3.5rem 1.25rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
          <div style={card}><div style={{ color: '#f5c200', fontWeight: 900, fontSize: '.64rem', textTransform: 'uppercase' }}>For Drivers</div><h3>Less tapping. Better records.</h3><p style={{ color: '#739d92', lineHeight: 1.6, fontSize: '.82rem' }}>The screen changes with the job. When the vehicle moves, Safe Drive automatically locks detailed controls and keeps only essential driving information plus simple Spotify controls.</p></div>
          <div style={card}><div style={{ color: '#00e8b0', fontWeight: 900, fontSize: '.64rem', textTransform: 'uppercase' }}>For Companies</div><h3>See where margin disappears.</h3><p style={{ color: '#739d92', lineHeight: 1.6, fontSize: '.82rem' }}>Compare operational time to customer-billable time, identify waiting and dead time, track fuel and mileage, and keep an auditable driver/dispatch record.</p></div>
          <div style={card}><div style={{ color: '#4ac4ff', fontWeight: 900, fontSize: '.64rem', textTransform: 'uppercase' }}>3B Identity</div><h3>Permissions follow the person.</h3><p style={{ color: '#739d92', lineHeight: 1.6, fontSize: '.82rem' }}>Every person uses a 3B ID, joins one or more businesses, and receives only the Fleet Commander roles and operating modes they are authorized to use.</p></div>
        </div>
      </section>

      <section style={{ padding: '3.5rem 1.25rem', textAlign: 'center', borderTop: '1px solid rgba(0,232,176,.07)' }}><h2 style={{ marginBottom: '.6rem' }}>Start with the operation you run today.</h2><p style={{ color: '#729b90', marginBottom: '1.3rem' }}>Add more modes as your business grows.</p><Link href={authed ? '/start' : '/login'} style={{ display: 'inline-block', padding: '.82rem 1.35rem', borderRadius: 11, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none' }}>Get Started →</Link></section>
    </main>
  )
}
