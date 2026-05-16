import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import InstallBanner from '@/components/pwa/InstallBanner'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar />
      <div className="app-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <BottomNav />
      <InstallBanner />
    </div>
  )
}
