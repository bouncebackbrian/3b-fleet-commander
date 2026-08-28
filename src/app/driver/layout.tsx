import type { ReactNode } from 'react'
import MissedPunchGuard from '@/components/dumpTruck/MissedPunchGuard'

export default function DriverLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MissedPunchGuard />
    </>
  )
}
