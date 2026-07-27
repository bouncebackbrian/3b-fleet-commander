import AppShell from '@/components/layout/AppShell'

export const metadata = { title: 'Dump Truck Setup — 3B Fleet Commander' }

export default function DumpTruckAdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
