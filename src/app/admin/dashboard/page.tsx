import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { ASSET_OPERATING_MODES, type AssetOperatingMode } from '@/lib/fleet/asset-modes'
import AdminViewSelector from '@/components/admin/AdminViewSelector'

export const dynamic = 'force-dynamic'

type ViewKey = 'all' | AssetOperatingMode

function normalizeView(value?: string): ViewKey {
  if (!value || value === 'all') return 'all'
  return ASSET_OPERATING_MODES.includes(value as AssetOperatingMode) ? value as AssetOperatingMode : 'all'
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/start')
  if (!hasPortal(auth.portals, 'admin')) redirect('/fleet')

  const { view: rawView } = await searchParams
  const view = normalizeView(rawView)

  const [businessResult, assetsResult, shiftsResult, membersResult] = await Promise.all([
    fleetServiceClient.from('businesses').select('name,three_b_biz_id').eq('id', auth.businessId).maybeSingle(),
    fleetServiceClient.from('fleet_equipment').select('id,status,ops_profile,hold_status').eq('business_id', auth.businessId),
    fleetServiceClient.from('fleet_dt_shifts').select('id,driver_id,truck_id,state').eq('business_id', auth.businessId).not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)'),
    fleetServiceClient.from('fleet_business_members').select('id').eq('business_id', auth.businessId).eq('active', true),
  ])

  const business = businessResult.data
  const allAssets = assetsResult.data ?? []
  const assets = view === 'all' ? allAssets : allAssets.filter(asset => asset.ops_profile === view)
  const assetIds = new Set(assets.map(asset => asset.id))
  const allShifts = shiftsResult.data ?? []
  const shifts = view === 'all' ? allShifts : allShifts.filter(shift => shift.truck_id && assetIds.has(shift.truck_id))
  const activeDrivers = new Set(shifts.map(shift => shift.driver_id)).size
  const heldAssets = assets.filter(asset => asset.hold_status === 'on_hold').length
  const activeAssets = assets.filter(asset => asset.status === 'active').length
  const teamCount = membersResult.data?.length ?? 0

  const snapshot = [
    { label: 'Active Assets', value: activeAssets, hint: `${assets.length} in current view` },
    { label: 'Drivers Working', value: activeDrivers, hint: 'Open activity now' },
    { label: 'Open Work', value: shifts.length, hint: 'Current shifts / jobs' },
    { label: 'Needs Attention', value: heldAssets, hint: 'Assets currently on hold' },
  ]

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(1.1rem,3vw,2rem)', display: 'grid', gap: 26 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--primary)', fontSize: '.64rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }}>Admin</div>
          <h1 style={{ margin: '.35rem 0 .3rem', fontSize: 'clamp(1.9rem,4vw,3rem)', letterSpacing: '-.035em' }}>{business?.name || 'Fleet Commander'}</h1>
          <div style={{ color: 'var(--muted)', fontSize: '.76rem' }}>{business?.three_b_biz_id || auth.businessId}</div>
        </div>
        <AdminViewSelector />
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        {snapshot.map(item => (
          <div key={item.label} style={{ background: 'rgba(255,255,255,.035)', borderRadius: 18, padding: '1.15rem', minHeight: 112 }}>
            <div style={{ color: 'var(--muted)', fontSize: '.62rem', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.06em' }}>{item.label}</div>
            <div style={{ fontSize: '2.15rem', lineHeight: 1, fontWeight: 950, marginTop: 12 }}>{item.value}</div>
            <div style={{ color: 'var(--faint)', fontSize: '.66rem', marginTop: 8 }}>{item.hint}</div>
          </div>
        ))}
      </section>

      <section style={{ background: heldAssets > 0 ? 'rgba(245,194,0,.055)' : 'rgba(255,255,255,.025)', borderRadius: 20, padding: '1.25rem 1.35rem', display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1rem' }}>{heldAssets > 0 ? `${heldAssets} asset${heldAssets === 1 ? '' : 's'} need attention` : 'Operations look clear'}</div>
          <div style={{ color: 'var(--muted)', fontSize: '.76rem', marginTop: 5, lineHeight: 1.5 }}>
            {view === 'all' ? `${teamCount} active team members · all asset classifications` : `${view.replaceAll('_', ' ')} view · ${assets.length} asset${assets.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '.7rem' }}>Use the sidebar for Jobs, Assets, Team, Compliance, Expenses, KPIs and Reports.</div>
      </section>
    </main>
  )
}
