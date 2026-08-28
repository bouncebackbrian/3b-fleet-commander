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

  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '1.7rem clamp(1rem,3vw,2rem)', display: 'grid', gap: 26 }}>
      <header style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrow}>Performance</div>
          <h1 style={{ margin: '.25rem 0 .3rem', fontSize: 'clamp(1.9rem,4vw,2.7rem)', letterSpacing: '-.035em' }}>
            {lens === 'driver' ? 'Driver KPIs' : lens === 'dispatch' ? 'Dispatch KPIs' : 'Admin KPIs'}
          </h1>
          <p style={subtitle}>{mode ? `${mode.replaceAll('_', ' ')} performance view` : 'Company performance view'}</p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {lenses.length > 1 && lenses.map(item => (
            <Link key={item} href={`/kpis?lens=${item}${mode ? `&mode=${mode}` : ''}`} style={tab(item === lens)}>{item}</Link>
          ))}
        </div>
      </header>

      {lens !== 'driver' && (
        <nav style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }} aria-label="Asset mode filter">
          <Link href={`/kpis?lens=${lens}`} style={filter(!mode)}>All</Link>
          {ASSET_OPERATING_MODES.map(item => (
            <Link key={item} href={`/kpis?lens=${lens}&mode=${item}`} style={filter(mode === item)}>{item.replaceAll('_', ' ')}</Link>
          ))}
        </nav>
      )}

      {lens === 'driver' && currentAsset && (
        <div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Current asset · <strong style={{ color: 'var(--text)' }}>Unit {currentAsset.unitNumber}</strong></div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 0, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {kpis.slice(0, 4).map((kpi, index) => (
          <div key={kpi.label} style={{ padding: '1.25rem 1rem 1.2rem 0', borderRight: index < 3 ? '1px solid var(--border)' : undefined, minHeight: 112 }}>
            <div style={{ color: 'var(--muted)', fontSize: '.58rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>{kpi.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 950, marginTop: 8, letterSpacing: '-.04em' }}>—</div>
            <div style={{ color: 'var(--faint)', fontSize: '.64rem', marginTop: 5 }}>{kpi.hint}</div>
          </div>
        ))}
      </section>

      <section style={{ maxWidth: 760 }}>
        <div style={{ ...eyebrow, color: 'var(--muted)' }}>How this view works</div>
        <p style={{ ...subtitle, marginTop: 8, lineHeight: 1.6 }}>
          KPIs use the same evidence and date-range sources as Reports. The visible measurements change by role and asset classification so Driver, Dispatch and Admin each see the performance indicators relevant to their work.
        </p>
      </section>
    </main>
  )
}

const eyebrow: React.CSSProperties = { color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.13em', textTransform: 'uppercase' }
const subtitle: React.CSSProperties = { color: 'var(--muted)', margin: 0, fontSize: '.8rem' }
function tab(active: boolean): React.CSSProperties { return { textDecoration: 'none', textTransform: 'capitalize', borderRadius: 9, padding: '.48rem .7rem', fontSize: '.65rem', fontWeight: 850, color: active ? 'var(--text)' : 'var(--muted)', background: active ? 'rgba(0,232,176,.08)' : 'transparent' } }
function filter(active: boolean): React.CSSProperties { return { textDecoration: 'none', textTransform: 'capitalize', whiteSpace: 'nowrap', borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent', padding: '.4rem .15rem', marginRight: 10, fontSize: '.66rem', fontWeight: active ? 900 : 700, color: active ? 'var(--text)' : 'var(--muted)' } }
