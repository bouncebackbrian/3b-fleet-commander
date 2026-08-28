import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { getCurrentDriverAsset } from '@/lib/fleet/asset-context'
import { ASSET_OPERATING_MODES, type AssetOperatingMode } from '@/lib/fleet/asset-modes'
import { MODE_UI } from '@/lib/fleet/mode-ui'

type Lens = 'driver' | 'dispatch' | 'admin'

type Search = { lens?: string; mode?: string }

function allowedLenses(portals: Record<string, string | undefined>): Lens[] {
  const result: Lens[] = []
  if (portals.driver) result.push('driver')
  if (portals.dispatch) result.push('dispatch')
  if (portals.admin) result.push('admin')
  return result
}

function normalizeMode(value?: string): AssetOperatingMode | null {
  return value && ASSET_OPERATING_MODES.includes(value as AssetOperatingMode) ? value as AssetOperatingMode : null
}

export default async function KpisPage({ searchParams }: { searchParams: Promise<Search> }) {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')

  const search = await searchParams
  const lenses = allowedLenses(auth.portals)
  if (lenses.length === 0) redirect('/fleet')

  const requestedLens = search.lens as Lens | undefined
  const lens: Lens = requestedLens && lenses.includes(requestedLens)
    ? requestedLens
    : hasPortal(auth.portals, 'admin')
      ? 'admin'
      : hasPortal(auth.portals, 'dispatch')
        ? 'dispatch'
        : 'driver'

  const currentAsset = lens === 'driver' ? await getCurrentDriverAsset(auth.businessId, auth.userId) : null
  const requestedMode = normalizeMode(search.mode)
  const mode = lens === 'driver' ? currentAsset?.operatingMode ?? requestedMode : requestedMode
  const modeSlug = mode ? mode.replaceAll('_', '-') : null
  const config = modeSlug ? MODE_UI[modeSlug] : null

  const kpis = lens === 'driver'
    ? config?.driverKpis ?? [
        { label: 'Paid Hours', hint: 'Your clocked work time' },
        { label: 'Miles', hint: 'Your recorded mileage' },
        { label: 'Jobs Completed', hint: 'Completed assigned work' },
        { label: 'Exception Time', hint: 'Delay / problem time' },
      ]
    : lens === 'dispatch'
      ? config?.dispatchKpis ?? [
          { label: 'Active Jobs', hint: 'Current company work' },
          { label: 'Active Assets', hint: 'Assets currently working' },
          { label: 'On-Time %', hint: 'Operational schedule performance' },
          { label: 'Exceptions', hint: 'Current work needing attention' },
        ]
      : config?.adminKpis ?? [
          { label: 'Utilization', hint: 'Productive asset / labor use' },
          { label: 'Billable %', hint: 'Billable vs paid operational time' },
          { label: 'Operating Cost', hint: 'Period company operating cost' },
          { label: 'Exception Rate', hint: 'Recurring operational loss rate' },
        ]

  return <main style={{ maxWidth: 1160, margin: '0 auto', padding: '1.4rem', display: 'grid', gap: 18 }}>
    <header>
      <div style={{ color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em' }}>KPI Center</div>
      <h1 style={{ margin: '.35rem 0 .4rem' }}>{lens === 'driver' ? 'Driver KPIs' : lens === 'dispatch' ? 'Dispatch KPIs' : 'Admin KPIs'}</h1>
      <p style={{ color: 'var(--muted)', margin: 0, maxWidth: 780, lineHeight: 1.55 }}>
        The KPI tab uses the same Fleet data but changes the measurements to match the user’s authorized position. Trucking-type KPIs come from the asset classification, not the business.
      </p>
    </header>

    {lenses.length > 1 && <section style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {lenses.map(item => <Link key={item} href={`/kpis?lens=${item}${mode ? `&mode=${mode}` : ''}`} style={pill(item === lens)}>{item}</Link>)}
    </section>}

    {lens !== 'driver' && <section style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      <Link href={`/kpis?lens=${lens}`} style={pill(!mode)}>All Assets</Link>
      {ASSET_OPERATING_MODES.map(item => <Link key={item} href={`/kpis?lens=${lens}&mode=${item}`} style={pill(mode === item)}>{item.replaceAll('_', ' ')}</Link>)}
    </section>}

    {lens === 'driver' && currentAsset && <section style={infoCard}>
      <strong>Current asset: Unit {currentAsset.unitNumber}</strong>
      <span style={{ color: 'var(--muted)', fontSize: '.7rem', textTransform: 'capitalize' }}>{currentAsset.operatingMode?.replaceAll('_', ' ') || 'Operating mode not set'}</span>
    </section>}

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
      {kpis.map(kpi => <div key={kpi.label} style={kpiCard}>
        <div style={{ color: 'var(--muted)', fontSize: '.6rem', fontWeight: 900, textTransform: 'uppercase' }}>{kpi.label}</div>
        <div style={{ fontSize: '1.9rem', fontWeight: 950, marginTop: 8 }}>—</div>
        <div style={{ color: 'var(--faint)', fontSize: '.66rem', marginTop: 5 }}>{kpi.hint}</div>
      </div>)}
    </section>

    <section style={infoCard}>
      <strong>{mode ? mode.replaceAll('_', ' ') : 'All-assets'} KPI definition</strong>
      <span style={{ color: 'var(--muted)', fontSize: '.72rem', lineHeight: 1.5 }}>
        KPI calculations will share the same date-range and evidence sources used by Reports. The visible metrics are intentionally different for Driver, Dispatch and Admin so people only see measurements appropriate to their position and access level.
      </span>
    </section>
  </main>
}

const kpiCard: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '1rem' }
const infoCard: React.CSSProperties = { ...kpiCard, display: 'grid', gap: 5 }
function pill(active: boolean): React.CSSProperties { return { textDecoration: 'none', textTransform: 'capitalize', border: '1px solid var(--border)', borderRadius: 999, padding: '.45rem .7rem', fontSize: '.64rem', fontWeight: 850, color: active ? 'var(--surface)' : 'var(--muted)', background: active ? 'var(--primary)' : 'var(--surface)' } }
