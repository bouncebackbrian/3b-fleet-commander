import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const dynamic = 'force-dynamic'

export default async function DispatchDashboardPage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/start')
  if (!hasPortal(auth.portals, 'dispatch')) redirect('/fleet')

  const [businessResult, assetsResult, shiftsResult] = await Promise.all([
    fleetServiceClient.from('businesses').select('name,three_b_biz_id').eq('id', auth.businessId).maybeSingle(),
    fleetServiceClient.from('fleet_equipment').select('id,status,hold_status').eq('business_id', auth.businessId),
    fleetServiceClient.from('fleet_dt_shifts').select('id,driver_id,truck_id,state').eq('business_id', auth.businessId).not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)'),
  ])

  const business = businessResult.data
  const assets = assetsResult.data ?? []
  const shifts = shiftsResult.data ?? []
  const activeDrivers = new Set(shifts.map(shift => shift.driver_id)).size
  const readyAssets = assets.filter(asset => asset.status === 'active' && asset.hold_status !== 'on_hold').length
  const heldAssets = assets.filter(asset => asset.hold_status === 'on_hold').length

  const snapshot = [
    { label: 'Open Work', value: shifts.length, hint: 'Jobs / shifts in motion' },
    { label: 'Drivers Working', value: activeDrivers, hint: 'Active operational roster' },
    { label: 'Assets Ready', value: readyAssets, hint: `${assets.length} total assets` },
    { label: 'Exceptions', value: heldAssets, hint: 'Assets needing attention' },
  ]

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(1.1rem,3vw,2rem)', display: 'grid', gap: 26 }}>
      <header>
        <div style={{ color: 'var(--primary)', fontSize: '.64rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }}>Dispatch</div>
        <h1 style={{ margin: '.35rem 0 .3rem', fontSize: 'clamp(1.9rem,4vw,3rem)', letterSpacing: '-.035em' }}>{business?.name || 'Fleet Commander'}</h1>
        <div style={{ color: 'var(--muted)', fontSize: '.76rem' }}>{business?.three_b_biz_id || auth.businessId} · today’s operations</div>
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
          <div style={{ fontWeight: 900, fontSize: '1rem' }}>{heldAssets > 0 ? `${heldAssets} exception${heldAssets === 1 ? '' : 's'} need dispatch attention` : 'No asset holds blocking today’s work'}</div>
          <div style={{ color: 'var(--muted)', fontSize: '.76rem', marginTop: 5, lineHeight: 1.5 }}>Dispatch stays focused on jobs, assignments, assets and operational exceptions.</div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '.7rem' }}>Use the sidebar for Jobs, Assets, Team, Compliance, KPIs and Reports.</div>
      </section>
    </main>
  )
}
