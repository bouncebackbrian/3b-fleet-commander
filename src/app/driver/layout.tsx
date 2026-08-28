import type { ReactNode } from 'react'
import SafeDriveGuard from '@/components/driver/SafeDriveGuard'
import MissedPunchGuard from '@/components/dumpTruck/MissedPunchGuard'
import { requirePortalPageAccess } from '@/lib/fleet-portal-page-guard'

export default async function DriverLayout({ children }: { children: ReactNode }) {
  await requirePortalPageAccess('driver')

  return (
    <SafeDriveGuard>
      {children}
      <MissedPunchGuard />
    </SafeDriveGuard>
  )
}
