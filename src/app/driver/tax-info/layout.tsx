import AppShell from '@/components/layout/AppShell'

export const metadata = { title: 'Tax Info (W-9) — 3B Fleet Commander' }

export default function DriverTaxInfoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
