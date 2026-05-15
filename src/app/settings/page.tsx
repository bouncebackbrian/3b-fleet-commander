'use client'
import TopBar from '@/components/layout/TopBar'
export default function Settings() {
  return (
    <>
      <TopBar title="Settings" module="sys" subtitle="Supabase connection · CPM defaults · driver profile"/>
      <main style={{padding:'1.4rem',display:'grid',gap:'1.4rem',maxWidth:640}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'1.8rem',display:'grid',gap:'1.2rem'}}>
          <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Supabase connection</h2>
          <p style={{fontSize:'var(--text-sm)',color:'var(--muted)'}}>Add these to your <code>.env.local</code> file (Vercel → Settings → Environment Variables).</p>
          {[['NEXT_PUBLIC_SUPABASE_URL','https://xxxx.supabase.co'],['NEXT_PUBLIC_SUPABASE_ANON_KEY','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...']].map(([k,v])=>(
            <div key={k}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>{k}</label>
            <div style={{padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',fontFamily:'ui-monospace,monospace',fontSize:'var(--text-xs)',color:'var(--faint)',wordBreak:'break-all'}}>{v}</div></div>
          ))}
          <div style={{padding:'1rem',borderRadius:14,background:'rgba(85,145,199,.08)',border:'1px solid rgba(85,145,199,.15)',color:'var(--blue)',fontSize:'var(--text-sm)'}}>
            Get your keys at <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{color:'var(--primary)',fontWeight:700}}>supabase.com/dashboard</a> → Project Settings → API
          </div>
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'1.8rem',display:'grid',gap:'1rem'}}>
          <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>CPM defaults</h2>
          {[['Default CPM rate','0.55'],['Low CPM threshold','0.45'],['Detention rate ($/hr)','50.00']].map(([l,v])=>(
            <div key={l}><label style={{display:'block',fontSize:'var(--text-xs)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>{l}</label>
            <input defaultValue={v} type="number" step="0.01" style={{width:'100%',padding:'.8rem 1rem',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface-2)',outline:'none',fontSize:'var(--text-sm)'}}/></div>
          ))}
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'1.8rem',display:'grid',gap:'1rem'}}>
          <h2 style={{fontSize:'var(--text-lg)',fontWeight:800}}>Supabase schema</h2>
          <p style={{fontSize:'var(--text-sm)',color:'var(--muted)'}}>Run this SQL in your Supabase SQL editor to create the fleet tables:</p>
          <pre style={{overflowX:'auto',padding:'1.2rem',borderRadius:12,background:'var(--surface-2)',border:'1px solid var(--border)',fontSize:'var(--text-xs)',color:'var(--text)',lineHeight:1.7}}>{`create table loads (
  id uuid primary key default gen_random_uuid(),
  date date, load_number text, dispatcher text,
  broker text, trailer text, move_type text,
  origin text, destination text, status text,
  dispatch_miles int, actual_miles int, deadhead_miles int,
  paid_miles int, cpm_rate numeric(5,3), fuel_cost numeric(10,2),
  wait_hours numeric(6,2), detention_hours numeric(6,2),
  detention_pay numeric(10,2), settlement_pay numeric(10,2),
  notes text, proof_saved boolean default false,
  created_at timestamptz default now()
);
create table delays (
  id uuid primary key default gen_random_uuid(),
  load_number text, trailer text, delay_type text,
  location text, total_hours numeric(6,2),
  billable text, detention_rate numeric(8,2),
  dispatcher_notified boolean default false,
  notes text, created_at timestamptz default now()
);
create table fuel (
  id uuid primary key default gen_random_uuid(),
  date date, location text, fuel_type text,
  gallons numeric(8,3), price_per_gal numeric(7,3),
  total_cost numeric(10,2), load_number text,
  receipt_saved boolean default false,
  notes text, created_at timestamptz default now()
);`}</pre>
        </div>
      </main>
    </>
  )
}
