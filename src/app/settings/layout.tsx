import Sidebar from '@/components/layout/Sidebar'
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', minHeight:'100dvh' }}>
      <Sidebar />
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        {children}
      </div>
    </div>
  )
}
