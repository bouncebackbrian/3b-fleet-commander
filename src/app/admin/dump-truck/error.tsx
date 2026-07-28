'use client'
import RouteErrorFallback from '@/components/shared/RouteErrorFallback'

export default function DumpTruckAdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Dump Truck Setup hit an error"
      reassurance="Sites, jobs, and pay policy already saved are unaffected — this only crashed the setup screen."
    />
  )
}
