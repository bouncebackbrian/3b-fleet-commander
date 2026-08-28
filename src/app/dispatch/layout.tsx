import AppShell from '@/components/layout/AppShell'
import { requirePortalPageAccess } from '@/lib/fleet-portal-page-guard'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePortalPageAccess('dispatch')
  return <AppShell>{children}</AppShell>
}
