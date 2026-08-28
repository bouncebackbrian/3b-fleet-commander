import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { ASSET_OPERATING_MODES, type AssetOperatingMode } from '@/lib/fleet/asset-modes'
import { MODE_UI } from '@/lib/fleet/mode-ui'

export const dynamic = 'force-dynamic'

type ViewKey = 'all' | AssetOperatingMode
function normalizeView(value?: string): ViewKey {
  if (!value || value === 'all') return 'all'
  return ASSET_OPERATING_MODES.includes(value as AssetOperatingMode) ? value as AssetOperatingMode : 'all'
}

export default async function DispatchDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'dispatch')) redirect('/fleet')

  const { view: rawView } = await searchParams
  const view = normalizeView(rawView)

  const [businessResult, assetsResult, shiftsResult] = await Promise.all([
    fleetServiceClient.from('businesses').select('company_name,name,three_b_biz_id').eq('id', auth.businessId).maybeSingle(),
    fleetServiceClient.from('fleet_equipment').select('id,unit_number,status,ops_profile,hold_status').eq('business_id', auth.businessId).order('unit_number'),
    fleetServiceClient.from('fleet_dt_shifts').select('id,truck_id,driver_id,state').eq('business_id', auth.businessId).not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)'),
  ])

  const business = businessResult.data
  const allAssets = assetsResult.data ?? []
  const assets = view === 'all' ? allAssets : allAssets.filter(a => a.ops_profile === view)
  const assetIds = new Set(assets.map(a => a.id))
  const allShifts = shiftsResult.data ?? []
  const shifts = view === 'all' ? allShifts : allShifts.filter(s => s.truck_id && assetIds.has(s.truck_id))
  const held = assets.filter(a => a.hold_status === 'on_hold').length
  const activeDrivers = new Set(shifts.map(s => s.driver_id)).size

  const modeSlug = view === 'all' ? null : view.replaceAll('_', '-')
  const modeUi = modeSlug ? MODE_UI[modeSlug] : null
  const kpis = modeUi?.dispatchKpis ?? [
    { label: 'Active Assets', hint: 'Assets in this view' },
    { label: 'Active Drivers', hint: 'Drivers with open work' },
    { label: 'Open Work', hint: 'Current shifts / jobs' },
    { label: 'Exceptions', hint: 'Assets on hold / attention' },
  ]
  const values = [assets.length, activeDrivers, shifts.length, held]

  return <main style={{ maxWidth: 1200, margin: '0 auto', padding: '1.4rem', display: 'grid', gap: 18 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'end' }}>
      <div>
        <div style={{ color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Dispatch Dashboard</div>
        <h1 style={{ margin: '.35rem 0 .35rem' }}>{business?.company_name || business?.name || 'Fleet Commander'}</h1>
        <div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>{business?.three_b_biz_id || auth.businessId} · operational command view</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Link href="/dispatch/dashboard?view=all" style={chip(view === 'all')}>All Assets</Link>
        {ASSET_OPERATING_MODES.map(mode => <Link key={mode} href={`/dispatch/dashboard?view=${mode}`} style={chip(view === mode)}>{mode.replaceAll('_', ' ')}</Link>)}
      </div>
    </header>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
      {kpis.slice(0, 4).map((kpi, index) => <div key={kpi.label} style={card}>
        <div style={{ color: 'var(--muted)', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase' }}>{kpi.label}</div>
        <div style={{ fontSize: '1.7rem', fontWeight: 950, marginTop: 7 }}>{values[index] ?? '—'}</div>
        <div style={{ color: 'var(--faint)', fontSize: '.64rem', marginTop: 4 }}>{kpi.hint}</div>
      </div>)}
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
      <Link href="/assets" style={linkCard}>Assets<span>Readiness, assignment and operating classifications.</span></Link>
      <Link href="/team" style={linkCard}>Team<span>Operational roster. Permission changes remain Admin-only.</span></Link>
      <Link href="/compliance" style={linkCard}>Compliance<span>Credentials, inspections and missing evidence.</span></Link>
      <Link href="/kpis?lens=dispatch" style={linkCard}>KPIs<span>Operational KPIs adapted to the selected asset class.</span></Link>
      <Link href="/dispatch/dump-truck/reports" style={linkCard}>Reports<span>Date-range operational reports and exceptions.</span></Link>
    </section>
  </main>
}

const card: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '1rem' }
const linkCard: React.CSSProperties = { ...card, display: 'grid', gap: 5, textDecoration: 'none', color: 'var(--text)', fontWeight: 900 }
function chip(active: boolean): React.CSSProperties { return { textDecoration: 'none', textTransform: 'capitalize', border: '1px solid var(--border)', borderRadius: 999, padding: '.45rem .65rem', fontSize: '.63rem', fontWeight: 800, color: active ? 'var(--surface)' : 'var(--muted)', background: active ? 'var(--primary)' : 'var(--surface)' } }
