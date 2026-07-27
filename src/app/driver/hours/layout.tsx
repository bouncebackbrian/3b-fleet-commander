import AppShell from '@/components/layout/AppShell'

export const metadata = { title: 'My Hours — 3B Fleet Commander' }

export default function DriverHoursLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
