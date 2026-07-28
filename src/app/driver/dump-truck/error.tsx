'use client'
import RouteErrorFallback from '@/components/shared/RouteErrorFallback'

export default function DumpTruckDriverError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Dump Truck screen hit an error"
      reassurance="Any events you already recorded today were saved to this device and are not lost — tap Try Again, and if the truck is moving, wait until you're stopped first."
    />
  )
}
