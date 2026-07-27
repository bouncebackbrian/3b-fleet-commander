'use client'
import Sheet from './Sheet'
import { buildNavLaunchOptions } from '@/lib/dumpTruck/navigation'
import type { DumpTruckSite } from '@/lib/dumpTruck/types'
import { toast } from '@/hooks/useToast'

interface Props {
  site: DumpTruckSite
  onClose: () => void
  onLaunch: (provider: string, destination: string) => void
}

export default function NavigateSheet({ site, onClose, onLaunch }: Props) {
  const options = buildNavLaunchOptions(site)
  const hasRestrictions = site.routeNotes || Object.keys(site.restrictions ?? {}).length > 0 || site.avoidNotes

  return (
    <Sheet title={`Navigate to ${site.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {hasRestrictions && (
          <div style={{ padding: '.75rem', borderRadius: 10, background: 'rgba(245,194,0,.12)', border: '1px solid var(--warn)' }}>
            <div style={{ fontWeight: 800, fontSize: '.8rem', color: 'var(--warn)', marginBottom: 4 }}>⚠️ Truck route notes</div>
            {site.routeNotes && <div style={{ fontSize: '.82rem', marginBottom: 4 }}>{site.routeNotes}</div>}
            {site.avoidNotes && <div style={{ fontSize: '.82rem' }}>Avoid: {site.avoidNotes}</div>}
          </div>
        )}
        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
          Google Maps and Apple Maps are navigation launch options only — not verified truck-safe routing. Confirm the destination before launching.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map(opt => (
            <button
              key={opt.provider}
              style={{
                minHeight: 56, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontWeight: 700, fontSize: '.95rem',
              }}
              onClick={() => {
                if (opt.url) {
                  onLaunch(opt.provider, opt.url)
                  window.open(opt.url, '_blank', 'noopener,noreferrer')
                } else if (opt.copyValue) {
                  navigator.clipboard?.writeText(opt.copyValue).then(() => toast.success('Copied'))
                  onLaunch(opt.provider, opt.copyValue)
                }
              }}
              disabled={!opt.url && !opt.copyValue}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
