import AppShell from '@/components/layout/AppShell'
import DriverModeGuard from '@/components/guards/DriverModeGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell><DriverModeGuard>{children}</DriverModeGuard></AppShell>
}
