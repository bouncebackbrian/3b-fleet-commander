'use client'

import { useRouter } from 'next/navigation'
import { useDumpTruckDriver } from '@/hooks/useDumpTruckDriver'
import EndShiftExceptionSheet from '@/components/dumpTruck/EndShiftExceptionSheet'

export default function EndShiftExceptionPage() {
  const router = useRouter()
  const { loading, context, refetch } = useDumpTruckDriver()

  if (loading) {
    return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading…</div>
  }

  if (!context?.shift) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '1rem' }}>
        <div style={{ maxWidth: 460, width: '100%', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>No active shift</div>
          <div style={{ color: 'var(--muted)', marginTop: 6, fontSize: '.85rem' }}>A shutdown or asset-transfer closeout can only be recorded against an active driver shift.</div>
          <button onClick={() => router.replace('/driver/dump-truck')} style={{ marginTop: '1rem', width: '100%', minHeight: 46, borderRadius: 10, fontWeight: 800, background: 'var(--primary)', color: '#04140f' }}>
            Return to Driver Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)' }}>
      <EndShiftExceptionSheet
        shiftId={context.shift.id}
        onClose={() => router.replace('/driver/dump-truck')}
        onCompleted={async () => {
          await refetch()
          router.replace('/driver/dump-truck')
        }}
      />
    </div>
  )
}
