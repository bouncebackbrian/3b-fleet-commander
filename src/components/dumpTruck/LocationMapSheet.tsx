'use client'
import Sheet from './Sheet'
import { buildCoordNavLaunchOptions, formatCoordinates } from '@/lib/dumpTruck/navigation'
import { toast } from '@/hooks/useToast'

interface Props {
  lat: number
  lng: number
  label: string
  onClose: () => void
}

export default function LocationMapSheet({ lat, lng, label, onClose }: Props) {
  const options = buildCoordNavLaunchOptions(lat, lng, label)

  return (
    <Sheet title={label} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{formatCoordinates(lat, lng)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map(opt => (
            <button
              key={opt.provider}
              style={{
                minHeight: 56, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontWeight: 700, fontSize: '.95rem',
              }}
              onClick={() => {
                if (opt.url) window.open(opt.url, '_blank', 'noopener,noreferrer')
                else if (opt.copyValue) navigator.clipboard?.writeText(opt.copyValue).then(() => toast.success('Copied'))
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
