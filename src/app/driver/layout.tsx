import type { ReactNode } from 'react'
import SafeDriveGuard from '@/components/driver/SafeDriveGuard'

export default function DriverLayout({ children }: { children: ReactNode }) {
  return <SafeDriveGuard>{children}</SafeDriveGuard>
}
