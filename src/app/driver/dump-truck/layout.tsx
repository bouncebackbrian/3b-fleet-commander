export const metadata = {
  title: 'Dump Truck Mode — 3B Fleet Commander',
}

export default function DumpTruckDriverLayout({ children }: { children: React.ReactNode }) {
  // Deliberately no AppShell/Sidebar/BottomNav — Driver Mode is a dedicated
  // full-screen iPad-landscape cockpit (spec §5), not embedded app chrome.
  return <div style={{ minHeight: '100dvh' }}>{children}</div>
}
