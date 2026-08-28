import type { ReactNode } from 'react'
import SafeDriveGuard from '@/components/driver/SafeDriveGuard'
import MissedPunchGuard from '@/components/dumpTruck/MissedPunchGuard'

export default function DriverLayout({ children }: { children: ReactNode }) {
  return (
    <SafeDriveGuard>
      {children}
      <MissedPunchGuard />
    </SafeDriveGuard>
  )
}
