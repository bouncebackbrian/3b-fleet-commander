'use client'
import RouteErrorFallback from '@/components/shared/RouteErrorFallback'

export default function DriverHoursError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Hours screen hit an error"
      reassurance="Your recorded shifts are unaffected — this only crashed the hours summary view."
    />
  )
}
