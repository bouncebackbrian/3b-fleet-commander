import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { assetModeToSlug, isAssetOperatingMode } from '@/lib/fleet/asset-modes'

export const dynamic = 'force-dynamic'

export default async function DriverHomePage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/start')
  if (!hasPortal(auth.portals, 'driver')) redirect('/fleet')

  const { data: shift } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('truck_id')
    .eq('business_id', auth.businessId)
    .eq('driver_id', auth.userId)
    .not('truck_id', 'is', null)
    .order('clock_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (shift?.truck_id) {
    const { data: asset } = await fleetServiceClient
      .from('fleet_equipment')
      .select('ops_profile')
      .eq('business_id', auth.businessId)
      .eq('id', shift.truck_id)
      .maybeSingle()

    if (isAssetOperatingMode(asset?.ops_profile)) {
      redirect(`/driver/${assetModeToSlug(asset.ops_profile)}`)
    }
  }

  return (
    <main style={{ minHeight: '100dvh', background: '#06100d', color: '#eefcf8', padding: '1.25rem' }}>
      <div style={{ maxWidth: 720, margin: '8vh auto 0', display: 'grid', gap: 18 }}>
        <div style={{ color: '#00e8b0', fontSize: '.68rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Driver</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem,7vw,3.5rem)', lineHeight: 1 }}>Ready for assignment</h1>
        <p style={{ margin: 0, color: '#8ba69f', fontSize: '1rem', lineHeight: 1.65, maxWidth: 620 }}>
          No driving workflow is selected until a company asset is assigned to you. Once Dispatch assigns the truck, Fleet Commander opens the correct Driver experience automatically.
        </p>
        <section style={{ marginTop: 8, borderRadius: 20, background: 'rgba(255,255,255,.045)', padding: '1.25rem', display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: '1.05rem' }}>Nothing to configure here</strong>
          <span style={{ color: '#78978f', lineHeight: 1.55 }}>Your truck determines the driving mode. You do not need to choose Dump Truck, OTR, Regional, Hotshot, or another mode yourself.</span>
        </section>
      </div>
    </main>
  )
}
