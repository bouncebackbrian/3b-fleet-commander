import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { ASSET_OPERATING_MODES, type AssetOperatingMode } from '@/lib/fleet/asset-modes'
import { MODE_UI } from '@/lib/fleet/mode-ui'
import AdminViewSelector from '@/components/admin/AdminViewSelector'

export const dynamic = 'force-dynamic'

type ViewKey = 'all' | AssetOperatingMode

function normalizeView(value?: string): ViewKey {
  if (!value || value === 'all') return 'all'
  return ASSET_OPERATING_MODES.includes(value as AssetOperatingMode) ? value as AssetOperatingMode : 'all'
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')
  if (!hasPortal(auth.portals, 'admin')) redirect('/fleet')

  const { view: rawView } = await searchParams
  const view = normalizeView(rawView)

  const [businessResult, assetsResult, shiftsResult, membersResult] = await Promise.all([
    fleetServiceClient.from('businesses').select('company_name,name,three_b_biz_id').eq('id', auth.businessId).maybeSingle(),
    fleetServiceClient.from('fleet_equipment').select('id,unit_number,equipment_type,status,ops_profile,hold_status').eq('business_id', auth.businessId).order('unit_number'),
    fleetServiceClient.from('fleet_dt_shifts').select('id,driver_id,truck_id,state,clock_in_at,clock_out_at').eq('business_id', auth.businessId).not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)').order('created_at', { ascending: false }),
    fleetServiceClient.from('fleet_business_members').select('id,user_id,active').eq('business_id', auth.businessId).eq('active', true),
  ])

  const business = businessResult.data
  const allAssets = assetsResult.data ?? []
  const assets = view === 'all' ? allAssets : allAssets.filter(a => a.ops_profile === view)
  const assetIds = new Set(assets.map(a => a.id))
  const allShifts = shiftsResult.data ?? []
  const shifts = view === 'all' ? allShifts : allShifts.filter(s => s.truck_id && assetIds.has(s.truck_id))
  const held = assets.filter(a => a.hold_status === 'on_hold').length
  const activeDrivers = new Set(shifts.map(s => s.driver_id)).size
  const members = membersResult.data ?? []

  const modeSlug = view === 'all' ? null : view.replaceAll('_', '-')
  const modeUi = modeSlug ? MODE_UI[modeSlug] : null
  const adminKpis = modeUi?.adminKpis ?? [
    { label: 'Active Assets', hint: 'Assets available in this company' },
    { label: 'Open Shifts', hint: 'Current operational activity' },
    { label: 'Team Members', hint: 'Active company members' },
    { label: 'Assets On Hold', hint: 'Equipment needing attention' },
  ]

  const values = [assets.length, shifts.length, members.length, held]

  return (
    <main style={{ maxWidth: 1220, margin: '0 auto', padding: '1.4rem', display: 'grid', gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Admin Dashboard</div>
          <h1 style={{ margin: '.4rem 0 .35rem', fontSize: 'clamp(1.7rem,4vw,2.6rem)' }}>{business?.company_name || business?.name || 'Fleet Commander'}</h1>
          <div style={{ color: 'var(--muted)', fontSize: '.76rem' }}>{business?.three_b_biz_id || auth.businessId} · full company command view</div>
        </div>
        <AdminViewSelector />
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        {adminKpis.slice(0, 4).map((kpi, index) => (
          <div key={kpi.label} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '1rem' }}>
            <div style={{ color: 'var(--muted)', fontSize: '.6rem', fontWeight: 900, textTransform: 'uppercase' }}>{kpi.label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 950, marginTop: 7 }}>{values[index] ?? '—'}</div>
            <div style={{ color: 'var(--faint)', fontSize: '.65rem', marginTop: 4 }}>{kpi.hint}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
        <Link href="/assets" style={cardLink}><strong>Assets</strong><span>Readiness, operating classification, documents and maintenance.</span></Link>
        <Link href="/team" style={cardLink}><strong>Team</strong><span>Members, operational access and permission management.</span></Link>
        <Link href="/compliance" style={cardLink}><strong>Compliance</strong><span>Credentials, inspections, expirations and required evidence.</span></Link>
        <Link href="/expenses" style={cardLink}><strong>Expenses</strong><span>Fuel, receipts and company operating expenses.</span></Link>
        <Link href="/admin/dump-truck/reports" style={cardLink}><strong>Reports</strong><span>Company reporting with KPIs adapted to the selected asset view.</span></Link>
      </section>

      <section style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '1rem' }}>
        <div style={{ fontWeight: 900 }}>Current view</div>
        <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: '.75rem', lineHeight: 1.55 }}>
          {view === 'all'
            ? `Showing all company assets across every operating classification. ${activeDrivers} driver${activeDrivers === 1 ? '' : 's'} currently have open activity.`
            : `Showing only ${view.replaceAll('_', ' ')} assets. The dashboard stays Admin; only KPIs, queues and report emphasis change.`}
        </div>
      </section>
    </main>
  )
}

const cardLink: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 14,
  padding: '1rem',
  display: 'grid',
  gap: 5,
  color: 'var(--text)',
  textDecoration: 'none',
}
