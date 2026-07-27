'use client'
import type { PrimaryActionSpec } from '@/lib/dumpTruck/stateMachine'

interface Props {
  action: PrimaryActionSpec
  busy: boolean
  disabledReason: string | null
  onPrimary: () => void
  onSecondary: () => void
}

export default function CenterAction({ action, busy, disabledReason, onPrimary, onSecondary }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
      <button className="dt-primary-btn" disabled={busy || !!disabledReason} onClick={onPrimary}>
        {busy ? 'Saving…' : action.label}
      </button>

      {action.secondary && (
        <button className="dt-secondary-btn" disabled={busy || !!disabledReason} onClick={onSecondary}>
          {action.secondary.label}
        </button>
      )}

      {disabledReason && (
        <div style={{
          maxWidth: 480, textAlign: 'center', fontSize: '.85rem', fontWeight: 700,
          color: 'var(--error)', background: 'rgba(232,64,0,.1)', padding: '.6rem 1rem', borderRadius: 10,
        }}>
          ⚠️ {disabledReason}
        </div>
      )}

      <div style={{
        fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', maxWidth: 420,
      }}>
        Never interact with this screen while the truck is moving.
      </div>
    </div>
  )
}
